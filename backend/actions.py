"""ACT step: what happens automatically when a condition is detected.

Chain: flagged claim -> routed to senior review queue -> alert drafted for the
reviewer -> human decides (confirm hold / release) -> every step logged.
Messages go to an outbox file instead of real email/SMS for the demo.
"""
import os
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path

import pandas as pd

# Local runs keep the logs next to the code. On Vercel the code folder is read-only,
# so logs go to the temporary folder (they last only as long as the server instance).
LOG_DIR = Path("/tmp/millennium-logs") if os.environ.get("VERCEL") else Path(__file__).resolve().parent / "logs"
ACTION_LOG = LOG_DIR / "action_log.csv"
DECISIONS = LOG_DIR / "decisions.csv"

# Every log time is Eastern (Montreal / Toronto / Ottawa), whatever clock the server
# runs on. Vercel's servers use UTC, which made the hosted log five hours ahead.
TIMEZONE = ZoneInfo("America/Toronto")


def now() -> str:
    return datetime.now(TIMEZONE).strftime("%Y-%m-%d %H:%M:%S")


SENIOR_REVIEW = "Senior Claims Review"
HEAD_DISTRIBUTION = "Head of Distribution"


def _append(path: Path, row: dict):
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame([row])
    df.to_csv(path, mode="a", header=not path.exists(), index=False)


def log_action(action: str, target: str, detail: str, by: str = "system"):
    _append(ACTION_LOG, {"time": now(),
                         "by": by, "action": action, "target": target, "detail": detail})


def read_log() -> pd.DataFrame:
    if ACTION_LOG.exists():
        return pd.read_csv(ACTION_LOG).iloc[::-1]
    return pd.DataFrame(columns=["time", "by", "action", "target", "detail"])


def read_decisions() -> dict:
    if DECISIONS.exists():
        d = pd.read_csv(DECISIONS)
        return dict(zip(d.claim_id, d.decision))
    return {}


def record_decision(claim_id: str, decision: str, reviewer: str, note: str):
    _append(DECISIONS, {"time": now(),
                        "claim_id": claim_id, "decision": decision,
                        "reviewer": reviewer, "note": note})
    log_action(f"Human decision: {decision}", claim_id, note or "-", by=reviewer)


def route_action(status: str) -> str:
    """What the system does depends on where the claim is in its life."""
    if status in ("Open", "Under Review"):
        return "Hold payment → senior review"
    return "Already paid → audit & recovery review"


def claim_alert(row: pd.Series, reason: str) -> str:
    return (
        f"To: {SENIOR_REVIEW}\n"
        f"Subject: Claim {row.claim_id} held for review ({row.claim_type}, ${row.claim_amount:,.0f})\n\n"
        f"Millennium Signal flagged claim {row.claim_id} on policy {row.policy_id}.\n"
        f"Why: {reason}.\n"
        f"Sold by: {row.source} · {row.city} · {row.policy_type} · risk band {row.risk_band}\n"
        f"Status: {row.status} · Adjuster team: {row.adjuster_team}\n"
        f"Action taken: {route_action(row.status)}.\n\n"
        f"Please confirm the hold or release it in the review queue. "
        f"A flag is not a fraud finding: it only asks for a second look."
    )


def broker_alert(name: str, r: pd.Series, typical: pd.Series) -> str:
    return (
        f"To: {HEAD_DISTRIBUTION}; VP of Claims\n"
        f"Subject: Broker {name} needs review before new policies are bound\n\n"
        f"Since its first sale on {r.first_sale:%b %d, %Y}, {name} has sold {int(r.policies)} policies.\n"
        f"• Claims paid vs premium earned: {r.loss_ratio:.0%} (typical broker {typical.loss_ratio:.0%})\n"
        f"• Policies with a claim: {r.claim_rate:.0%} (typical {typical.claim_rate:.0%})\n"
        f"• Claims soon after the policy started: {r.early_share:.0%} (typical {typical.early_share:.0%})\n"
        f"• Claims just under the $10,000 review line: {int(r.flagged_claims)} (${r.flagged_paid:,.0f} paid)\n\n"
        f"Recommendation: keep selling through brokers, but route {name}'s new policies and claims "
        f"through senior review until the account is audited."
    )


# ---------------------------------------------------------------------------
# Aging Claim Alert (team-written detection: detect.aging_open_claims)
# ---------------------------------------------------------------------------
VP_CLAIMS = "VP of Claims"
RETENTION = "Retention team"


def aging_alert(row: pd.Series, max_days: int, to_team: str) -> str:
    amount = "amount not recorded" if pd.isna(row.claim_amount) else f"${row.claim_amount:,.0f}"
    return (
        f"To: {VP_CLAIMS}\n"
        f"Subject: Claim {row.claim_id} has waited {int(row.days_open)} days ({row.adjuster_team})\n\n"
        f"Claim {row.claim_id} ({row.claim_type}, {amount}) on policy {row.policy_id} was reported "
        f"{row.reported_date:%b %d, %Y} and is still '{row.status}' after {int(row.days_open)} days. "
        f"Our limit is {max_days} days.\n"
        f"Handled by: {row.adjuster_team} · {row.city}\n\n"
        f"Suggested action: reassign this claim to {to_team}, which has capacity "
        f"(fewest open claims and the fastest settlement time this year).\n"
        f"Context: in this data, customers who waited over 30 days renewed 45% of the time, "
        f"against 83% for those who wait 15 to 30 days."
    )


def retention_note(row: pd.Series) -> str:
    return (
        f"To: {RETENTION}\n"
        f"Subject: Please contact customer {row.customer_id} about claim {row.claim_id}\n\n"
        f"Customer {row.customer_id} ({row.city}, {row.policy_type} policy {row.policy_id}) has been "
        f"waiting {int(row.days_open)} days for a {row.claim_type} claim.\n"
        f"Please call to apologise for the delay, confirm the claim is being moved to a team "
        f"with capacity, and give a named contact. Long waits are associated with lower renewal in our data."
    )


def senior_alert(row: pd.Series, threshold: float) -> str:
    return (
        f"To: {SENIOR_REVIEW} lead\n"
        f"Subject: Senior-review claim {row.claim_id} still {row.status} after {int(row.days_open)} days\n\n"
        f"Claim {row.claim_id} ({row.claim_type}, ${row.claim_amount:,.0f}) is at or above the "
        f"${threshold:,.0f} line, so it was routed to senior review under the existing company rule.\n"
        f"It was reported {row.reported_date:%b %d, %Y} and has no decision yet.\n"
        f"Handled by: {row.adjuster_team} · {row.city}\n\n"
        f"Suggested action: assign a named senior reviewer and set a decision date.\n"
        f"This is a prepared message shown in the app; nothing has been sent."
    )
