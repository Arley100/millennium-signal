# DECISIONS

> ## ⚠️ WARNING — the near-threshold claim rule flags NOTHING right now
> `flag_suspicious_claims()` in `detect.py` is still the unwritten stub (`return pd.Series(False, ...)`).
> I was told not to write or edit it, so I did not. Consequences in the app today:
> - `/api/summary` returns **0 flagged claims**, not the expected **73**. Every other check number matches
>   (4,680 policies, 847 claims, 64% loss ratio, 56% without B07, B07 the only flagged broker).
> - The Review queue has **no "Near threshold" tasks**, so there is **no "Confirm hold" button** to click.
>   The queue shows the 15 Aging claim tasks (buttons: "Confirm reassignment" / "Dismiss") and the B07 broker alert.
> - The pre-filled new claim ($9,400 on a B07 policy) comes back **"Not flagged"**.
> - The Pattern screen shows the histogram and scatter with no red "flagged" points.
>
> The app shows a yellow banner saying this wherever it matters. **As soon as a teammate writes the rule,
> everything lights up with no other change** (restart is automatic with `--reload`). A one-off check on the
> data confirms the rule described in the docstring (loss ≤ 60 days from start, amount $7,500–$9,999.99)
> matches exactly 73 claims.

One line per choice: what and why.

- **Rebuilt as Next.js + FastAPI** (`web/` + `api.py`); Node 22 was present and `create-next-app` worked first time. `app.py` (Streamlit) is left untouched as a fallback.
- **api.py re-implements nothing**: it imports `clean.py`, `detect.py`, `actions.py` and returns JSON, so the numbers are identical to the Streamlit app.
- **Did not use 21st.dev components**: the tools were reachable, but fetching component code spends a paid daily quota and time was short; used hand-written shadcn-style components (cards, badges, sliders, tables) with Tailwind instead.
- **Design = the existing Streamlit theme** (`.streamlit/config.toml`: dark `#0d0b1a`, panels `#1b1730`, accent `#ff4b6e`, text `#ece8ff`). No separate design file was in the repo, so I kept the look the team already chose.
- **Charts with Recharts**: simplest React chart library; plain tables where a chart was not needed.
- **Decision rules live in the left sidebar on every screen** (like the Streamlit sidebar) so "The pattern → move a slider" works without changing page; a dedicated "Decision rules" screen explains each rule too.
- **Rules are saved on the server** (`logs/rules.json`) so every screen and the queue use the same values.
- **Next.js proxies `/api/*` to port 8000** (rewrite in `web/next.config.ts`), so there is no CORS setup and one URL to demo.
- **Aging Claim Alert uses `aging_open_claims()` exactly as the team wrote it**; the slider only passes N (7–90, default 30) as `max_days`.
- **Aging automation**: each aging claim becomes a queue task with badge "Aging claim", a drafted alert to the VP of Claims, and a drafted note to Retention; three log lines per claim, written once (no duplicates when sliders move).
- **"Team with capacity" = the other team with the fewest open claims, tie broken by fastest 2026 median settlement** (today: Team B, Calgary). Computed from the data, not hard-coded.
- **Aging tasks get their own buttons** ("Confirm reassignment" / "Dismiss") because "Confirm hold" makes no sense for a slow claim; near-threshold tasks keep "Confirm hold" / "Release".
- **Aging decisions are stored under `AGING:<claim id>`** in `logs/decisions.csv` so a claim can be both near-threshold and aging without the decisions colliding.
- **New-claim form runs the same detections** on the typed claim; claims are kept in `logs/intake.json` and get ids `NEW-001`, `NEW-002`… A loss date before the policy start or after Oct 31, 2026 is rejected.
- **Added "Reset demo" (Action log screen, `POST /api/reset`)**: clears the log, decisions, typed claims and saved rules so the demo starts clean after testing.
- **Messages are drafts only** (shown on screen and logged); no real email, no AI summary, no Vercel, as instructed.
- **The 83% / 45% renewal figures in the drafted alert are fixed text**; they match the data today (83.2% and 45.2%) and are the team's stated justification for N = 30.

## Borrowed from our memory_360_NOVA project (second pass)

