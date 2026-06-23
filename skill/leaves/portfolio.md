# Portfolio

Goal: a single view of allocation, health, and the alerts that need attention.

## Health score

`portfolioScore(snapshot)` in `engine/health.ts` returns a score from 0 to 100, higher is healthier, with
a weighted breakdown:

- range health: the share of liquidity positions that are in range.
- liquidation safety: distance of the weakest lending position from liquidation.
- concentration: how spread the portfolio is across venues.

Show the breakdown, not only the total. A single-venue portfolio is penalised on concentration by design.

## Escalations

`escalations(snapshot)` returns typed alerts ordered by severity:

- out of range: a liquidity position has stopped earning.
- liquidation risk and liquidation imminent: low lending health.
- concentration: more than 60 percent of value in one venue.

For each critical alert, state the problem, show the numbers, say what happens with no action, recommend
an action, and list alternatives.

## The report

`renderReport(snapshot)` in `engine/report.ts` produces both a Markdown report and a JSON object with the
rows, total value, score, and escalations. Use the Markdown for the user and keep the JSON for follow-up
questions or for saving alongside the ledger.

## Present it

Lead with the score and any critical alert. Then the allocation by venue and kind. Route to `lending.md`,
`risk.md`, or `rebalance-decision.md` depending on what the user wants to act on.
