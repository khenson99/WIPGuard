# Final Recommendation

## Primary LIR
- Mature tenants:
  - `activeWeeksTrailing8 >= 5`
  - Interpretation: tenant is active in at least five of the last eight weeks
- Onboarding tenants:
  - `timeToFirstOrderDays <= 21`
  - Interpretation: tenant reaches first meaningful order within 21 days of go-live

## Supporting indicators
- recent activity vs trailing baseline
- current-month order cadence
- urgent/unresolved support load
- billing delinquency / failed-payment presence
- breadth across locations, workflows, cards, and items

## Production status logic
- `Healthy`: primary LIR passes and no severe billing/support blockers
- `Watch`: primary LIR soft-fails or early deterioration appears
- `At Risk`: primary LIR fails with usage collapse and/or support distress
- `Onboarding Risk`: onboarding tenant misses early first-value or habit threshold
- `Billing Risk`: billing distress regardless of usage

## Why this framework
- customer-level first
- current-month behavior over historical vanity metrics
- simple enough for operators to debug and act on
- explicit separation between onboarding risk and mature retention risk
