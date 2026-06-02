# Runbook: Integration Sync Lag

## Trigger
- Integration freshness SLO breach (`integration_sync_freshness`) or connection health breach.
- One or more providers show `ERROR` or stale sync > 30 minutes.

## Immediate Triage (0-5 minutes)
1. Open the Operations tab in Settings and capture affected providers.
2. Check `/api/ops/observability` and verify stale rule + stale connection counts.
3. Confirm token state in Integrations settings and note `lastError` messages.

## Investigation (5-15 minutes)
1. Query integration rules for the affected provider and identify stale `lastRunAt`.
2. Call `/api/events` and inspect `recentDeadLetters` plus `failuresByEventType` for the affected provider.
3. Validate provider credentials and OAuth refresh behavior.

## Mitigation
1. Re-authenticate affected integrations if token errors persist.
2. Replay failed/dead-letter outbox events with `POST /api/events/replay`:
   ```json
   { "statuses": ["FAILED", "DEAD_LETTER"], "limit": 50 }
   ```
3. Run provider sync endpoint in dry-run mode, then execute live sync.

## Verification
1. Confirm stale rule count drops to 0.
2. Confirm stale connection count drops to 0.
3. Confirm no new integration dead letters in the last 5 minutes.

## Escalation
- Escalate to backend owner if stale rules persist beyond 30 minutes after replay.
