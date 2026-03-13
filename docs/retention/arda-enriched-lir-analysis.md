# Arda Enriched Retention Analysis

Generated at: 2026-03-13T19:50:59.644Z

## Population
- Coda baseline observations: 194
- Coda baseline customers: 38
- Arda-matched observations: 57
- Arda-matched customers: 8
- Matched next-8-week continuation rate: 0.9474

## Matched customers
- Austere Manufacturing: 1 tenant id(s)
- Blackwell Engineering: 1 tenant id(s)
- Bluewater Sportfishing Boats: 1 tenant id(s)
- Gimbel Group: 1 tenant id(s)
- Lichen Precision: 1 tenant id(s)
- Neff Machine: 1 tenant id(s)
- Reachable Technology LLC: 1 tenant id(s)
- Roam Rig: 4 tenant id(s)

## Indicator checks
- Active weeks >= 5: n=37, retention=1
- Any Arda touch in trailing 30 days: n=2, retention=1
- Combined Arda touches >= 10: n=0, retention=null
- Card touches >= 5: n=0, retention=null
- Item touches >= 5: n=0, retention=null

## Combined checks
- Strong weeks with Arda touch: n=1, retention=1
- Weak weeks with Arda touch: n=1, retention=1
- Weak weeks with no Arda touch: n=19, retention=0.8421
- Strong weeks and 5+ card touches: n=0, retention=null

## Failed matched observations
- Gimbel Group at 2025-02-01: weeks=2, cards30=0, items30=0, orders30=0
- Reachable Technology LLC at 2025-02-01: weeks=2, cards30=0, items30=0, orders30=0
- Reachable Technology LLC at 2025-07-01: weeks=1, cards30=0, items30=0, orders30=0

## Customer snapshots
- Blackwell Engineering: observations=10, retained=1, maxCardTouches30=3, maxItemTouches30=4, maxFacilities=1
- Neff Machine: observations=5, retained=1, maxCardTouches30=1, maxItemTouches30=1, maxFacilities=0
- Austere Manufacturing: observations=10, retained=1, maxCardTouches30=0, maxItemTouches30=0, maxFacilities=0
- Bluewater Sportfishing Boats: observations=10, retained=1, maxCardTouches30=0, maxItemTouches30=0, maxFacilities=0
- Gimbel Group: observations=1, retained=0, maxCardTouches30=0, maxItemTouches30=0, maxFacilities=0
- Lichen Precision: observations=10, retained=1, maxCardTouches30=0, maxItemTouches30=0, maxFacilities=0
- Reachable Technology LLC: observations=3, retained=0.3333, maxCardTouches30=0, maxItemTouches30=0, maxFacilities=0
- Roam Rig: observations=8, retained=1, maxCardTouches30=0, maxItemTouches30=0, maxFacilities=0

## Notes
- Matched customers were joined to Arda tenants manually from tenant names/domains on 2026-03-13.
- Arda metrics are point-in-time monthly snapshots using /query endpoints with effectiveasof and recordedasof at month end.
- Trailing-30 touch counts proxy operational engagement by counting records whose asOf or createdAt timestamp falls inside the prior 30 days.
- This Arda-enriched subset is smaller than the Coda baseline and should be treated as directional unless sample size is increased with more tenant matches.
