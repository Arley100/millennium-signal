"""Millennium Signal — finds where Millennium Mutual's money is going and acts on it.

Run:  streamlit run app.py
Flow: DATA (clean.py) → DETECT (detect.py) → DECIDE (thresholds in sidebar) → ACT (actions.py)
"""
import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

import actions as act
from clean import EXTRACT_DATE, load_and_clean
from detect import aging_open_claims, broker_scorecard, flag_reasons, flag_suspicious_claims

st.set_page_config(page_title="Millennium Signal", page_icon="📡", layout="wide")

RED, GREY, BLUE, GREEN = "#ff4b6e", "#5b6170", "#4cc9f0", "#3ddc97"
PLOT = dict(template="plotly_dark", paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
            margin=dict(l=10, r=10, t=40, b=10), font=dict(size=13))


@st.cache_data
def load():
    return load_and_clean("data")


policies, claims, cleaning_log = load()

# ---------------------------------------------------------------- DECIDE: settings
with st.sidebar:
    st.markdown("### 📡 Millennium Signal")
    st.caption(f"Data extracted {EXTRACT_DATE:%b %d, %Y} · {len(policies):,} policies · {len(claims):,} claims")
    st.markdown("#### Decision rules")
    threshold = st.number_input("Senior-review threshold ($)", 1_000, 50_000, 10_000, 500,
                                help="Company rule: claims at or above this go to senior review.")
    window = st.slider("Early claim = loss within (days of policy start)", 15, 180, 60, 5)
    band = st.slider("'Just under the line' = within (% below threshold)", 5, 50, 25, 5) / 100
    multiple = st.slider("Broker flagged when metrics are ≥ × typical broker", 1.5, 4.0, 2.0, 0.25)
    reviewer = st.text_input("Reviewer name (for the log)", "Senior reviewer")

# ---------------------------------------------------------------- DETECT
flags = flag_suspicious_claims(claims, window, threshold, band).fillna(False).astype(bool)
claims["flagged"] = flags
claims["reason"] = np.where(flags, flag_reasons(claims, window, threshold, band), "")
scorecard, typical = broker_scorecard(policies, claims, flags, window, multiple)
flagged_brokers = scorecard[scorecard.broker_flag].index.tolist()
flagged_claims = claims[claims.flagged]

# ---------------------------------------------------------------- ACT (automatic part)
log = act.read_log()
already = set(log.loc[log.action.str.startswith("Auto-routed", na=False), "target"]) if len(log) else set()
for _, r in flagged_claims[~flagged_claims.claim_id.isin(already)].iterrows():
    act.log_action("Auto-routed to senior review", r.claim_id, act.route_action(r.status))
    act.log_action("Alert queued", r.claim_id, f"To {act.SENIOR_REVIEW}")
already_b = set(log.loc[log.action.str.startswith("Broker alert", na=False), "target"]) if len(log) else set()
for b in flagged_brokers:
    if b not in already_b:
        act.log_action("Broker alert queued", b, f"To {act.HEAD_DISTRIBUTION} and VP of Claims")

with st.sidebar:
    st.markdown("#### What these rules catch")
    st.metric("Claims flagged", f"{len(flagged_claims)}",
              help="Changes live as you move the sliders above.")
    st.metric("Money paid on flagged claims", f"${flagged_claims.paid_amount_filled.sum():,.0f}")
    st.metric("Brokers flagged", ", ".join(flagged_brokers) or "none")
    if flags.sum() == 0:
        st.warning("Detection 1 returns no flags. Has the team written it in detect.py?")

# ---------------------------------------------------------------- HEADER
st.title("Millennium Signal")
st.markdown("> *“We’re writing more business than ever and making less money on it. "
            "I want to know where the money is going.”* — CFO, Millennium Mutual")

tab1, tab2, tab3, tab4, tab5, tab6 = st.tabs(
    ["① Where the money goes", "② The pattern", "③ Review queue", "④ Claim delays",
     "⑤ Data & cleaning", "Action log"])

