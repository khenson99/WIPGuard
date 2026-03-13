# Arda Coda LIR Analysis

Generated at: 2026-03-13T18:56:41.628Z

## Source framing
- Stage 2 LIR article: https://www.stage2.capital/blog/from-customer-level-to-cohorts-the-lir-journey
- Coda doc: Master Order Archive 2025 (cgSn33D4N9)
- Summary table: grid-2WSbYvHlQY
- Raw order table: grid-GPpAfsGmqQ

## Population
- Observation count: 194
- Customer count: 38
- Baseline next-8-week continuation rate: 0.9175
- Baseline next-8-week continuation rate excluding Rossmonster: 0.913

## Primary conclusion
- The strongest measured leading indicator is recurring weekly operational activity, not raw monthly order volume.
- Customers with 5+ active weeks in the trailing 8 weeks retained at 0.9904 excluding Rossmonster.
- Customers with only 0-2 active weeks retained at 0.6667.
- The strongest combined condition was 5+ active trailing weeks plus activity in 2+ of the prior 3 months, with a retention rate of 0.9894.

## Indicator checks
- Active weeks >= 5: n=104, retention=0.9904 excluding Rossmonster
- Active prior 3 months >= 2: n=138, retention=0.9493 excluding Rossmonster
- Unique items in trailing 30 days >= 5: n=23, retention=0.9565 excluding Rossmonster
- Trend ratio below 0.5x: n=27, retention=0.8889 excluding Rossmonster

## Combined conditions
- Low weeks and no history: n=20, retention=0.6
- Low weeks only: n=42, retention=0.6667
- Low weeks and drop: n=9, retention=0.6667
- Strong weeks and history: n=94, retention=0.9894

## Recommended Arda LIR
- Mature customers: active in 5 or more of the last 8 weeks.
- Supporting indicators: activity in 2 or more of the prior 3 months, breadth of ordered items, support distress, and billing distress.
- Onboarding customers: still needs direct Arda go-live and first-value instrumentation to validate time-to-first-order or card/item touch thresholds.

## Top 2025 customers by order count
- Rossmonster: 5043
- Bluewater Sportfishing Boats: 2269
- Fat Fender Garage: 1453
- Super Pacific: 758
- Roam Rig: 755
- Campworks Nomadic Systems: 474
- Egg Collective: 423
- Contoro Robotics: 408
- Austere Manufacturing: 372
- Lichen Precision: 285
- Sandy Vans: 238
- Nook Vans: 221

## Notes
- Outcome metric is any order activity in the next 8 weeks.
- Observation window covers active customer-months from January 2025 through October 2025 so each row has a forward-looking retention window.
- Internal/testing entities were excluded, and known customer-name variants were normalized before scoring.
- This analysis measures order cadence and item breadth from Coda only; it does not yet incorporate Arda cards/items APIs, support tickets, or billing health.
