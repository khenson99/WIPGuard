# Retention Entity Model

## Core entities

### `CustomerRecord`
- Existing WIPGuard customer/account entity
- Used as the canonical tenant dimension
- Joined to CRM, meetings, notes, plans, alerts, and external refs

### `RetentionSyncRun`
- One row per source-sync execution
- Tracks source, status, counts, window, and last error

### `RetentionSourceRecord`
- Raw retention staging row
- Stores source, object type, external id, occurred-at, mapped tenant, and raw payload
- Supports rerunnable ingestion and later feature engineering

### `RetentionTenantMonth`
- One row per tenant per month
- Stores feature payload, outcome payload, coverage payload, selected LIR, and reason codes
- This is the analytical fact table for LIR testing

### `RetentionTenantCurrent`
- One row per tenant for the latest materialized month
- Optimized for list/detail dashboard reads
- Stores status, primary LIR result, overlays, and prebuilt summary/detail payloads

## Join model
- `CustomerRecordExternalRef` remains the durable identity bridge
- Source-specific ids are normalized into `RetentionSourceRecord.customerRecordId`
- Tenant-month facts are built only after source rows are mapped to a canonical customer

## Status model
- `HEALTHY`
- `WATCH`
- `AT_RISK`
- `ONBOARDING_RISK`
- `BILLING_RISK`

## Lifecycle phases
- `ONBOARDING`
- `MATURE`
