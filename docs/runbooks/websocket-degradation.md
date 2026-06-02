# Runbook: WebSocket Degradation

## Trigger
- Realtime delivery proxy SLO breach (`websocket_delivery_proxy`).
- Board updates are delayed/missing while queue lag or failure rates increase.

## Immediate Triage (0-5 minutes)
1. Confirm user-facing symptoms: stale board cards, delayed status updates.
2. Check Operations tab for proxy SLO status and outbox lag trend.
3. Call `/api/events` and confirm whether lag or failed/dead-letter counts are driving the proxy breach.

## Investigation (5-15 minutes)
1. Validate socket server health and active transport fallback behavior.
2. Inspect outbox failures that represent update fanout events.
3. Verify client reconnect behavior and polling fallback health.

## Mitigation
1. Clear queue pressure first (use Queue Backup runbook if lagged).
2. Restart realtime service components if socket subsystem is stuck.
3. Temporarily rely on polling fallback and reduce update burst traffic.

## Verification
1. Realtime proxy SLO returns to healthy.
2. New task status transitions appear in clients within expected latency.
3. No recurring websocket-related errors for 10 minutes.

## Escalation
- Escalate to platform owner if realtime remains degraded after queue recovery.
