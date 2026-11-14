# Millennium Signal

Finds where Millennium Mutual's money is going and acts on it.
DATA (`clean.py`) → DETECT (`detect.py`) → DECIDE (sidebar rules) → ACT (`actions.py`)

## Run
```
pip install -r requirements.txt
streamlit run app.py
```
Opens at http://localhost:8501. Keep `policies.csv` and `claims.csv` in `data/`.

## Before the demo
Write Detection 1 in `detect.py` → `flag_suspicious_claims()`. Until then the app runs but flags nothing.

## Files
- `clean.py`: cleaning steps, each logged with the reason (shown in tab 5)
- `detect.py`: Detection 1 (team-written claim rule), Detection 2 (broker scorecard), aging open claims
- `actions.py`: routing, drafted alerts, human decisions, action log (`logs/`)
- `app.py`: the Streamlit interface
