# Operator Playbook

## How to use the dashboard
- Start with `/analytics/retention`
- Review the LIR pass rate, at-risk queues, and ICP rollups
- Work from explicit reason codes, not from the status color alone

## What each status means
- `Healthy`: tenant is behaving like a retained account this month
- `Watch`: something softened; review before it becomes a collapse
- `At Risk`: intervene now on adoption, support, or commercial risk
- `Onboarding Risk`: tenant has not hit first value or early habit milestones
- `Billing Risk`: billing issue can override otherwise healthy usage

## Intervention guidance
- Low operational adoption:
  - review order cadence, active weeks, and breadth across cards/items/locations
  - focus on making recurring workflow usage habitual
- Onboarding stall:
  - check go-live date, first-order timing, and implementation blockers
  - remove setup blockers before pushing broader feature adoption
- Support distress:
  - review urgent and unresolved issue load
  - separate bug-driven distress from how-to/support education gaps
- Billing distress:
  - confirm delinquency, failed payments, or contraction
  - coordinate commercial outreach before usage health deteriorates

## Refresh cadence
- Refresh source syncs daily at minimum
- Rebuild tenant-month facts after each sync window
- Re-run candidate analysis when enough new months accumulate or thresholds drift

## Cohort guidance
- Use cohorts to understand whether onboarding cohorts are improving
- Do not replace customer-level review with cohort rollups
