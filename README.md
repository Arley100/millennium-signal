<div align="center">

# Millennium Signal

### Finds where Millennium Mutual's money is going, and acts on it

*“We’re writing more business than ever and making less money on it. I want to know where the money is going.”* — CFO, Millennium Mutual

**DATA → DETECT → DECIDE → ACT**

</div>

---

Millennium Mutual sells more policies every quarter and keeps less of the premium. The answer is in two raw exports, `policies.csv` and `claims.csv`, but they are messy: duplicate claims, test records, two date formats, premiums stored as text, and five cities spelled twenty ways.

**Millennium Signal cleans the exports, runs three detections, lets people set the thresholds, and turns every hit into a review task with the messages already drafted.** A person makes each final call, and every step is logged.

![Overview](docs/screenshots/01-overview.png)

## Results

Data as of Oct 31, 2026.

| Measure | Result |
|---|---|
| Data after cleaning | **4,680 policies · 847 claims** (9 cleaning steps, each logged with its reason) |
| Claims paid ÷ premium earned | **64%** overall · **56%** without broker B07 |
| Broker scorecard | **B07 is the only broker flagged**: 429% loss ratio, 3 of 3 warning signs |
| Aging Claim Alert (N = 30 days) | **15 open claims**, 13 of them with one adjuster team |
| Renewal after a claim | **83%** when the wait was 15–30 days · **45%** past 30 days |

## What it found

**1. One broker, not the broker channel.** B07 started selling in January 2026 and pays out more than four times the premium it earns. The other nine brokers perform like the company's own agents and online channel.

**2. Slow claims cost renewals.** One adjuster team's median settlement time roughly doubled in 2026. Customers who wait more than 30 days renew about half as often as those who wait 15 to 30 days.

![Claim delays](docs/screenshots/04-claim-delays.png)

## What it does

| Step | What happens | Where |
|---|---|---|
| **Data** | Cleans the two exports. Every change is recorded with the number of rows and the reason. | Data & cleaning |
| **Detect** | Runs the Aging Claim Alert, the near-threshold claim rule and the broker scorecard. | The pattern · Claim delays |
| **Decide** | People set the thresholds with sliders. Nothing is hard-coded to a broker or a team. | Decision rules |
| **Act** | Each hit becomes a review task with drafted messages. A reviewer confirms or dismisses. | Review queue · Action log |

**The Aging Claim Alert** is the detection our team wrote. A claim is aging when its status is Open or Under Review and more than N days have passed since it was reported (default 30, adjustable from 7 to 90). Each aging claim automatically gets:

1. a review task with an "Aging claim" badge,
2. a drafted alert to the VP of Claims suggesting reassignment to a team with capacity,
3. a drafted note to Retention asking them to contact the customer,
4. a line in the action log for each step.

![Review queue](docs/screenshots/05-review-queue.png)

**Evidence and honesty labels.** Every task shows the exact fields the rule used (`status = Under Review`, `days_open = 206`). Statements are tagged **From the data** or **Our recommendation**, so a suggestion is never presented as a fact.

**One-page CFO brief.** The whole answer on a single printable page, with numbers read live from the data.

![CFO brief](docs/screenshots/02-cfo-brief.png)

<details>
<summary>More screens</summary>

**The pattern**: claim amounts, the flagged zone and the broker scorecard.
![The pattern](docs/screenshots/03-pattern.png)

**Decision rules**
![Decision rules](docs/screenshots/06-decision-rules.png)

**Action log**
![Action log](docs/screenshots/07-action-log.png)

**Usage guide**
![Usage guide](docs/screenshots/08-usage-guide.png)

</details>

## Quick start

Requires Python 3.12+ and Node.js 20.9+.

```bash
pip install -r requirements.txt
python -m uvicorn api:app --port 8000
```

In a second terminal:

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000. Keep `policies.csv` and `claims.csv` in `data/`. The original Streamlit version still runs with `streamlit run app.py`.

## Architecture

### Components

