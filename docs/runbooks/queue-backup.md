# Runbook: Queue Backup

## Trigger
- Outbox lag SLO breach (`outbox_delivery_lag`) or failure budget breach.
- Oldest retryable event age > 300s, or failed+dead-letter exceeds threshold.

## Immediate Triage (0-5 minutes)
1. Open Operations tab and record current queue lag + failed/dead-letter counts.
2. Call `/api/events` to inspect event-bus metrics payload.
3. Identify top failing event types under `failuresByEventType`.

## Investigation (5-15 minutes)
1. Inspect logs for `outbox.event.dispatch_failed` and correlate event IDs.
2. Validate downstream dependencies for top failing event types.
3. Check if retryable backlog is growing faster than dispatch throughput.

## Mitigation
1. Replay failed/dead-letter events via `/api/events` with `action: replay`.
2. Temporarily reduce new sync load (disable noisy rules) while backlog drains.
3. Fix root-cause dispatch errors, then re-enable normal traffic.

## Verification
1. Oldest retryable lag returns under 300s.
2. Failed/dead-letter counts trend down for 5+ minutes.
3. No repeated failures for the same idempotency keys.

## Escalation
- Escalate to engineering lead if backlog cannot be reduced within 20 minutes.
