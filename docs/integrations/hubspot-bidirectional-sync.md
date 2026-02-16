# HubSpot Bi-directional Sync MVP

API route: `/api/integrations/hubspot/bidirectional-sync`

## Actions
- `GET`: fetch current rule state/config/checkpoint
- `POST` with `{ action: "configure", ... }`: patch enablement and mapping config
- `POST` with `{ action: "sync", dryRun?: boolean }`: execute one reconciliation run

## Config
- `monitoredPipelines`: optional allowlist of HubSpot pipeline IDs
- `maxResults`: max deals scanned per run
- `taskStatusToDealStage`: map local task statuses to HubSpot deal stages
- `dealStageToTaskStatus`: map HubSpot deal stages to local task statuses
- `conflictResolution`: `hubspot_wins` | `task_wins` | `newest_wins`

## Reconciliation model
1. Build linked task set from existing HubSpot integration receipts.
2. Compare mapped local status and mapped deal stage for each deal.
3. If mismatch:
   - apply winner according to conflict strategy
   - write idempotent `IntegrationReceipt` for applied transition
   - emit outbox domain event for auditability
4. Return drifts and conflicts so operators can resolve mapping gaps without data loss.

## Drift classes
- `missing_local_task`
- `missing_hubspot_deal`
- `unmapped_deal_stage`
- `unmapped_task_status`
