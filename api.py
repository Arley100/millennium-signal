"""API layer: exposes the same DATA → DETECT → DECIDE → ACT pipeline as JSON
for the Next.js front end (web/).

Run:  uvicorn api:app --port 8000
Nothing is re-implemented here: cleaning comes from clean.py, the three
detections from detect.py, and the drafted messages / log from actions.py.
"""
import json
import threading
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

import actions as act
from clean import EXTRACT_DATE, load_and_clean
from detect import (aging_open_claims, broker_scorecard, flag_reasons, flag_suspicious_claims,
                    senior_queue_stalled)

app = FastAPI(title="Millennium Signal API")
LOCK = threading.Lock()

POLICIES, CLAIMS, CLEANING_LOG = load_and_clean("data")

RULES_FILE = act.LOG_DIR / "rules.json"
INTAKE_FILE = act.LOG_DIR / "intake.json"
DEFAULT_RULES = {"threshold": 10_000, "window": 60, "band": 25, "multiple": 2.0,
                 "aging_days": 30, "reviewer": "Senior reviewer"}
BOUNDS = {"threshold": [1_000, 50_000, 500], "window": [15, 180, 5], "band": [5, 50, 5],
          "multiple": [1.5, 4.0, 0.25], "aging_days": [7, 90, 1]}


class Rules(BaseModel):
    threshold: float = Field(10_000, ge=1_000, le=50_000)
    window: int = Field(60, ge=15, le=180)
    band: int = Field(25, ge=5, le=50)          # percent below the threshold
    multiple: float = Field(2.0, ge=1.5, le=4.0)
    aging_days: int = Field(30, ge=7, le=90)
    reviewer: str = "Senior reviewer"


class Decision(BaseModel):
    task_id: str
    decision: str
    note: str = ""


class NewClaim(BaseModel):
    policy_id: str
    loss_date: str
    reported_date: str | None = None
    amount: float = Field(gt=0)
    claim_type: str


# ------------------------------------------------------------------ helpers
def _read_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return default


def _write_json(path: Path, data):
    act.LOG_DIR.mkdir(exist_ok=True)
    path.write_text(json.dumps(data, indent=1), encoding="utf-8")


def get_rules() -> dict:
    return {**DEFAULT_RULES, **_read_json(RULES_FILE, {})}


def records(df: pd.DataFrame) -> list[dict]:
    """DataFrame → JSON-safe list (NaN → null, dates → ISO text)."""
    return json.loads(df.to_json(orient="records", date_format="iso"))


def num(x, digits=4):
    return None if x is None or pd.isna(x) else round(float(x), digits)


def intake_claims() -> pd.DataFrame:
    """Claims typed into the 'new claim' form, shaped like cleaned claims."""
    rows = _read_json(INTAKE_FILE, [])
    if not rows:
        return CLAIMS.iloc[0:0].copy()
    df = pd.DataFrame(rows)
    for c in ["loss_date", "reported_date", "start_date", "closed_date"]:
        df[c] = pd.to_datetime(df[c])
    return df.reindex(columns=CLAIMS.columns)


_DETECT_CACHE: dict = {}


def detect(rules: dict) -> dict:
    """Run the three detections with the current decision rules.
    The result is remembered until the rules or the typed-in claims change."""
    stamp = INTAKE_FILE.stat().st_mtime_ns if INTAKE_FILE.exists() else 0
    key = (rules["threshold"], rules["window"], rules["band"], rules["multiple"], rules["aging_days"], stamp)
    if key not in _DETECT_CACHE:
        _DETECT_CACHE.clear()
        _DETECT_CACHE[key] = _detect(rules)
    return _DETECT_CACHE[key]