# ================================================================ TAB 1
with tab1:
    p = policies
    ytd25 = p[(p.start_date >= "2025-01-01") & (p.start_date <= "2025-10-31")]
    ytd26 = p[(p.start_date >= "2026-01-01") & (p.start_date <= "2026-10-31")]
    total_lr = claims.paid_amount_filled.sum() / p.earned_premium.sum()
    ok_pol = p[~p.source.isin(flagged_brokers)]
    ok_clm = claims[~claims.source.isin(flagged_brokers)]
    clean_lr = ok_clm.paid_amount_filled.sum() / ok_pol.earned_premium.sum()

    k1, k2, k3, k4 = st.columns(4)
    k1.metric("Policies sold Jan–Oct 2026", f"{len(ytd26):,}", f"{len(ytd26) / len(ytd25) - 1:+.0%} vs 2025")
    k2.metric("Claims paid ÷ premium earned", f"{total_lr:.0%}", help="Share of earned premium paid back out in claims. A diagnostic, not a full loss ratio or profit.")
    k3.metric(f"Same, without {', '.join(flagged_brokers) or 'flagged brokers'}", f"{clean_lr:.0%}",
              f"{clean_lr - total_lr:+.0%}", delta_color="inverse")
    k4.metric("Paid on flagged claims", f"${flagged_claims.paid_amount_filled.sum():,.0f}")

    c1, c2 = st.columns([3, 2])
    with c1:
        sc = scorecard.reset_index().rename(columns={"source": "Sales source"})
        sc["colour"] = np.select([sc.broker_flag, ~sc.is_broker], ["Flagged broker", "Own channel"], "Broker")
        fig = px.bar(sc.sort_values("loss_ratio"), x="loss_ratio", y="Sales source", color="colour",
                     orientation="h", text=sc.sort_values("loss_ratio").loss_ratio.map("{:.0%}".format),
                     color_discrete_map={"Flagged broker": RED, "Broker": GREY, "Own channel": BLUE},
                     title="Claims paid for every $1 of premium earned, by who sold the policy")
        fig.add_vline(x=1, line_dash="dash", line_color="white",
                      annotation_text="break-even before costs", annotation_position="top")
        fig.update_layout(**PLOT, xaxis_tickformat=".0%", legend_title=None, height=430,
                          xaxis_title=None, yaxis_title=None)
        st.plotly_chart(fig, width="stretch")
    with c2:
        q = p.assign(quarter=p.start_date.dt.to_period("Q").astype(str),
                     who=np.where(p.source.isin(flagged_brokers), "Flagged broker", "Everyone else"))
        q = q[q.start_date < "2026-10-01"].groupby(["quarter", "who"]).size().reset_index(name="policies")
        fig = px.bar(q, x="quarter", y="policies", color="who", title="Policies sold per quarter",
                     color_discrete_map={"Flagged broker": RED, "Everyone else": GREY})
        fig.update_layout(**PLOT, legend_title=None, height=430, xaxis_title=None)
        st.plotly_chart(fig, width="stretch")

    st.info(f"**Insight 1.** Growth is real, but one new broker partner "
            f"({', '.join(flagged_brokers) or '—'}) pays out far more than it brings in. "
            f"The other brokers perform like the company's own agents, so the broker channel "
            f"itself is not the problem. **Do:** review that account, not the whole channel.")

# ================================================================ TAB 2
with tab2:
    st.subheader("Why these claims slip through")
    st.caption(f"Claims under ${threshold:,.0f} are approved by the adjuster team alone. "
               f"Claims at or above it go to senior review.")
    c1, c2 = st.columns(2)
    amt = claims.dropna(subset=["claim_amount"]).copy()
    amt["Group"] = np.where(amt.flagged, "Flagged", "Other claims")
    with c1:
        fig = px.histogram(amt[amt.claim_amount < 25_000], x="claim_amount", color="Group",
                           nbins=50, color_discrete_map={"Flagged": RED, "Other claims": GREY},
                           title="Claim amounts: a pile-up just under the review line")
        fig.add_vline(x=threshold, line_dash="dash", line_color="white",
                      annotation_text="senior review starts", annotation_position="top right")
        fig.update_layout(**PLOT, xaxis_tickprefix="$", legend_title=None, height=420,
                          xaxis_title="Claim amount", yaxis_title="Claims")
        st.plotly_chart(fig, width="stretch")
    with c2:
        fig = px.scatter(amt[amt.claim_amount < 25_000], x="days_from_start", y="claim_amount",
                         color="Group", hover_data=["claim_id", "source", "claim_type"],
                         color_discrete_map={"Flagged": RED, "Other claims": GREY}, opacity=0.75,
                         title="Early and just-under-the-line: the flagged zone")
        fig.add_shape(type="rect", x0=0, x1=window, y0=threshold * (1 - band), y1=threshold,
                      line=dict(color=RED, dash="dot"))
        fig.add_hline(y=threshold, line_dash="dash", line_color="white")
        fig.update_layout(**PLOT, yaxis_tickprefix="$", legend_title=None, height=420,
                          xaxis_title="Days from policy start to loss", yaxis_title="Claim amount")
        st.plotly_chart(fig, width="stretch")

    st.markdown("#### Broker scorecard (Detection 2)")
    show = scorecard[scorecard.is_broker][["policies", "first_sale", "loss_ratio", "claim_rate",
                                           "early_share", "flagged_claims", "warning_signs", "broker_flag"]]
    st.dataframe(show.style.format({"loss_ratio": "{:.0%}", "claim_rate": "{:.0%}", "early_share": "{:.0%}",
                                    "first_sale": "{:%Y-%m-%d}", "flagged_claims": "{:.0f}"})
                 .apply(lambda r: [f"background-color: {RED}33" if r.broker_flag else "" for _ in r], axis=1),
                 width="stretch")
    st.caption(f"Typical broker: loss ratio {typical.loss_ratio:.0%}, claim rate {typical.claim_rate:.0%}, "
               f"early claims {typical.early_share:.0%}. A broker is flagged when 2 of 3 metrics are "
               f"≥ {multiple}× typical and it has at least 10 claims.")

