# Millennium Signal

Finds where Millennium Mutual's money is going and acts on it.
DATA (`clean.py`) → DETECT (`detect.py`) → DECIDE (sidebar rules) → ACT (`actions.py`)

## Run
```
pip install -r requirements.txt
python -m uvicorn api:app --port 8000
```
and in a second terminal:
```
cd web
npm install
npm run dev
```
Opens at http://localhost:3000. Keep `policies.csv` and `claims.csv` in `data/`.
The original Streamlit version still runs with `streamlit run app.py`.

## Results (data as of Oct 31, 2026)

| Measure | Result |
|---|---|
| Data | 4,680 policies, 847 claims after cleaning (9 logged cleaning steps) |
| Claims paid ÷ premium earned | 64% overall, 56% without broker B07 |
| Broker scorecard | B07 is the only broker flagged (3 of 3 warning signs) |
| Aging Claim Alert (N = 30 days) | 15 open claims, 13 with one adjuster team |
| Renewal after a claim | 83% when the wait was 15–30 days, 45% past 30 days |

## Limits and uncertainties

- A flag asks for a second look; it is not a fraud finding. A person confirms every action.
- Earned premium is estimated from start dates; no data dictionary came with the files.
- The renewal comparison is a correlation in one year of data.
- Messages are drafts shown on screen and logged; nothing is emailed.

## Tools and AI use

Built with Python (pandas, FastAPI), Next.js, Tailwind CSS and Recharts. Claude Code (Anthropic) helped write the
interface and API; the team reviewed the work. No AI model runs inside the product.

## Before the demo
Write Detection 1 in `detect.py` → `flag_suspicious_claims()`. Until then the app runs but flags nothing.

## Files
- `clean.py`: cleaning steps, each logged with the reason (shown in tab 5)
- `detect.py`: Detection 1 (team-written claim rule), Detection 2 (broker scorecard), aging open claims
- `actions.py`: routing, drafted alerts, human decisions, action log (`logs/`)
- `api.py`: JSON API for the web interface
- `web/`: the Next.js interface
- `app.py`: the original Streamlit interface (fallback)