def _detect(rules: dict) -> dict:
    band = rules["band"] / 100
    claims = CLAIMS.copy()
    # Detection: near-threshold claims (detect.flag_suspicious_claims)
    flags = flag_suspicious_claims(claims, rules["window"], rules["threshold"], band).fillna(False).astype(bool)
    claims["flagged"] = flags.values
    claims["reason"] = np.where(flags, flag_reasons(claims, rules["window"], rules["threshold"], band), "")
    # Detection: broker scorecard (detect.broker_scorecard)
    scorecard, typical = broker_scorecard(POLICIES, claims, flags, rules["window"], rules["multiple"])
    flagged_brokers = scorecard[scorecard.broker_flag].index.tolist()
    # Detection: Aging Claim Alert, written by the team (detect.aging_open_claims)
    aging = aging_open_claims(claims, rules["aging_days"])

    # Same checks on claims that came in through the intake form.
    new = intake_claims()
    if len(new):
        nf = flag_suspicious_claims(new, rules["window"], rules["threshold"], band).fillna(False).astype(bool)
        new["flagged"] = nf.values
        new["reason"] = np.where(nf, flag_reasons(new, rules["window"], rules["threshold"], band), "")
        new_aging = aging_open_claims(new, rules["aging_days"])
        new_senior = senior_queue_stalled(new, rules["threshold"])
    else:
        new["flagged"] = False
        new["reason"] = ""
        new_aging = new
        new_senior = new
    # Detection: senior queue monitor (detect.senior_queue_stalled)
    senior = senior_queue_stalled(claims, rules["threshold"])
    return dict(senior=senior, new_senior=new_senior, claims=claims, flags=flags, scorecard=scorecard, typical=typical,
                flagged_brokers=flagged_brokers, aging=aging, new=new, new_aging=new_aging)


@lru_cache
def team_cities() -> dict:
    return CLAIMS.groupby("adjuster_team").city.agg(lambda s: sorted(s.dropna().unique())).to_dict()


@lru_cache
def team_with_capacity(exclude: str) -> str:
    """Team to suggest for reassignment: fewest open claims, then fastest 2026 settlement."""
    open_ = CLAIMS[CLAIMS.closed_date.isna()].groupby("adjuster_team").size()
    speed = CLAIMS[CLAIMS.reported_date >= "2026-01-01"].groupby("adjuster_team").days_to_close.median()
    t = pd.DataFrame({"open": open_, "speed": speed}).fillna(0).drop(index=exclude, errors="ignore")
    best = t.sort_values(["open", "speed"]).index[0]
    return f"{best} ({', '.join(team_cities().get(best, []))})"


def _flagged(df: pd.DataFrame) -> pd.DataFrame:
    return df[df.flagged.astype(bool)]


def _stack(a: pd.DataFrame, b: pd.DataFrame) -> pd.DataFrame:
    """Concatenate, skipping empty frames (avoids pandas dtype warnings)."""
    parts = [x for x in (a, b) if len(x)]
    return pd.concat(parts) if parts else b


def sync_actions(d: dict, rules: dict):
    """ACT, automatic part: log each newly detected item once."""
    with LOCK:
        log = act.read_log()
        done = set(zip(log.action, log.target)) if len(log) else set()

        def once(action, target, detail):
            if (action, target) not in done:
                act.log_action(action, target, detail)
                done.add((action, target))

        for _, r in _stack(_flagged(d["new"]), _flagged(d["claims"])).iterrows():
            once("Auto-routed to senior review", r.claim_id, act.route_action(r.status))
            once("Alert queued", r.claim_id, f"To {act.SENIOR_REVIEW}")
        for b in d["flagged_brokers"]:
            once("Broker alert queued", b, f"To {act.HEAD_DISTRIBUTION} and VP of Claims")
        for _, r in _stack(d["new_aging"], d["aging"]).iterrows():
            to_team = team_with_capacity(r.adjuster_team)
            once("Aging claim: review task created", r.claim_id,
                 f"{r.status} for {int(r.days_open)} days (limit {rules['aging_days']})")
            once("Alert drafted: VP of Claims", r.claim_id,
                 f"Suggest reassigning from {r.adjuster_team} to {to_team}")
            once("Note drafted: Retention", r.claim_id,
                 f"Contact customer {r.customer_id} about the delay")
        for _, r in _stack(d["new_senior"], d["senior"]).iterrows():
            once("Senior queue: review task created", r.claim_id,
                 f"${r.claim_amount:,.0f}, {r.status} for {int(r.days_open)} days")
            once("Message prepared: Senior Claims Review", r.claim_id,
                 "Ask for a named reviewer and a decision date")


