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

## Current evidence update
- Coda remains the highest-signal source for mature-account retention scoring.
- Arda cards/items are directionally useful, but historical 2025 coverage is too sparse to improve the model yet.
- In the matched Arda subset, `activeWeeksTrailing8 >= 5` retained at `100%` while Arda trailing-30 touch data appeared in only `2` of `57` matched observations.
- All `3` non-retained matched observations had zero Arda touches, but most retained matched observations also had zero Arda touches, so missing Arda activity is not discriminative enough today.
- Arda `order/order` should not be used as the primary product-side retention signal.

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
