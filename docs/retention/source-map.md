# Retention Source Map

## Canonical tenant key
- Canonical key: `CustomerRecord.id`
- Mapping table: `CustomerRecordExternalRef`
- Join precedence:
  1. explicit external refs
  2. HubSpot company/deal linkage
  3. Stripe customer id
  4. Arda tenant id
  5. Coda Master Order Archive tenant/account ids
  6. Pylon company/org ids
  7. domain/name fallback

## Source inventory

### Arda API
- Objects: tenants, orders, cards, items
- Expected keys:
  - tenant: `id`, `name`, `domain`, `goLiveDate`, `implementationStage`
  - order: `id`, `tenantId`, `createdAt`, `updatedAt`, `locationId`, `workflowId`
  - card: `id`, `tenantId`, `createdAt`, `updatedAt`, `locationId`, `active`
  - item: `id`, `tenantId`, `createdAt`, `updatedAt`, `locationId`, `active`
- Timestamps: `createdAt`, `updatedAt`
- Join path: `tenantId` -> external ref or fallback match -> `CustomerRecord.id`
- Known gaps:
  - exact endpoint contracts vary by environment
  - active-user identity is not yet guaranteed

### Coda Master Order Archive
- Access path:
  - developer discovery via Coda MCP
  - runtime ingestion via Coda REST API
- Object: rows from `CODA_MASTER_ORDER_ARCHIVE_TABLE_ID`
- Expected keys:
  - `tenant_id` or `tenantId`
  - `account_id` or `accountId`
  - `tenant_name`
  - `order_date`
  - `status`
  - `location_id`
  - `workflow_id`
- Timestamps: row `createdAt`, row `updatedAt`, `order_date`
- Join path: tenant/account id -> external ref -> fallback name/domain
- Known gaps:
  - table schema can drift across docs
  - additional account context tables may be needed for implementation completeness

### Stripe
- Object: subscriptions
- Expected keys:
  - subscription id
  - customer id
  - customer name/email
  - `status`
  - recurring price / MRR proxy
  - current period end
  - cancel at
- Timestamps: created/current_period_end/cancel_at
- Join path: stripe customer id -> external ref -> email domain fallback
- Known gaps:
  - invoice-level delinquency and payment attempts may need a second pass
  - multi-subscription customers need normalization

### HubSpot
- Runtime source:
  - persisted `CustomerRecord`, `DealCompany`, `Deal`, and external refs
- Expected keys:
  - HubSpot company id
  - HubSpot deal id
  - owner
  - segment
  - stage/lifecycle
  - expected close / commercial dates
- Timestamps: record created/updated, deal created/updated
- Join path: persisted CRM models already linked to `CustomerRecord`
- Known gaps:
  - ICP may need structured metadata rules instead of native field coverage

### Pylon
- Object: issues/conversations
- Expected keys:
  - issue id
  - company id
  - company name/domain
  - status
  - priority
  - tags
  - category
- Timestamps: created/updated
- Join path: company id -> external ref -> domain/name fallback
- Known gaps:
  - support response-time metrics are not guaranteed on every issue payload
  - company linkage quality depends on Pylon tenant configuration