def build_tasks(d: dict, rules: dict) -> list[dict]:
    decisions = act.read_decisions()
    tasks = []

    def base(r, kind, badge, task_id):
        return {"task_id": task_id, "kind": kind, "badge": badge, "claim_id": r.claim_id,
                "policy_id": r.policy_id, "customer_id": r.customer_id, "source": r.source,
                "city": r.city, "claim_type": r.claim_type, "claim_amount": num(r.claim_amount, 2),
                "status": r.status, "adjuster_team": r.adjuster_team,
                "days_from_start": num(r.days_from_start, 0), "days_open": num(r.days_open, 0),
                "priority": priority(r),
                "decision": decisions.get(task_id, "Awaiting review")}

    aging_ids = set(_stack(d["new_aging"], d["aging"]).claim_id)
    senior_ids = set(_stack(d["new_senior"], d["senior"]).claim_id)

    def priority(r):
        """Critical when two rules hit the same claim, or it is very old or very large."""
        both = r.claim_id in aging_ids and r.claim_id in senior_ids
        big = pd.notna(r.claim_amount) and r.claim_amount >= 20_000
        old = pd.notna(r.days_open) and r.days_open > 90
        return "Critical" if both or big or old else "High"

    near = _stack(_flagged(d["new"]), _flagged(d["claims"]))
    for _, r in near.sort_values("claim_amount", ascending=False).iterrows():
        t = base(r, "near_threshold", "Near threshold", r.claim_id)
        t.update(reason=r.reason, action=act.route_action(r.status),
                 evidence=[f"claims.csv · {r.claim_id}", f"days_from_start = {int(r.days_from_start)}",
                           f"claim_amount = {r.claim_amount:,.2f}", f"start_date = {r.start_date:%Y-%m-%d}"],
                 options=["Confirm hold", "Release"],
                 alerts=[{"to": act.SENIOR_REVIEW, "body": act.claim_alert(r, r.reason)}])
        tasks.append(t)
    for _, r in _stack(d["new_aging"], d["aging"]).sort_values("days_open", ascending=False).iterrows():
        to_team = team_with_capacity(r.adjuster_team)
        t = base(r, "aging", "Aging claim", f"AGING:{r.claim_id}")
        t.update(reason=f"{r.status} for {int(r.days_open)} days since it was reported "
                        f"(limit {rules['aging_days']} days), handled by {r.adjuster_team}",
                 action=f"Reassign to {to_team} → Retention contacts customer",
                 evidence=[f"claims.csv · {r.claim_id}", f"status = {r.status}",
                           f"reported_date = {r.reported_date:%Y-%m-%d}", f"days_open = {int(r.days_open)}",
                           f"adjuster_team = {r.adjuster_team}"],
                 options=["Confirm reassignment", "Dismiss"],
                 alerts=[{"to": act.VP_CLAIMS, "body": act.aging_alert(r, rules["aging_days"], to_team)},
                         {"to": act.RETENTION, "body": act.retention_note(r)}])
        tasks.append(t)
    for _, r in _stack(d["new_senior"], d["senior"]).sort_values("days_open", ascending=False).iterrows():
        t = base(r, "senior", "Senior queue", f"SENIOR:{r.claim_id}")
        t.update(reason=f"Recorded amount ${r.claim_amount:,.0f} is at or above the ${rules['threshold']:,.0f} "
                        f"line, so the company already routes it to senior review; it is still {r.status} "
                        f"after {int(r.days_open)} days",
                 action="Assign a named senior reviewer and set a decision date",
                 evidence=[f"claims.csv · {r.claim_id}", f"claim_amount = {r.claim_amount:,.2f}",
                           f"status = {r.status}", f"days_open = {int(r.days_open)}"],
                 options=["Confirm escalation", "Dismiss"],
                 alerts=[{"to": f"{act.SENIOR_REVIEW} lead", "body": act.senior_alert(r, rules["threshold"])}])
        tasks.append(t)
    return tasks


