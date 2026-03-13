# Methodology

## Retention definitions
- `churn_within_90d`: tenant shows explicit churn/cancel signal or billing-to-inactive collapse within 90 days after the observation month
- `churn_within_180d`: same logic with a 180-day lookforward window
- `active_after_180d`: tenant still shows active paying or operational behavior 180 days after month-end
- `contraction_within_90d`: MRR decline, downgrade, or cancel behavior in the next 90 days
- `support_distress`: elevated urgent/unresolved support pattern in the observation month
- `usage_collapse`: current-month activity is at or below 50% of normalized trailing baseline

## Join logic
- Primary key: `CustomerRecord.id`
- Join precedence:
  1. `CustomerRecordExternalRef`
  2. HubSpot persisted company/deal links
  3. Stripe customer id
  4. Arda tenant id
  5. Coda tenant/account id
  6. Pylon company/org id
  7. normalized domain/name fallback

## Missing data handling
- Missing source coverage is persisted on each tenant-month row
- Tenants are not dropped for partial coverage
- Reason codes include `partial_coverage` when one or more critical sources are absent
- Unresolved identity matches are retained in `RetentionSourceRecord` with `customerRecordId = null` and exported into `docs/retention/gaps-report.md`

## Candidate metrics tested
- time to first order
- meaningful activity days in last 30 days
- active weeks trailing 8
- recent activity vs trailing baseline
- monthly order cadence

## Selection criteria
- strongest lift against downstream labels
- broad coverage across current tenants
- stability across ICP and lifecycle segments
- operational interpretability

## Current implementation notes
- Runtime ingestion uses live APIs and existing persisted CRM models
- Coda MCP is used for developer-side inspection and schema discovery, while the app runtime uses the Coda REST API
- The multivariate validation step is currently implemented as lightweight scored candidate comparison rather than a heavy external ML dependency

## Limitations
- Arda API field contracts are environment-dependent
- Stripe invoice/payment detail is limited in the first pass
- Pylon account linkage may be incomplete depending on source payload quality
- ICP derivation currently depends on structured fields present in retention payloads or metadata

## Recommended instrumentation improvements
- explicit Arda tenant go-live milestone events
- stable active-user counts by tenant and month
- invoice/payment attempt snapshots per Stripe customer
- structured onboarding stage and implementation completeness fields in CRM
- richer ticket taxonomy and severity markers in Pylon
