"""ACT step: what happens automatically when a condition is detected.

Chain: flagged claim -> routed to senior review queue -> alert drafted for the
reviewer -> human decides (confirm hold / release) -> every step logged.
Messages go to an outbox file instead of real email/SMS for the demo.
"""
from datetime import datetime
from pathlib import Path

import pandas as pd

LOG_DIR = Path("logs")
ACTION_LOG = LOG_DIR / "action_log.csv"
DECISIONS = LOG_DIR / "decisions.csv"

SENIOR_REVIEW = "Senior Claims Review"
HEAD_DISTRIBUTION = "Head of Distribution"


def _append(path: Path, row: dict):
    LOG_DIR.mkdir(exist_ok=True)
    df = pd.DataFrame([row])
    df.to_csv(path, mode="a", header=not path.exists(), index=False)


def log_action(action: str, target: str, detail: str, by: str = "system"):
    _append(ACTION_LOG, {"time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
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
    _append(DECISIONS, {"time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
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