def summary_of(d: dict, rules: dict) -> dict:
    p, claims, fb = POLICIES, d["claims"], d["flagged_brokers"]
    ytd25 = p[(p.start_date >= "2025-01-01") & (p.start_date <= "2025-10-31")]
    ytd26 = p[(p.start_date >= "2026-01-01") & (p.start_date <= "2026-10-31")]
    total_lr = claims.paid_amount_filled.sum() / p.earned_premium.sum()
    clean_lr = (claims[~claims.source.isin(fb)].paid_amount_filled.sum()
                / p[~p.source.isin(fb)].earned_premium.sum())
    flagged = claims[claims.flagged]
    return {
        "extract_date": f"{EXTRACT_DATE:%b %d, %Y}",
        "policies": len(p), "claims": len(claims),
        "policies_ytd_2026": len(ytd26), "policies_ytd_2025": len(ytd25),
        "growth": num(len(ytd26) / len(ytd25) - 1),
        "loss_ratio": num(total_lr), "loss_ratio_ex_flagged": num(clean_lr),
        "flagged_claims": int(len(flagged)) + int(len(_flagged(d["new"]))),
        "flagged_paid": num(flagged.paid_amount_filled.sum(), 2),
        "flagged_brokers": fb,
        "aging_claims": int(len(d["aging"]) + len(d["new_aging"])),
        "senior_claims": int(len(d["senior"]) + len(d["new_senior"])),
        "senior_value": num(d["senior"].claim_amount.sum(), 2),
        # True while detect.flag_suspicious_claims is still the unwritten stub.
        "near_threshold_rule_missing": bool(d["flags"].sum() == 0),
        "rules": rules,
    }


# ------------------------------------------------------------------ endpoints
@app.get("/api/rules")
def read_rules():
    return {"rules": get_rules(), "bounds": BOUNDS, "defaults": DEFAULT_RULES}


@app.put("/api/rules")
def save_rules(rules: Rules):
    r = rules.model_dump()
    with LOCK:
        _write_json(RULES_FILE, r)
    d = detect(r)
    sync_actions(d, r)
    return summary_of(d, r)


@app.get("/api/summary")
def summary():
    rules = get_rules()
    d = detect(rules)
    sync_actions(d, rules)
    return summary_of(d, rules)


@app.get("/api/overview")
def overview():
    rules = get_rules()
    d = detect(rules)
    sc, fb = d["scorecard"].reset_index(), d["flagged_brokers"]
    sc["kind"] = np.select([sc.broker_flag, ~sc.is_broker], ["Flagged broker", "Own channel"], "Broker")
    p = POLICIES[POLICIES.start_date < "2026-10-01"]
    q = p.assign(quarter=p.start_date.dt.to_period("Q").astype(str),
                 who=np.where(p.source.isin(fb), "flagged", "others"))
    q = q.groupby(["quarter", "who"]).size().unstack(fill_value=0).reindex(
        columns=["others", "flagged"], fill_value=0).reset_index()
    return {"by_source": records(sc[["source", "loss_ratio", "kind", "policies", "claims"]]
                                 .sort_values("loss_ratio", ascending=False)),
            "quarterly": records(q), "flagged_brokers": fb}


@app.get("/api/pattern")
def pattern():
    rules = get_rules()
    d = detect(rules)
    amt = d["claims"].dropna(subset=["claim_amount"])
    amt = amt[amt.claim_amount < 25_000]
    edges = np.arange(0, 25_500, 500)
    cut = pd.cut(amt.claim_amount, edges, right=False, labels=edges[:-1])
    hist = (amt.groupby([cut, "flagged"], observed=False).size().unstack(fill_value=0)
            .reindex(columns=[False, True], fill_value=0))
    hist.columns = ["other", "flagged"]
    hist = hist.reset_index(names="bin")
    hist["bin"] = hist.bin.astype(int)
    sc = d["scorecard"][d["scorecard"].is_broker].reset_index()
    sc["first_sale"] = sc.first_sale.dt.strftime("%Y-%m-%d")
    return {
        "histogram": records(hist),
        "scatter": records(amt[["claim_id", "source", "claim_type", "days_from_start",
                                "claim_amount", "flagged"]]),
        "scorecard": records(sc[["source", "policies", "claims", "first_sale", "loss_ratio", "claim_rate",
                                 "early_share", "flagged_claims", "warning_signs", "broker_flag"]]),
        "typical": {k: num(v) for k, v in d["typical"].items()},
        "zone": {"x1": rules["window"], "y0": rules["threshold"] * (1 - rules["band"] / 100),
                 "y1": rules["threshold"]},
        "near_threshold_rule_missing": bool(d["flags"].sum() == 0),
        "rules": rules,
    }


