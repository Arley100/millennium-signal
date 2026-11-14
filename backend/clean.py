"""DATA step: load the two exports and make them trustworthy.

Every change is recorded in a cleaning log (what, how many rows, why),
so the app can show the judges exactly what we did to the data.
"""
from pathlib import Path

import numpy as np
import pandas as pd

EXTRACT_DATE = pd.Timestamp("2026-10-31")  # date the data was pulled (from the brief)

CITY_MAP = {
    "toronto": "Toronto",
    "montreal": "Montreal", "montréal": "Montreal", "mtl": "Montreal",
    "ottawa": "Ottawa",
    "calgary": "Calgary",
    "quebec city": "Quebec City", "québec city": "Quebec City",
    "quebec": "Quebec City", "qc city": "Quebec City",
}


def parse_dates(col: pd.Series) -> tuple[pd.Series, int]:
    """The systems mix two formats: 2024-11-01 and 15/11/2024 (day first).
    Parse each format explicitly so 05/02/2025 is read as 5 February, not May 2."""
    iso = pd.to_datetime(col, format="%Y-%m-%d", errors="coerce")
    dmy = pd.to_datetime(col, format="%d/%m/%Y", errors="coerce")
    n_dmy = int((iso.isna() & dmy.notna()).sum())
    return iso.fillna(dmy), n_dmy


def load_and_clean(data_dir: str | Path = "data"):
    data_dir = Path(data_dir)
    pol = pd.read_csv(data_dir / "policies.csv")
    clm = pd.read_csv(data_dir / "claims.csv")
    log = []

    def note(step, rows, why, effect=""):
        log.append({"Step": step, "Rows affected": rows, "Why": why, "Effect on findings": effect})

    # 1. Exact duplicate claims: the same claim exported twice would double-count money paid.
    n = int(clm.duplicated().sum())
    clm = clm.drop_duplicates().copy()
    note("Removed exact duplicate claim rows", n,
         "Same claim exported twice; keeping both would double-count claims paid.",
         "Claims paid would otherwise be overstated.")

    # 2. Test records left in the policy system.
    test = pol.policy_id.str.upper().str.startswith("TEST")
    n = int(test.sum())
    pol = pol[~test].copy()
    clm = clm[clm.policy_id.isin(pol.policy_id)].copy()
    note("Removed test policies (TEST-1 to TEST-4, $0 premium)", n,
         "System test rows, not real customers.", "Would lower average premium slightly.")

    # 3. City names typed many different ways.
    raw_variants = pol.city.nunique()
    std = pol.city.astype(str).str.strip().str.lower().map(CITY_MAP)
    n = int((std != pol.city).sum())
    pol["city"] = std.fillna(pol.city)
    note(f"Standardised city names ({raw_variants} spellings → 5 cities)", n,
         "'MTL', 'Montréal', 'toronto ' are the same city; grouping by city was wrong without this.",
         "Each city's totals were split across several labels.")

    # 4. Premiums stored as text such as "$1,046.62".
    txt = pd.to_numeric(pol.annual_premium, errors="coerce").isna()
    n = int(txt.sum())
    pol["annual_premium"] = pd.to_numeric(
        pol.annual_premium.astype(str).str.replace(r"[$,\s]", "", regex=True), errors="coerce")
    note("Converted text premiums ('$1,046.62') to numbers", n,
         "Text values are ignored by sums, so premium income was understated.",
         "Claims paid ÷ premium would have looked worse than reality.")

    # 5. Mixed date formats.
    pol["start_date"], n1 = parse_dates(pol.start_date)
    total = n1
    for c in ["loss_date", "reported_date", "closed_date"]:
        clm[c], k = parse_dates(clm[c])
        total += k
    note("Read day-first dates (15/11/2024) correctly", total,
         "Two date formats are mixed; guessing would swap day and month.",
         "Days-from-policy-start depends on correct dates.")

    # 6. Impossible ages.
    bad_age = pol.customer_age < 16
    n = int(bad_age.sum())
    pol.loc[bad_age, "customer_age"] = np.nan
    note("Set impossible ages (0, 7) to missing", n,
         "A 7-year-old cannot hold a policy; likely data-entry errors.", "Age is not used in detections.")

    # 7. Claims reported before the loss happened: keep, but mark.
    clm["data_issue"] = ""
    bad = clm.reported_date < clm.loss_date
    clm.loc[bad, "data_issue"] = "reported before loss"
    note("Marked claims reported before the loss date", int(bad.sum()),
         "Impossible order of events; kept (money was paid) but marked for follow-up.", "None.")

    # 8. Paid claims with no claim amount.
    miss = clm.claim_amount.isna()
    clm.loc[miss, "data_issue"] = "missing claim amount"
    note("Kept paid claims with a missing claim amount", int(miss.sum()),
         "They still count in money paid, but cannot be checked against the $10,000 threshold.",
         "Excluded only from the amount-based detection.")

    # 9. Earned premium: a policy sold in September has only earned 2 months of premium by Oct 31.
    days_in_force = (EXTRACT_DATE - pol.start_date).dt.days.clip(lower=0, upper=365)
    pol["earned_premium"] = pol.annual_premium * days_in_force / 365
    note("Calculated earned premium (premium × share of the year elapsed)", len(pol),
         "New 2026 policies have not paid a full year yet; comparing claims to full premium hides losses.",
         "Without this, new brokers look far healthier than they are.")

    pol["source"] = np.where(pol.channel == "Broker", pol.broker_code.fillna("Broker ?"), pol.channel)

    # Join claims to the policy they belong to.
    claims = clm.merge(
        pol[["policy_id", "customer_id", "city", "policy_type", "risk_band", "channel",
             "broker_code", "source", "start_date", "deductible", "annual_premium"]],
        on="policy_id", how="left")
    claims["days_from_start"] = (claims.loss_date - claims.start_date).dt.days
    claims["days_to_close"] = (claims.closed_date - claims.reported_date).dt.days
    claims["days_open"] = np.where(claims.closed_date.isna(),
                                   (EXTRACT_DATE - claims.reported_date).dt.days, np.nan)
    claims["paid_amount_filled"] = claims.paid_amount.fillna(0)

    return pol, claims, pd.DataFrame(log)