- **Light work area with a dark, grouped navigation rail** (Insights / Operations / Support), replacing the all-dark Streamlit palette: it is the layout that won with NOVA and reads better on a projector.
- **System fonts instead of Poppins**: the Google Fonts download failed on this machine; a demo must not depend on the venue network.
- **Top status bar**: API connected, "N of 3 detections active", and "human decides", so the state of the system is always visible (NOVA's "AI configured / baseline state" idea).
- **"From the data" vs "Our recommendation" labels** on queue tasks, broker alerts and the brief: NOVA's "documented commitment vs our recommendation". Judges can see we do not pass off suggestions as facts.
- **Evidence chips** on every task (file, claim id, the exact field values the rule used): NOVA's citation chips, adapted to tabular data.
- **CFO brief page** (`/brief`), printable on one page: NOVA's handover brief. All numbers are read live from the API.
- **Usage guide page** (`/guide`) with a "Limits and uncertainties" section, as in NOVA's guide and README.
- **Not borrowed**: the AI chat assistant, file upload/update flow and Vercel deployment (AI summary and Vercel were excluded for this build).

## From Wanlin's pack (millennium-intelligence-pack.zip)

- **Implemented her rule R2, the senior queue monitor**, as a new function in `detect.py`: our second claim-level detection was an empty stub, and this one is simple, explainable and already verified by her pipeline (11 claims, $221,880.92, oldest 206 days; our data gives the same).
- **Did not run her script**; read it and reproduced her key figures on our cleaned data instead (channel proxy 61.3 / 41.6 / 42.8, B07 204.8% on written premium, 20 claims past 25 days).
- **Did not port** her Ask parser, Supabase schema or four-state task lifecycle: too large for the time left.

### Conflicts to settle as a team (not resolved by me)

1. **Two prototypes.** Her pack describes a separate live app, "Millennium Intelligence". This repo is "Millennium Signal". Decide which one is demoed and submitted.
2. **"Loss ratio" wording.** We show "64% / 56% loss ratio" and B07 at 429% on *earned* premium. Her guardrail says never call it a loss ratio; her figure is a "paid-to-recorded-premium proxy" on *written* premium (Broker 61.3%, B07 204.8%). Both are computed correctly; pick one basis and one name. **Resolved (wording):** we keep the earned-premium basis and the 64% / 56% / 429% figures, but no longer call it a loss ratio; it is "claims paid ÷ premium earned", labelled a diagnostic, not profit.
3. **Aging threshold.** Ours defaults to 30 days (15 claims), justified by the renewal drop. Hers is 25 days, derived from the slowest team's mean resolution (20 claims), and she calls 30 days "illustrative, not an SLA".
4. **Renewal claim.** Our drafted alert and brief say customers past 30 days renew 45% vs 83%. Her finding is 22.9% not renewed with a claim vs 14.4% without, over 2,308 eligible policies, and she insists on "associated with", never causation. Our wording "why it matters" and "where renewals fall off" is stronger than hers. **Resolved (wording):** the app, drafted messages, brief and README now say waits are *associated with* lower renewal and state that this is not proof of cause. The 83% / 45% figures and the 30-day default are unchanged.
5. **Broker B07.** We flag the broker and draft a message to the Head of Distribution to route its business through senior review. She says no action against the broker: one human referral to investigators, because 58 of its 60 theft claims sit between $7,500 and $9,999.
6. **Near-threshold rule.** Ours expects 73 claims (early loss + just under the line) but is unwritten. Her equivalent is the B07 theft pattern above, as a single pattern task, not 73 claim tasks.
7. **Policy count.** We remove 4 TEST policies (4,680). She keeps them (4,684). Premium totals are unaffected ($0 premium).
8. **Renewal base.** We use decided policies only (Renewed / Not Renewed). She uses policies whose first year ended by the snapshot.
9. **Rules.** The track brief says project code written before the event is not allowed, and at least one detection must be logic the team wrote and can explain. Her notes also flag that the general event deck restricts AI use more than the track brief does. Confirm with the organizers.

## Vercel deployment

- **Used Vercel Services (one project, two services)** rather than two separate projects: it is Vercel's documented way to pair FastAPI with Next.js on one domain, and `/api/*` keeps working without CORS or an extra URL to configure.
- **Moved the Python pipeline into `backend/`**: a service needs its own root folder with its own `requirements.txt`. File contents are unchanged apart from paths.
- **Split requirements**: `backend/requirements.txt` (API only, versions pinned to the ones tested here) and `requirements-streamlit.txt`; Streamlit and Plotly would bloat the deployed function for no use.
- **Logs go to `/tmp` on Vercel** because the code folder is read-only there. State is temporary on the hosted site; a database was out of scope.
- **Services is a Beta feature on Vercel** and this deployment is untested from here.