@app.get("/api/queue")
def queue():
    rules = get_rules()
    d = detect(rules)
    sync_actions(d, rules)
    tasks = build_tasks(d, rules)
    decisions = act.read_decisions()
    brokers = [{"task_id": f"BROKER:{b}", "broker": b,
                "body": act.broker_alert(b, d["scorecard"].loc[b], d["typical"]),
                "decision": decisions.get(f"BROKER:{b}", "Awaiting review")}
               for b in d["flagged_brokers"]]
    # Intake form: newest policies first, pre-selected on the flagged broker's newest policy.
    opts = POLICIES.sort_values("start_date", ascending=False)
    demo_src = d["flagged_brokers"][0] if d["flagged_brokers"] else "Agent"
    demo = opts[opts.source == demo_src].head(1)
    opts = pd.concat([demo, opts.head(60)]).drop_duplicates("policy_id")
    waiting = [t for t in tasks if t["decision"] == "Awaiting review"]
    return {
        "tasks": tasks, "broker_alerts": brokers,
        "counts": {"waiting": len(waiting),
                   "near_threshold": sum(t["kind"] == "near_threshold" for t in tasks),
                   "aging": sum(t["kind"] == "aging" for t in tasks),
                   "senior": sum(t["kind"] == "senior" for t in tasks),
                   "critical": sum(t["priority"] == "Critical" for t in tasks),
                   "decided": len(tasks) - len(waiting)},
        "intake": {"policies": [{"policy_id": r.policy_id, "source": r.source,
                                 "start_date": f"{r.start_date:%Y-%m-%d}"} for r in opts.itertuples()],
                   "default_policy": demo.policy_id.iloc[0] if len(demo) else opts.policy_id.iloc[0],
                   "default_loss_date": f"{EXTRACT_DATE:%Y-%m-%d}", "default_amount": 9400,
                   "claim_types": sorted(CLAIMS.claim_type.dropna().unique().tolist())},
        "near_threshold_rule_missing": bool(d["flags"].sum() == 0),
        "rules": rules,
    }


@app.post("/api/decision")
def decide(body: Decision):
    rules = get_rules()
    with LOCK:
        act.record_decision(body.task_id, body.decision, rules["reviewer"], body.note)
    return {"ok": True, "task_id": body.task_id, "decision": body.decision}


