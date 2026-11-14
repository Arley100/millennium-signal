# HANDOFF

> ⚠️ Read the warning at the top of `DECISIONS.md` first: `flag_suspicious_claims()` in `detect.py` is still an
> unwritten stub, so the near-threshold rule flags **0 claims (expected 73)** and there is **no "Confirm hold" button**.
> I did not touch it, as instructed. Once it is written and the API restarted, everything appears with no other change.

## Start both servers (two PowerShell windows)

```powershell
cd C:\Users\ndari\millennium-signal\backend
pip install -r requirements.txt
python -m uvicorn api:app --port 8000
```

```powershell
cd C:\Users\ndari\millennium-signal\web
npm install
npm run dev
```

Open http://localhost:3000. If port 3000 is busy, Next.js prints the port it chose instead.
Restart the first window after any change to a `.py` file. Fallback, from the `backend` folder: `pip install -r requirements-streamlit.txt` then `streamlit run app.py`.

**The Python files moved into `backend/`** (clean.py, detect.py, actions.py, api.py, app.py, data/) so Vercel can deploy them as a service. Nothing inside `detect.py` changed.

## What works (tested in the browser)

- `/api/summary`: 4,680 policies, 847 claims, 64% claims paid ÷ premium earned, 56% without B07, B07 the only flagged broker, 15 aging claims. Flagged claims = 0 (stub).
- Overview, The pattern, Review queue, Claim delays, Decision rules, Action log, Data & cleaning all load with no console errors.
- Sliders (sidebar, Pattern, Claim delays, Decision rules) update every screen; N = 7 → 34 aging claims, 30 → 15, 90 → 4.
- Review queue: filters, row selection, "Confirm reassignment", "Dismiss", "Confirm broker review", "Dismiss broker alert", "Submit claim" all clicked and logged.
- Action log: Refresh, Reset demo (Cancel / Yes, reset) clicked.

## Not finished / not verified

- The final end-to-end click-through in one pass was interrupted (usage limit). Each step was tested separately, but
  the Action log filter buttons (All / Human decisions / Aging claim / New claims / Broker) were added last and were
  type-checked only, not clicked.
- The pattern screen was checked by its contents (827 dots, both charts, scorecard) but not by screenshot.
- "Confirm hold" and a flagged new claim cannot be shown until the near-threshold rule is written.

## Added in the second pass (ideas from memory_360_NOVA)

- Light theme with dark grouped navigation, top status bar, breadcrumb headers.
- "From the data" / "Our recommendation" labels and evidence chips on queue tasks.
- **CFO brief** (`/brief`, one printable page) and **Usage guide** (`/guide`, with limits and uncertainties).
- Checked by loading every screen and reading the page contents and styles; **not checked by eye**: screenshots were
  unavailable, so look at each screen once before the demo. Printing the brief (Ctrl+P) was not tested.

## Added from Wanlin's pack (third pass)

- **Senior queue monitor** (`senior_queue_stalled` in `detect.py`, her rule R2): claims of $10,000 or more that are
  still Open or Under Review. 11 claims, $221,880.92, oldest 206 days: identical to her pipeline's figures.
- Each one gets a "Senior queue" task, a prepared message to the Senior Claims Review lead, and log lines.
- Tasks now carry a **priority** (Critical when two rules hit the same claim, or it is over 90 days or $20,000; else High), as in her pipeline.
- A new claim of $10,000 or more typed into the form now creates a Senior queue task, so the live demo shows an action firing.
- Tested through the API only; the new queue filter, priority column and rules card were not clicked in the browser.
- **Open conflicts between the two analyses are listed at the end of DECISIONS.md. Read them before the Q&A.**

## Vercel deployment (fourth pass)

- Why the old link was a 404: the project built from the repo root (no Next.js app there) and had no Python backend.
- Fix in the repo: `vercel.json` declares two services, `backend/` (FastAPI, answers `/api/*`) and `web/` (Next.js).
- **You must change two project settings on vercel.com**: Framework Preset → **Services**; Root Directory → empty (repo root). Then redeploy.
- Not tested on Vercel (no account access from here). Checked locally: the frontend production build passes, and the API runs with Vercel's read-only-disk setting.
- On Vercel the log, decisions and saved rules are in temporary storage and can reset or differ between server instances. Demo locally for anything the judges will click.

## What was cut

AI summary, real email, Vercel (as instructed). 21st.dev components (see DECISIONS.md).

## Demo click path

1. **Reset first**: Action log → Reset demo → Yes, reset.
2. **Overview**: 64% of earned premium paid out in claims, 56% without B07; B07 bar at 429%.
3. **The pattern**: broker scorecard, B07 flagged 3 of 3.
4. **Move a slider**: drag "Aging claim after" in the left panel (15 → more/fewer), or "Broker vs typical" to 4× (B07 drops off), then put it back.
5. **Review queue**: pick an Aging claim task, read the two drafted messages, click **Confirm reassignment**
   (this replaces "Confirm hold" until the near-threshold rule exists).
6. **Submit the pre-filled new claim** (bottom right). Today it answers "Not flagged"; with the rule written it will be held.
7. **Action log**: the decision and the new claim are at the top.
8. **CFO brief**: the one-page answer; Ctrl+P prints it.
9. Optional: **Claim delays** for the rule next to its justification (83% vs 45% renewal).

## Files in plain English

- `clean.py`: loads the two CSVs and fixes them (duplicates, test rows, city spellings, text premiums, mixed dates); records each fix.
- `detect.py`: the three detections. `aging_open_claims` (team-written Aging Claim Alert), `flag_suspicious_claims` (near-threshold rule, **not written yet**), `broker_scorecard` (compares each broker with the typical broker).
- `actions.py`: what happens after a detection: the drafted messages (senior review, VP of Claims, Retention, Head of Distribution), recording human decisions, and the action log in `logs/`.
- `api.py`: turns the three files above into web addresses (`/api/summary`, `/api/queue`, …) the website reads. No detection logic of its own.
- `app.py`: the original Streamlit app, unchanged, kept as a fallback.
- `web/lib/store.tsx`: holds the slider values and tells every screen to refresh when they change.
- `web/components/shell.tsx`: the left panel (navigation, sliders, live counts). Remove a line from `NAV` to hide a screen.
- `web/components/ui.tsx`: shared pieces: cards, number tiles, badges, buttons, sliders, the yellow warning banner.
- `web/app/page.tsx`: Overview. `web/app/pattern`: The pattern. `web/app/queue`: Review queue and new-claim form.
  `web/app/delays`: Claim delays and the aging rule. `web/app/rules`: Decision rules. `web/app/log`: Action log. `web/app/data`: cleaning steps. `web/app/brief`: one-page CFO brief. `web/app/guide`: usage guide and limits.
- `web/next.config.ts`: forwards `/api/*` from the website to the Python API on port 8000.
- `logs/`: action log, decisions, typed-in claims, saved rules (not in git; "Reset demo" clears them).
- `DECISIONS.md`: every choice made while building, with the reason.