```mermaid
flowchart LR
    subgraph Data
        P[policies.csv]
        C[claims.csv]
    end
    subgraph Python["Python pipeline"]
        CL[clean.py<br/>cleaning + log]
        DE[detect.py<br/>3 detections]
        AC[actions.py<br/>drafts · decisions · log]
        API[api.py<br/>FastAPI · JSON]
    end
    subgraph Web["Next.js interface (web/)"]
        ST[store.tsx<br/>rules + refresh]
        UI[Screens<br/>Overview · Queue · Brief …]
    end
    L[(logs/<br/>action log · decisions · rules)]

    P --> CL
    C --> CL
    CL --> DE --> AC --> API
    AC <--> L
    API <-->|/api/*| ST --> UI
    UI -->|sliders · decisions · new claim| ST
```

### Data model

```mermaid
classDiagram
    class Policy {
        policy_id
        customer_id
        city
        policy_type
        channel
        broker_code
        start_date
        annual_premium
        earned_premium
        renewal_status
    }
    class Claim {
        claim_id
        policy_id
        loss_date
        reported_date
        claim_amount
        adjuster_team
        status
        paid_amount
        days_from_start
        days_open
    }
    class Rules {
        threshold
        window
        band
        multiple
        aging_days
        reviewer
    }
    class ReviewTask {
        task_id
        kind
        badge
        reason
        evidence
        action
        decision
    }
    class DraftedMessage {
        to
        body
    }
    class LogEntry {
        time
        by
        action
        target
        detail
    }
    Policy "1" --> "0..*" Claim : has
    Rules ..> ReviewTask : decides which claims qualify
    Claim "1" --> "0..2" ReviewTask : aging / near threshold
    ReviewTask "1" --> "1..2" DraftedMessage : drafts
    ReviewTask "1" --> "1..*" LogEntry : records
```

### An aging claim, end to end

```mermaid
sequenceDiagram
    actor R as Reviewer
    participant W as Web interface
    participant A as api.py
    participant D as detect.py
    participant X as actions.py
    participant L as logs/

    R->>W: Moves "Aging claim after" to N days
    W->>A: PUT /api/rules
    A->>D: aging_open_claims(claims, N)
    D-->>A: claims open more than N days
    A->>X: draft VP of Claims alert + Retention note
    X->>L: task created · alert drafted · note drafted
    A-->>W: updated counts
    R->>W: Opens task, clicks "Confirm reassignment"
    W->>A: POST /api/decision
    A->>X: record_decision
    X->>L: human decision, signed
    A-->>W: task marked decided
```

### Life of a review task

```mermaid
stateDiagram-v2
    [*] --> Detected : rule matches
    Detected --> AwaitingReview : task created · messages drafted · logged
    AwaitingReview --> Confirmed : reviewer confirms
    AwaitingReview --> Dismissed : reviewer dismisses or releases
    Confirmed --> [*]
    Dismissed --> [*] : logged so the rule can be tuned
```

## Project structure

```
data/                 The two raw exports (policies.csv, claims.csv)
clean.py              Loads and cleans the exports; records every change
detect.py             The three detections
actions.py            Drafted messages, human decisions, action log
api.py                FastAPI layer that serves the pipeline as JSON
app.py                Original Streamlit interface (fallback)
web/app/              One folder per screen
web/components/       Navigation shell and shared interface pieces
web/lib/store.tsx     Shared rules state and data fetching
logs/                 Action log, decisions, saved rules (not in git)
docs/screenshots/     Images used in this README
DECISIONS.md          Every build choice and its reason
HANDOFF.md            How to run, demo path, plain-English file guide
```

## Limits and uncertainties

- A flag asks for a second look. It is not a fraud finding, and the system never denies a claim.
- Earned premium is estimated from each policy's start date. No data dictionary came with the files.
- Paid claims with no recorded amount count in money paid but cannot be tested against the review line.
- The renewal comparison is a correlation in one year of data, not proof that delay causes non-renewal.
- "Team with capacity" means fewest open claims, then fastest settlement this year.
- Messages are drafts shown on screen and logged. Nothing is emailed.
- **Current state:** the near-threshold claim rule (`flag_suspicious_claims` in `detect.py`) is not written yet, so 2 of 3 detections are active and the screenshots show 0 near-threshold claims.

## Tools and AI use

- **Stack:** Python, pandas, FastAPI, Next.js 16, React 19, TypeScript, Tailwind CSS 4, Recharts.
- **During development:** Claude Code (Anthropic) helped write the interface and the API layer. The team reviewed the work.
- **In the product:** no AI model runs. Every number comes from the two exports through rules a person can read.

## Team

Arley Ndaribike and team.