# ================================================================ TAB 3
with tab3:
    st.subheader("Review queue")
    st.caption("Every flagged claim is routed automatically and an alert is drafted. "
               "A person makes the final call; nothing is denied by the system.")
    decisions = act.read_decisions()
    queue = flagged_claims.assign(
        action=flagged_claims.status.map(act.route_action),
        decision=flagged_claims.claim_id.map(decisions).fillna("Awaiting review"))
    m1, m2, m3 = st.columns(3)
    m1.metric("In queue", (queue.decision == "Awaiting review").sum())
    m2.metric("Holds confirmed", (queue.decision == "Confirm hold").sum())
    m3.metric("Released", (queue.decision == "Release").sum())
    st.dataframe(queue[["claim_id", "source", "city", "claim_type", "claim_amount", "days_from_start",
                        "status", "action", "decision"]].sort_values("claim_amount", ascending=False)
                 .style.format({"claim_amount": "${:,.0f}"}), width="stretch", height=260)

    if len(queue):
        c1, c2 = st.columns([3, 2])
        with c1:
            pick = st.selectbox("Open a claim", queue.claim_id.tolist())
            row = queue.set_index("claim_id").loc[pick]
            row["claim_id"] = pick
            st.text_area("Drafted alert", act.claim_alert(row, row.reason), height=230)
        with c2:
            note = st.text_input("Reviewer note", key="note")
            b1, b2 = st.columns(2)
            if b1.button("Confirm hold", type="primary", width="stretch"):
                act.record_decision(pick, "Confirm hold", reviewer, note)
                st.rerun()
            if b2.button("Release", width="stretch"):
                act.record_decision(pick, "Release", reviewer, note)
                st.rerun()
            st.caption("If the system is wrong, the reviewer releases the claim and the "
                       "decision is logged, so the rule can be tuned.")

    st.markdown("#### Broker alerts")
    for b in flagged_brokers:
        with st.expander(f"⚠️ {b}: drafted message to Head of Distribution", expanded=True):
            st.text(act.broker_alert(b, scorecard.loc[b], typical))

    st.markdown("#### Try it: a new claim comes in")
    with st.form("intake"):
        f1, f2, f3, f4 = st.columns(4)
        opts = policies.sort_values("start_date", ascending=False).reset_index(drop=True)
        demo_src = flagged_brokers[0] if flagged_brokers else "Agent"
        pol_id = f1.selectbox("Policy (newest first)", opts.policy_id.tolist(),
                              index=int(opts.source.eq(demo_src).idxmax()),
                              format_func=lambda x: f"{x} · {opts.set_index('policy_id').source[x]}")
        loss = f2.date_input("Date of loss", EXTRACT_DATE)
        amount = f3.number_input("Claim amount ($)", 100.0, 200_000.0, 9_400.0, 100.0)
        ctype = f4.selectbox("Type", sorted(claims.claim_type.dropna().unique()))
        go_ = st.form_submit_button("Submit claim")
    if go_:
        pr = policies.set_index("policy_id").loc[pol_id]
        new = pd.DataFrame([{"claim_id": "NEW-" + pd.Timestamp.now().strftime("%H%M%S"), "policy_id": pol_id,
                             "claim_type": ctype, "claim_amount": amount, "status": "Open",
                             "adjuster_team": "-", "loss_date": pd.Timestamp(loss),
                             "days_from_start": (pd.Timestamp(loss) - pr.start_date).days,
                             **{k: pr[k] for k in ["source", "city", "policy_type", "risk_band"]}}])
        hit = bool(flag_suspicious_claims(new, window, threshold, band).iloc[0])
        r = new.iloc[0]
        if hit:
            reason = flag_reasons(new, window, threshold, band).iloc[0]
            st.error(f"🚩 Flagged → payment held, routed to {act.SENIOR_REVIEW}. {reason}.")
            st.text(act.claim_alert(r, reason))
            act.log_action("Auto-routed to senior review", r.claim_id, "Hold payment → senior review (live intake)")
            act.log_action("Alert queued", r.claim_id, f"To {act.SENIOR_REVIEW}")
        elif amount >= threshold:
            st.warning("At or above the threshold → senior review under the existing company rule.")
        else:
            st.success(f"Not flagged → normal adjuster approval. Policy started "
                       f"{r.days_from_start} days before the loss.")

