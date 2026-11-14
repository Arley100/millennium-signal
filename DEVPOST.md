# Devpost submission draft

Copy each section into the matching Devpost field. Items in [brackets] need a human.

## Project name

Millennium Signal

## Tagline (max ~140 characters)

Finds where an insurer's money is going, then routes every finding to a person with the message already drafted.

## Inspiration

The CFO's question was simple: "We're writing more business than ever and making less money on it. Where is the money going?" The data to answer it was two messy exports. We wanted a tool that goes past a dashboard: it should say what is wrong, show the evidence, and start the fix.

## What it does

Millennium Signal follows four steps: DATA → DETECT → DECIDE → ACT.

- **Data.** Cleans the policy and claim exports (duplicates, test records, mixed date formats, text premiums, city spellings) and logs every change with its reason.
- **Detect.** Runs our Aging Claim Alert, a senior queue monitor (claims of $10,000 or more still undecided), a broker scorecard and a near-threshold claim rule.
- **Decide.** People set every threshold with sliders. Nothing is hard-coded to a broker or a team.
- **Act.** Each hit becomes a review task with drafted messages. A reviewer confirms or dismisses, and every step is logged.

What it found in the data (as of Oct 31, 2026):

- 64% of earned premium is paid back out in claims; 56% without one broker.
- Broker B07 pays out 429% of the premium it earns. The other nine brokers look like the company's own channels.
- One adjuster team's settlement time roughly doubled in 2026. Customers who waited over 30 days renewed 45% of the time, against 83% for a 15–30 day wait.
- 15 claims have been open more than 30 days, 13 with one team.
- 11 claims of $10,000 or more are still undecided in the senior-review queue; the oldest has waited 206 days.

**Our detection: the Aging Claim Alert.** A claim that is Open or Under Review more than N days after it was reported (default 30). Each one automatically creates a review task, a drafted alert to the VP of Claims suggesting reassignment to a team with capacity, and a drafted note to Retention to contact the customer.

## How we built it

- **Pipeline:** Python and pandas (`clean.py`, `detect.py`, `actions.py`).
- **API:** FastAPI serves the pipeline as JSON without re-implementing any logic.
- **Interface:** Next.js, React, TypeScript, Tailwind CSS and Recharts.
- **AI use:** Claude Code helped write the interface and API layer; the team reviewed it. No AI model runs inside the product.

## Challenges we ran into

- The exports mixed two date formats, so 05/02/2025 could be read as May 2 or February 5. We parse each format explicitly.
- New 2026 policies have not earned a full year of premium. Comparing claims with full premium hid the problem broker, so we calculate earned premium.
- Keeping suggestions separate from facts. We label every statement "From the data" or "Our recommendation".

## Accomplishments that we're proud of

- The 30-day threshold is justified by the data: renewals fall from 83% to 45% right at that point.
- Every task shows the exact fields that triggered it.
- A one-page CFO brief that prints cleanly, with live numbers.
- The system never denies a claim. A person makes every call, and the log keeps it.

## What we learned

- A finding only matters if someone can act on it the same day.
- Cleaning choices change the answer, so they have to be visible.
- [Add one thing the team learned personally.]

## What's next

- Finish the near-threshold claim rule (currently 3 of 4 detections are active). [Remove this line once it is written.]
- Send the drafted messages by email or chat instead of showing them on screen.
- Track whether reassigned claims settle faster, to check the rule works.

## Built with

python, pandas, fastapi, next.js, react, typescript, tailwindcss, recharts

## Try it out links

- GitHub: https://github.com/Arley100/millennium-signal
- [Demo video link]

## Image gallery (upload in this order)

1. `docs/screenshots/01-overview.png` — Where the money goes
2. `docs/screenshots/05-review-queue.png` — Review queue with drafted messages
3. `docs/screenshots/04-claim-delays.png` — Aging Claim Alert and its justification
4. `docs/screenshots/02-cfo-brief.png` — One-page CFO brief
5. `docs/screenshots/03-pattern.png` — Broker scorecard

## Demo video outline (about 2 minutes)

1. 0:00 The CFO's question, on the Overview: 64% vs 56% without B07.
2. 0:20 The pattern: broker scorecard, move a slider.
3. 0:45 Claim delays: the rule next to the 83% / 45% chart.
4. 1:05 Review queue: open an aging claim, read the two drafted messages, confirm.
5. 1:30 Submit a new claim, then show the Action log.
6. 1:45 CFO brief: the one-page answer.

## Before you submit

- [ ] Team: Arley Ndaribike and Wanlin Song (https://devpost.com/wanlinsong33). Add both as Devpost members.
- [ ] Hackathon name and challenge track selected.
- [ ] If the near-threshold rule gets written, retake the screenshots and update the "0 claims" lines here and in the README.
- [ ] Repository is public.
