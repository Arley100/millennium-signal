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
