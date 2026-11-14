"""DETECT step: two business conditions.

Detection 1 (claim level)  - written by our team, see flag_suspicious_claims().
Detection 2 (broker level) - compares each broker with the typical broker.
"""
import numpy as np
import pandas as pd


# ---------------------------------------------------------------------------
# DETECTION 1 — TEAM-WRITTEN RULE
# ---------------------------------------------------------------------------
def flag_suspicious_claims(claims: pd.DataFrame, window_days: int = 60,
                           threshold: float = 10_000, band_pct: float = 0.25) -> pd.Series:
    """Return True for each claim that matches BOTH warning signs:

    1. Early claim: the loss happened within `window_days` days of the policy start
       (column `days_from_start`).
    2. Just under the review line: `claim_amount` is between
       threshold * (1 - band_pct) and just below `threshold`
       (with the defaults: $7,500 to $9,999.99), so it avoids senior review.

    Must return a True/False Series with the same index as `claims`.
    Claims with a missing amount should come out False.
    """
    # TODO (team): write the rule here, then delete the line below.
    return pd.Series(False, index=claims.index)


def flag_reasons(claims: pd.DataFrame, window_days, threshold, band_pct) -> pd.Series:
    """Plain-English reason shown to the reviewer for each flagged claim."""
    low = threshold * (1 - band_pct)
    return ("Loss " + claims.days_from_start.astype("Int64").astype(str)
            + f" days after policy start (≤ {window_days}); amount $"
            + claims.claim_amount.map("{:,.0f}".format)
            + f" sits just under the ${threshold:,.0f} senior-review line (≥ ${low:,.0f})")


# ---------------------------------------------------------------------------
# DETECTION 2 — BROKER SCORECARD
# ---------------------------------------------------------------------------
def broker_scorecard(policies: pd.DataFrame, claims: pd.DataFrame, flags: pd.Series,
                     window_days: int, multiple: float = 2.0, min_claims: int = 10) -> pd.DataFrame:
    """One row per sales source (each broker, plus Agent and Online for comparison).

    A broker is flagged when at least 2 of its 3 warning metrics are `multiple` times
    higher than the typical (median) broker, and it has enough claims to judge.
    Nothing is hard-coded: any broker that behaves this way will surface.
    """
    c = claims.assign(flagged=flags.values,
                      early=claims.days_from_start <= window_days)
    pol = policies.groupby("source").agg(
        policies=("policy_id", "count"),
        first_sale=("start_date", "min"),
        premium_earned=("earned_premium", "sum"))
    clm = c.groupby("source").agg(
        claims=("claim_id", "count"),
        paid=("paid_amount_filled", "sum"),
        early_share=("early", "mean"),
        flagged_claims=("flagged", "sum"),
        flagged_paid=("paid_amount_filled", lambda s: s[c.loc[s.index, "flagged"]].sum()))
    sc = pol.join(clm).fillna({"claims": 0, "paid": 0, "early_share": 0,
                               "flagged_claims": 0, "flagged_paid": 0})
    sc["loss_ratio"] = sc.paid / sc.premium_earned
    sc["claim_rate"] = sc.claims / sc.policies
    sc["flagged_share"] = sc.flagged_claims / sc.claims.replace(0, np.nan)
    sc["is_broker"] = ~sc.index.isin(["Agent", "Online"])

    brokers = sc[sc.is_broker]
    metrics = ["loss_ratio", "claim_rate", "early_share"]
    typical = brokers[metrics].median()
    for m in metrics:
        sc[f"{m}_vs_typical"] = sc[m] / typical[m]
    sc["warning_signs"] = sum((sc[f"{m}_vs_typical"] >= multiple).astype(int) for m in metrics)
    sc["broker_flag"] = sc.is_broker & (sc.warning_signs >= 2) & (sc.claims >= min_claims)
    return sc.sort_values("loss_ratio", ascending=False), typical


# ---------------------------------------------------------------------------
# Supporting condition for insight 2 — claims waiting too long
# ---------------------------------------------------------------------------
def aging_open_claims(claims: pd.DataFrame, max_days: int = 30) -> pd.DataFrame:
    open_ = claims[claims.status.isin(["Open", "Under Review"])]
    return open_[open_.days_open > max_days].sort_values("days_open", ascending=False)