# ================================================================ TAB 4
with tab4:
    st.subheader("Insight 2: slow claims cost renewals")
    c = claims.dropna(subset=["reported_date"]).copy()
    c["quarter"] = c.reported_date.dt.to_period("Q").astype(str)
    team_city = c.groupby("adjuster_team").city.agg(lambda s: ", ".join(sorted(s.dropna().unique())))
    c["team"] = c.adjuster_team + " (" + c.adjuster_team.map(team_city) + ")"
    t = c[c.quarter < "2026Q4"].groupby(["quarter", "team"]).days_to_close.median().reset_index()
    c1, c2 = st.columns(2)
    with c1:
        fig = px.line(t, x="quarter", y="days_to_close", color="team", markers=True,
                      title="Median days to settle a claim, by adjuster team",
                      color_discrete_sequence=[GREY, BLUE, RED])
        fig.update_layout(**PLOT, legend_title=None, height=400, xaxis_title="Quarter reported",
                          yaxis_title="Days")
        st.plotly_chart(fig, width="stretch")
    with c2:
        ended = policies[policies.renewal_status.isin(["Renewed", "Not Renewed"])]
        wait = claims.groupby("policy_id").days_to_close.max()
        e = ended.assign(wait=ended.policy_id.map(wait))
        e["Longest claim wait"] = pd.cut(e.wait.fillna(-1), [-2, -0.5, 14, 30, 1e4],
                                         labels=["No claim", "≤ 14 days", "15–30 days", "> 30 days"])
        r = e.groupby("Longest claim wait", observed=True).agg(
            renewal=("renewal_status", lambda s: (s == "Renewed").mean()), n=("policy_id", "count")).reset_index()
        fig = px.bar(r, x="Longest claim wait", y="renewal", text=r.renewal.map("{:.0%}".format),
                     color="Longest claim wait", title="Renewal rate by how long the customer waited",
                     color_discrete_sequence=[GREY, GREY, GREY, RED], hover_data=["n"])
        fig.update_layout(**PLOT, showlegend=False, yaxis_tickformat=".0%", height=400, yaxis_title=None)
        st.plotly_chart(fig, width="stretch")
    aging = aging_open_claims(claims, 30)
    st.markdown(f"**Open claims waiting more than 30 days: {len(aging)}**")
    st.dataframe(aging[["claim_id", "adjuster_team", "city", "claim_type", "claim_amount", "days_open", "status"]]
                 .style.format({"claim_amount": "${:,.0f}", "days_open": "{:.0f}"}),
                 width="stretch", height=240)
    st.info("**Insight 2.** The VP of Claims and the Head of Retention describe the same problem. "
            "One team's settlement time has roughly doubled in 2026, and customers who wait over "
            "30 days renew far less often. **Do:** rebalance claims to that team before hiring "
            "everywhere, and alert when a claim passes 30 days open.")

# ================================================================ TAB 5
with tab5:
    st.subheader("What we changed in the data, and why")
    st.dataframe(cleaning_log, width="stretch", hide_index=True)
    st.caption("Raw exports: policies.csv and claims.csv, pulled from Millennium Mutual's systems "
               "on Oct 31, 2026. No data dictionary was provided; meanings were inferred from values.")

# ================================================================ TAB 6
with tab6:
    st.subheader("Action log")
    st.caption("Every automatic action and every human decision, newest first.")
    st.dataframe(act.read_log(), width="stretch", hide_index=True, height=500)