@app.post("/api/claims")
def new_claim(body: NewClaim):
    rules = get_rules()
    pol = POLICIES.set_index("policy_id")
    if body.policy_id not in pol.index:
        raise HTTPException(404, "Unknown policy")
    pr = pol.loc[body.policy_id]
    try:
        loss = pd.Timestamp(body.loss_date)
        reported = pd.Timestamp(body.reported_date or body.loss_date)
    except ValueError:
        raise HTTPException(422, "Dates must look like 2026-10-31")
    if loss < pr.start_date:
        raise HTTPException(422, f"Date of loss is before the policy started ({pr.start_date:%Y-%m-%d})")
    if reported > EXTRACT_DATE or loss > EXTRACT_DATE:
        raise HTTPException(422, f"Dates cannot be after the data extract date ({EXTRACT_DATE:%Y-%m-%d})")
    with LOCK:
        claim_id = f"NEW-{len(_read_json(INTAKE_FILE, [])) + 1:03d}"
    row = {c: None for c in CLAIMS.columns}
    row.update({"claim_id": claim_id, "policy_id": body.policy_id,
                "loss_date": str(loss.date()), "reported_date": str(reported.date()),
                "claim_type": body.claim_type, "claim_amount": body.amount, "adjuster_team": "Unassigned",
                "status": "Open", "data_issue": "", "customer_id": pr.customer_id, "city": pr.city,
                "policy_type": pr.policy_type, "risk_band": pr.risk_band, "channel": pr.channel,
                "source": pr.source, "start_date": str(pr.start_date.date()),
                "deductible": int(pr.deductible), "annual_premium": float(pr.annual_premium),
                "days_from_start": int((loss - pr.start_date).days),
                "days_open": int((EXTRACT_DATE - reported).days), "paid_amount_filled": 0.0})
    with LOCK:
        _write_json(INTAKE_FILE, _read_json(INTAKE_FILE, []) + [row])
        act.log_action("New claim received", row["claim_id"],
                       f"{body.claim_type}, ${body.amount:,.0f}, policy {body.policy_id} ({pr.source})")
    d = detect(rules)
    me = d["new"][d["new"].claim_id == row["claim_id"]].iloc[0]
    near = bool(me.flagged)
    aging = bool((d["new_aging"].claim_id == row["claim_id"]).any())
    sync_actions(d, rules)
    if near:
        outcome, message = "flagged", f"Flagged → payment held, routed to {act.SENIOR_REVIEW}. {me.reason}."
    elif body.amount >= rules["threshold"]:
        outcome = "senior"
        message = ("At or above the threshold → senior review under the existing company rule. "
                   "A Senior queue task was created so the review does not stall.")
    else:
        outcome = "clear"
        message = (f"Not flagged by the near-threshold rule → normal adjuster approval. "
                   f"Loss was {row['days_from_start']} days after the policy started.")
    if not near:
        with LOCK:
            act.log_action("New claim: " + ("senior review (existing rule)" if outcome == "senior"
                                            else "normal handling"), row["claim_id"], message)
    return {"claim_id": row["claim_id"], "outcome": outcome, "message": message,
            "aging": aging, "source": pr.source, "days_from_start": row["days_from_start"],
            "alert": act.claim_alert(me, me.reason) if near else None,
            "near_threshold_rule_missing": bool(d["flags"].sum() == 0)}


@app.get("/api/delays")
def delays():
    rules = get_rules()
    d = detect(rules)
    c = CLAIMS.dropna(subset=["reported_date"]).copy()
    c["quarter"] = c.reported_date.dt.to_period("Q").astype(str)
    cities = team_cities()
    c["team"] = c.adjuster_team.map(lambda t: f"{t} ({', '.join(cities.get(t, []))})")
    t = (c[c.quarter < "2026Q4"].groupby(["quarter", "team"]).days_to_close.median()
         .unstack().reset_index())
    ended = POLICIES[POLICIES.renewal_status.isin(["Renewed", "Not Renewed"])]
    wait = CLAIMS.groupby("policy_id").days_to_close.max()
    e = ended.assign(wait=ended.policy_id.map(wait))
    e["bucket"] = pd.cut(e.wait.fillna(-1), [-2, -0.5, 14, 30, 1e4],
                         labels=["No claim", "≤ 14 days", "15–30 days", "> 30 days"])
    r = e.groupby("bucket", observed=True).agg(
        renewal=("renewal_status", lambda s: (s == "Renewed").mean()), n=("policy_id", "count")).reset_index()
    aging = _stack(d["new_aging"], d["aging"]).sort_values("days_open", ascending=False)
    return {"settle": records(t), "teams": [x for x in t.columns if x != "quarter"],
            "renewal": records(r),
            "aging": records(aging[["claim_id", "adjuster_team", "city", "claim_type", "claim_amount",
                                    "days_open", "status", "customer_id"]]),
            "aging_by_team": {k: int(v) for k, v in aging.groupby("adjuster_team").size().items()},
            "aging_days": rules["aging_days"]}


@app.get("/api/cleaning")
def cleaning():
    return {"steps": records(CLEANING_LOG)}


@app.get("/api/log")
def action_log():
    return {"rows": records(act.read_log().fillna(""))}


@app.post("/api/reset")
def reset_demo():
    """Start the demo fresh: clear decisions, intake claims, saved rules and the action log."""
    with LOCK:
        for f in (act.ACTION_LOG, act.DECISIONS, RULES_FILE, INTAKE_FILE):
            f.unlink(missing_ok=True)
    rules = get_rules()
    d = detect(rules)
    sync_actions(d, rules)
    return summary_of(d, rules)
