# WIPGuard Integration Reliability Strike Team -- Integration Dossiers

**Date**: 2026-03-02
**Status**: Active Review
**Scope**: All 13 registered integrations + cross-integration analysis
**Classification**: Internal Engineering -- Strike Team Eyes Only

---

## Integration Inventory

| # | Integration | Auth | Interaction | Critical Flows | Business Promise |
|---|-------------|------|-------------|----------------|-----------------|
| 1 | HubSpot | OAuth | REST+Webhooks | Bidirectional deal-task sync, webhook ingest, drift detection | Deal stages and task statuses stay in sync |
| 2 | Slack | OAuth | REST+Events API | Notifications, status sync, task creation, thread capture, SLA detection | Team gets timely notifications; messages become tasks |
| 3 | Coda | Token | REST (polling) | Row sync, decision actions, dependency gates | Coda rows stay in sync with tasks |
| 4 | Google Workspace | OAuth | REST (polling) | Calendar follow-ups, Drive comment escalation, Gmail capture | Calendar/Drive/Gmail events surface as tasks |
| 5 | Pylon | Token | REST (polling) | Support issue-task sync | Customer support issues surface as tasks |
| 6 | Google Ads | OAuth | REST (polling) | Campaign metrics pull | Ad metrics refresh reliably |
| 7 | Meta Ads | OAuth (long-lived) | REST (polling) | Ad metrics pull | Facebook ad metrics refresh reliably |
| 8 | Meta Page | OAuth (long-lived) | REST (polling) | Page insights pull | Page engagement metrics refresh |
| 9 | Reddit | OAuth (Basic auth) | REST (polling) | Ad metrics pull | Reddit ad data refreshes |
| 10 | Stripe | OAuth | REST (polling) | Revenue metrics pull | Revenue data refreshes |
| 11 | Mercury | OAuth (PKCE+Basic) | REST (polling) | Cashflow metrics pull | Banking data refreshes |
| 12 | Webflow | OAuth | Not implemented | None | Future: site/CMS data |
| 13 | SEMrush | Token | Not implemented | None | Future: SEO metrics |

**Tier Classification**:
- **Tier 1 (Complex, bidirectional)**: HubSpot, Slack
- **Tier 2 (Polling, task-creating)**: Coda, Google Workspace, Pylon
- **Tier 3 (Polling, metrics-only)**: Google Ads, Meta Ads, Meta Page, Reddit, Stripe, Mercury
- **Tier 4 (Stub/Future)**: Webflow, SEMrush

---

## Dossier 1: HubSpot

### 1. Summary

HubSpot is the most complex integration in WIPGuard. It implements bidirectional deal-to-task synchronization with webhook ingestion, polling-based sync, conflict resolution (hubspot_wins / task_wins / newest_wins), drift detection, risk intervention, customer signal automation, and stage checklists. The integration spans 5 distinct sync engines across 6 files, plus a webhook route handler and deal entity sync module.

### 2. Business Promise

Deal stages and task statuses stay perfectly in sync in real-time. Webhook events from HubSpot update local tasks within seconds. Outbound changes (task status updates) push back to HubSpot. Conflicts are resolved deterministically per configured strategy. At-risk deals automatically generate tasks. Deal stage transitions trigger follow-up checklists.

### 3. Data Contract

**Inputs**:
- HubSpot deals: stage, pipeline, owner, health score, close date
- HubSpot contacts, companies, meetings
- Webhook events: dealstage property changes, HMAC-SHA256 signed payloads

**Outputs**:
- Task creates and updates
- Integration receipts (deduplication records)
- Audit trail entries
- Domain events (for downstream consumers)

**Invariants**:
- Every webhook event is verified with HMAC-SHA256 + 5-minute replay window
- Every sync operation is idempotent via dedupeKey on integrationReceipt
- Conflict resolution is deterministic per configured strategy
- All changes produce an audit trail entry

### 4. FMEA

| Failure Mode | Likelihood | Severity | Detection | Mitigation | Status |
|---|---|---|---|---|---|
| Token expired during sync | Medium | High | Auth error on API call | Token refresh via token-refresh.ts, marks ERROR on failure | Implemented |
| Webhook signature invalid | Low | High | HMAC comparison fails | Returns 401, event dropped | Implemented |
| Webhook replay attack | Low | Medium | Timestamp >5min old | Rejected at verification layer | Implemented |
| Duplicate webhook events | Medium | Low | DedupeKey exists in receipt | Skip processing, count deduped | Implemented |
| HubSpot 429 rate limit | Medium | High | No detection currently | **NOT HANDLED** -- immediate failure | **P0 Gap** |
| HubSpot 5xx transient error | Medium | Medium | Error on fetch | **No retry** -- fails immediately | **P1 Gap** |
| Portal ID mismatch in webhook | Low | Medium | Falls back to first 10 connections | Non-deterministic user selection | **P1 Gap** |
| Conflict on newest_wins with null timestamp | Low | Medium | Task always wins | May hide stale HubSpot state | P2 Gap |
| Multiple tasks linked to same deal | Low | Medium | Only first task updated | Partial sync for multi-task deals | P2 Gap |
| Association fetch failure | Medium | Low | try/catch returns empty array | **Silent failure** -- missing contact/company mappings | **P1 Gap** |
| Config mapping change breaks dedupe | Low | Medium | Old receipts don't match new keys | No config versioning mechanism | P2 Gap |
| Circuit breaker DB write fails | Low | High | Fire-and-forget void async | State drift between memory and DB | **P0 Gap** |

### 5. Resilience Design

**Currently Implemented**:
- Circuit breaker (DB-backed state with CLOSED/OPEN/HALF_OPEN transitions)
- Idempotency keys on all sync operations via integrationReceipt dedupeKey
- Webhook signature verification (HMAC-SHA256)
- Webhook replay protection (5-minute timestamp window)
- Conflict resolution strategies (hubspot_wins, task_wins, newest_wins)
- Audit trail generation for all changes

**Gaps**:
- No rate limit handling for 429 responses; HubSpot API calls use raw `fetch` and fail immediately on 429
- No retry logic for transient 5xx errors in HubSpot-specific API calls (does not use `fetchWithResilience` from http-client.ts)
- Association fetch failures are silently caught and return empty arrays, leading to missing contact/company mappings with no warning
- Circuit breaker DB writes are fire-and-forget (`void async`), meaning the in-memory state can diverge from persisted state if the write fails

**Recommendations**:
1. Migrate all HubSpot API calls to use `fetchWithResilience` from http-client.ts
2. Add 429 detection with Retry-After header parsing
3. Log association fetch failures at WARN level instead of silently returning empty arrays
4. Fix circuit breaker to either `await` the DB write or attach a `.catch()` handler that logs errors

### 6. Observability

**Currently Implemented**:
- Console logs for webhook processing counts
- Domain events emitted for sync operations
- Structured sync observability wrapper

**Gaps**:
- No correlation IDs linking webhook receipt through to task update
- Audit log entries are built but never persisted or returned via API
- No metrics (counters, histograms) for sync throughput, latency, or error rates
- Skipped events are not logged with reasons for skipping

**Recommendations**:
- Add structured JSON logging with a correlation ID that flows from webhook receipt through to task mutation
- Persist audit entries to the database
- Expose error summary in `connection.lastError` for user-facing status
- Add counters for: events_received, events_processed, events_skipped (with reason), events_failed

### 7. Testing Plan

**Existing Coverage**:
- 30+ unit tests for pure functions (signature verification, reconciliation logic, dedupe key generation)
- 20+ contract tests for data shape validation
- Config normalization tests

**Missing Coverage**:
- No integration tests with a mocked HubSpot API
- No end-to-end webhook-to-task-update flow test
- No 401/429/5xx response handling tests
- No concurrent webhook + polling race condition tests
- No circuit breaker integration tests (only unit tests for pure state transitions)

**Priority Additions**:
1. Mock HubSpot API returning 429 -- verify graceful degradation
2. Webhook flow integration test: receive event, verify signature, create/update task, verify receipt
3. Conflict resolution with real database test (all three strategies)

### 8. Patch List

| Priority | Description | Location |
|----------|-------------|----------|
| **P0** | Fix circuit breaker fire-and-forget -- add `.catch()` with `console.error` | `circuit-breaker.ts:191-210, 217-250` |
| **P0** | Add structured logging to orchestrator catch block | `orchestrator.ts:181-185` |
| **P1** | Add timeout to Slack `postSlackMessage` raw fetch calls | `slack-notifications.ts:292-300` |
| **P1** | Extend health checks to all providers | `health-checks.ts:40` |
| **P1** | Change cron sync `Promise.all` to `Promise.allSettled` | `route.ts:50` |

### 9. Runbook

**On webhook failures**:
1. Check circuit breaker state via the integrations API
2. If OPEN, wait for the cooldown period or reset manually via the admin endpoint
3. Check connection status -- if ERROR, the user needs to re-authenticate via OAuth
4. Review dead letter events for specific failure reasons

**On sync drift**:
1. Run drift report via `POST /api/integrations/hubspot/sync` with `action: "drift_report"`
2. Review the mismatch list returned
3. For manual reconciliation: update task status directly or re-run bidirectional sync with `action: "full_sync"`

**On rate limit cascade**:
1. After implementing the 429 fix, the circuit breaker should open after repeated rate-limit errors
2. Wait for the cooldown period
3. The half-open probe will automatically test recovery by sending a single request
4. If the probe succeeds, the circuit closes and normal operation resumes

**On conflict resolution disputes**:
1. Check the audit trail (once persistence is implemented)
2. Review the configured conflict strategy in the rule config for the affected rule
3. Change strategy if needed via the PATCH endpoint on the integration rule
4. Re-run sync for the affected deal to apply the new strategy

---

## Dossier 2: Slack

### 1. Summary

Slack is the second most complex integration, spanning 7 modules: notifications (with per-channel throttling), status sync (task-to-thread updates), task creation (via reactions, shortcuts, and slash commands), thread capture, channel routing (policy-based with priority ordering), unanswered request detection (SLA monitoring), and RACI bridge (role-based notification routing). The integration is event-driven via Slack Events API for inbound events, plus polling via cron for SLA detection.

### 2. Business Promise

Team members receive timely, non-spammy notifications about task changes. Slack messages become tasks via emoji reactions, shortcuts, or slash commands. Task status updates are posted back to originating Slack threads. Unanswered requests are detected and escalated before SLA breach. Channel routing ensures notifications reach the right audience based on project/priority rules.

### 3. Data Contract

**Inputs**:
- Slack events: `reaction_added`, `message` events
- Webhook payloads: HMAC-SHA256 signed
- Task status changes from statusHistory records

**Outputs**:
- Slack messages (channel posts, thread replies, DMs)
- Tasks created from messages
- Integration receipts
- Dead letter events for failed notifications

**Invariants**:
- Every Slack event is verified with HMAC-SHA256 + 5-minute replay window
- Notifications are throttled per-channel: 5/min burst limit, 2-second minimum interval
- Notifications with type "blocked" bypass the throttle entirely
- Dead letter events are recorded for all failed notification deliveries
- All task creation is idempotent via dedupeKey on integrationReceipt

### 4. FMEA

| Failure Mode | Likelihood | Severity | Detection | Mitigation | Status |
|---|---|---|---|---|---|
| Token expired | Medium | High | 401 from Slack API | SlackAuthError thrown, marks connection ERROR | Implemented |
| Slack 429 rate limit | Medium | Medium | withRetries wrapper detects 429 | Exponential backoff + Retry-After header | Implemented |
| Message fetch failure during task creation | Medium | Low | try/catch fallback | Task created with generic title, **no logging** | **P1 Gap** |
| Event publishing failure | Low | Medium | No detection mechanism | Slack message sent but domain event not published | **P1 Gap** |
| Circuit breaker state loss (fire-and-forget) | Low | High | State drift between memory and DB | **No error handling on DB write** | **P0 Gap** (shared with HubSpot) |
| All regex patterns invalid in unanswered detector | Low | Medium | Empty compiled pattern array | Detector runs but never matches anything -- **silent** | **P1 Gap** |
| DM open failure (conversations.open) | Low | Medium | Error thrown from API | No retry, falls through to dead letter | P2 Gap |
| Dead letter idempotency key includes timestamp | Medium | Low | Duplicate dead letter records | Same failure at different times creates multiple entries | P2 Gap |
| Notification spam despite throttle | Low | Medium | In-memory throttle per process | Multi-process deployment loses throttle state | P2 Gap |

### 5. Resilience Design

**Currently Implemented**:
- Signature verification (HMAC-SHA256 with 5-minute replay window)
- Per-channel notification throttling (sliding window: 5/min burst, 2s min interval)
- Retry with Retry-After header parsing for 429 responses
- Dead letter queue for failed notifications
- Circuit breaker integration
- Deduplication via integration receipts
- Domain event emission for all sync operations

**Gaps**:
- `postSlackMessage` and `openSlackDirectConversation` use raw `fetch` with no `AbortController` timeout. A hung connection will block the sync worker indefinitely.
- Message fetch errors during task creation silently fall back to a generic title with no logging, making debugging impossible.
- Throttle state is in-memory per process. In a multi-instance deployment, each process maintains independent throttle state, potentially allowing aggregate spam.

**Recommendations**:
1. Add `AbortController` with a 30-second timeout to all Slack API calls
2. Log message fetch failures at WARN level during task creation
3. Consider Redis-backed throttle state for multi-instance deployments

### 6. Observability

**Currently Implemented**:
- Structured console logs for sent/throttled/failed notification events
- Dead letter events persisted in the outbox table
- Domain events emitted for all sync operations

**Gaps**:
- No logging of message fetch failures during task creation (the silent fallback)
- No alert or log when all regex patterns in the unanswered request detector are invalid
- No metrics on throttle hit rate (how often messages are being suppressed)

**Recommendations**:
- Add `console.warn` for every silent fallback path
- Log invalid regex patterns at ERROR level during detector initialization
- Add throttle metrics: messages_sent, messages_throttled, throttle_bypass_count

### 7. Testing Plan

**Existing Coverage**:
- Throttle config validation tests
- Throttle bypass for "blocked" notification type
- Burst limit enforcement tests
- Window expiry tests
- Render tests for each notification type (task_created, status_changed, etc.)
- Dedupe key format tests

**Missing Coverage**:
- No integration tests against a mocked Slack API
- No transaction rollback tests (message sent but DB write fails)
- No SLA detection logic tests (unanswered request timing, qualifying reply logic)
- No RACI mapping tests (role-to-channel resolution)
- No channel routing policy ordering tests (priority-based policy selection)
- No signature verification tests

**Priority Additions**:
1. Mock Slack API integration test covering the full send-message-and-record-receipt flow
2. SLA detection logic test: message posted, no qualifying reply within threshold, escalation triggered
3. RACI notification mapping test: verify correct channels receive role-appropriate notifications

### 8. Patch List

| Priority | Description | Location |
|----------|-------------|----------|
| **P0** | Add AbortController timeout to `postSlackMessage` and `openSlackDirectConversation` | `slack-notifications.ts:292, 329` |
| **P1** | Log message fetch failures in task creation (non-fatal catch blocks) | Task creation module catch blocks |
| **P1** | Log invalid regex patterns in unanswered detector at ERROR level | Unanswered detector initialization |
| **P2** | Remove timestamp component from dead letter idempotency key | Dead letter key generation |

### 9. Runbook

**On notification failures**:
1. Check dead letter events in the outbox table, filtering by provider = "slack"
2. Check Slack connection status on the integrations dashboard
3. If status is ERROR, the user needs to re-authenticate via OAuth flow
4. If status is CONNECTED but notifications still fail, check the circuit breaker state

**On throttle issues**:
1. Inspect in-memory throttle state via `getThrottleEntry(channelId)`
2. If a channel is stuck in a throttled state, reset with `resetThrottleState(channelId)`
3. If notifications are too aggressive, adjust burst limit and min interval in throttle config
4. If notifications are too infrequent, verify the throttle is not over-suppressing -- check throttle metrics

**On SLA detection false positives**:
1. Review regex patterns in the unanswered request detector config
2. Check qualifying reply logic: only human messages from a different user than the original poster count as replies
3. Verify time thresholds are appropriate for the team's response time expectations

**On RACI notification issues**:
1. Verify RACI assignments on the affected task (R/A/C/I roles)
2. Check channel routing policies for correct priority and project matching
3. Confirm the Slack channels referenced in routing policies still exist and the bot has access

---

## Dossier 3: Coda

### 1. Summary

The Coda integration has 3 modules: row sync (polling-based task creation and update from Coda document rows), decision action converter (creates individual tasks from decision table action items), and dependency gate automation (transitions task status based on gate prerequisite completion). Uses token-based authentication (API key).

### 2. Business Promise

Coda document rows stay in sync with WIPGuard tasks. New rows create tasks, updated rows update existing tasks. Decision table action items are decomposed into individual actionable tasks. Dependency gates automatically advance or block task progression based on prerequisite completion state.

### 3. Data Contract

**Inputs**:
- Coda API rows: column values by name, row metadata (updated timestamps)
- Action items: array or string format from decision tables
- Gate states: boolean or string values from gate columns

**Outputs**:
- Tasks (create and update operations)
- Integration receipts for deduplication
- Domain events for downstream consumers

**Invariants**:
- Incremental sync via `lastUpdatedAt` checkpoint with a 60-second lookback buffer to avoid missing rows updated during the previous sync window
- Idempotent via dedupeKey per row, action item, and gate
- Prisma duplicate constraint errors (P2002) are treated as dedupe signals and silently skipped
- Owner email resolution falls back to the sync-initiating user silently when the specified email is not found

### 4. FMEA

| Failure Mode | Likelihood | Severity | Detection | Mitigation | Status |
|---|---|---|---|---|---|
| Token invalid (401/403) | Medium | High | CodaIntegrationAuthError thrown | Marks connection as ERROR | Implemented |
| API rate limit (429) | Low | Medium | withRetries wrapper | Exponential backoff | Implemented |
| Checkpoint corruption | Low | Medium | JSON parse fails | Falls back to empty checkpoint, **re-processes all rows** | **P1 Gap** |
| Row missing required columns | Medium | Low | extractTaskTitle returns fallback | Task created with generic title | P2 Gap |
| P2002 on non-dedupe constraint | Low | Medium | Caught and treated as dedupe skip | **Genuine unique constraint violations are masked** | **P1 Gap** |
| Owner email not found in system | Medium | Low | Falls back to sync user silently | Tasks misattributed to wrong owner, **no warning logged** | P2 Gap |
| Pagination token invalidated mid-sync | Low | Medium | Unknown -- likely API error | No specific handling | P2 Gap |

### 5. Resilience Design

**Currently Implemented**:
- Token validation on connection
- Circuit breaker integration
- `withRetries` wrapper for API calls (handles 429)
- Per-row error collection with dead-letter recording for individual row failures
- Idempotent receipts with dedupeKey
- P2002 duplicate constraint handling

**Gaps**:
- Checkpoint corruption is handled silently by falling back to empty state, which causes full re-processing of all rows. No log or warning is emitted.
- The P2002 catch is overly broad -- it treats any unique constraint violation as a deduplication signal, potentially masking genuine data integrity errors.
- No explicit timeout configured on Coda API fetch calls.

**Recommendations**:
1. Log checkpoint parse errors at WARN level before falling back
2. Distinguish P2002 errors by checking the constraint name matches the expected dedupe constraint
3. Add explicit fetch timeout via AbortController

### 6. Observability

**Currently Implemented**:
- Per-row error collection with dead letter event recording
- Standard sync observability wrapper

**Gaps**:
- No logging of silent fallbacks (owner email assignment, checkpoint corruption)
- No metrics on sync throughput, row counts, or skip reasons

**Recommendations**:
- Add WARN-level logging for every silent fallback path
- Add counters: rows_processed, rows_created, rows_updated, rows_skipped, rows_failed

### 7. Testing Plan

**Existing Coverage**:
- Default config validation tests
- Dedupe key format tests

**Missing Coverage**:
- Checkpoint filtering logic tests (lookback buffer, incremental vs. full)
- `extractOwnerEmail` edge case tests (missing email, invalid email, email not in system)
- End-to-end sync with mocked Coda API
- Error recovery path tests (what happens after checkpoint corruption)
- Dependency gate state transition tests

**Priority Additions**:
1. Checkpoint filtering test: verify 60-second lookback buffer correctly includes edge-case rows
2. Mocked Coda API integration test: full sync cycle from API response to task creation
3. P2002 disambiguation test: verify dedupe constraint vs. other constraints

### 8. Patch List

| Priority | Description | Location |
|----------|-------------|----------|
| **P1** | Log checkpoint parse errors instead of silent fallback | Checkpoint deserialization logic |
| **P1** | Distinguish P2002 dedupe constraint from other unique constraints | Row upsert error handler |
| **P2** | Log warning when owner email fallback occurs | Owner resolution logic |

### 9. Runbook

**On sync failures**:
1. Check connection status -- if ERROR, verify the API token is still valid in Coda
2. Check circuit breaker state via the integrations API
3. Review dead letter events for specific row-level failures

**On duplicate tasks**:
1. Check the integrationReceipt table for the row's expected dedupeKey
2. If the receipt is missing, the row was likely processed before receipts were implemented
3. Manually deduplicate by archiving the older task and verifying the receipt exists for the survivor

**On dependency gate issues**:
1. Verify gate column values in Coda match the configured `advanceStates` and `blockedStates` values exactly (case-sensitive)
2. Check task metadata for gate signal records
3. Manually transition the task if the gate state is correct but the automation missed it

---

## Dossier 4: Google Workspace

### 1. Summary

Google Workspace integration spans 3 modules: Calendar prep/followup (creates preparation and follow-up tasks for upcoming and past calendar events), Drive comment escalation (creates tasks from assigned comments and review requests on Google Drive files), and Gmail commitment capture (creates tasks from labeled or starred threads with natural language due date extraction). All modules share a single OAuth-based Google Workspace connection.

### 2. Business Promise

Calendar events automatically generate follow-up and preparation tasks. Important Drive comments (assigned to the user or review requests) surface as actionable tasks. Gmail commitments containing due date language are captured and tracked with extracted deadlines.

### 3. Data Contract

**Inputs**:
- Google Calendar events: start/end times, attendees, summary, description
- Drive file comments: author, content, comment type (assigned_comment, review_request)
- Gmail threads: labels, starred status, body content, internal date

**Outputs**:
- Tasks with computed due dates
- Integration receipts
- Domain events

**Invariants**:
- Calendar: prep tasks are created for future events within the configured `leadHours` window; followup tasks are created for past events
- Drive: only `assigned_comment` and `review_request` comment variants create tasks; completed tasks reopen when new comments arrive on the same file
- Gmail: due date extraction from natural language phrases ("by Friday", "YYYY-MM-DD", "end of month", etc.)

### 4. FMEA

| Failure Mode | Likelihood | Severity | Detection | Mitigation | Status |
|---|---|---|---|---|---|
| OAuth token expired | Medium | High | 401 from Google API | Token refresh via getValidIntegrationAccessToken | Implemented |
| Calendar API 250 result limit | Low | Medium | No pagination implemented | **Events beyond 250 are silently dropped** | **P1 Gap** |
| Gmail no pagination | Medium | Medium | maxResults parameter only | **Threads beyond the limit are silently dropped** | **P1 Gap** |
| Date parsing edge cases | Medium | Low | extractDuePhrase returns null | Event skipped, **silent data loss** | P2 Gap |
| Drive file no longer shared with user | Low | Medium | API error on comment fetch | Per-file error handled, continues to next file | P2 Gap |
| Calendar event with no start time | Low | Low | Null reference error | Unhandled, would crash the sync | P2 Gap |

### 5. Resilience Design

**Currently Implemented**:
- Token refresh via shared OAuth infrastructure
- `withRetries` wrapper for API calls
- Per-event error collection (failures on one event do not block others)
- Circuit breaker integration
- Deduplication via integration receipts

**Gaps**:
- No pagination support for Google Calendar API (hard limit of 250 results per request). Users with busy calendars will silently miss events.
- No pagination support for Gmail thread listing. Users with many matching threads will silently miss commitments.
- Date parsing failures are silent -- the event is simply skipped with no log or warning.

**Recommendations**:
1. Implement `nextPageToken` pagination for Calendar API calls
2. Implement pagination for Gmail thread listing
3. Log events skipped due to date parse failure at WARN level with the unparseable phrase included

### 6. Observability

**Currently Implemented**:
- Standard sync observability wrapper
- Domain events for all sync operations

**Gaps**:
- No logging of skipped events due to date parse failure
- No logging of pagination truncation (when >250 events exist)
- No metrics on events processed per module (Calendar vs. Drive vs. Gmail)

**Recommendations**:
- Add WARN log when Calendar API returns a `nextPageToken` that is not followed
- Add WARN log for each event skipped due to date parse failure
- Add per-module counters: events_fetched, tasks_created, events_skipped

### 7. Testing Plan

**Existing Coverage**:
- Config defaults validation tests
- Dedupe key format tests
- Basic `extractDuePhrase` tests for common patterns

**Missing Coverage**:
- Prep/followup time calculation tests (leadHours boundary conditions)
- OAuth token refresh integration test
- Multi-calendar event handling tests
- Drive comment type filtering tests
- Gmail thread date extraction edge cases ("next Tuesday", relative dates)
- Pagination behavior tests (what happens at 250 events)

**Priority Additions**:
1. Calendar prep/followup time boundary test: verify correct task creation at the edge of leadHours window
2. Gmail date extraction comprehensive test: cover all supported natural language patterns
3. Drive comment reopen test: verify completed task reopens on new comment

### 8. Patch List

| Priority | Description | Location |
|----------|-------------|----------|
| **P1** | Add Calendar event pagination (nextPageToken support) | Calendar sync module API call |
| **P1** | Add Gmail thread pagination | Gmail sync module API call |
| **P2** | Log events skipped due to date parse failure | Date extraction fallback path |

### 9. Runbook

**On missed calendar events**:
1. Check if the user has more than 250 events in the sync window
2. If yes, this is the pagination gap -- reduce the sync window or implement pagination
3. Verify the `leadHours` and `lookbackHours` configuration values are appropriate

**On stale Gmail capture**:
1. Check the checkpoint value for `lastInternalDateMs`
2. If it is ahead of the actual last processed thread, the checkpoint may have advanced past unprocessed threads
3. Manually reset the checkpoint by clearing the integration's checkpoint field

**On Drive comment tasks not appearing**:
1. Verify the comment type is `assigned_comment` or `review_request` -- other types are intentionally ignored
2. Check that the Drive file is still shared with the authenticated user
3. Review dead letter events for file-level API errors

---

## Dossier 5: Pylon

### 1. Summary

The Pylon integration has 2 modules: a Pylon API client (fetches issues from the Pylon API with endpoint version fallback) and an issue-to-task sync engine (maps customer support issues to tasks with status resolution, tag-based filtering, and automatic project assignment to a "Customer Support" project).

### 2. Business Promise

Customer support conversations from Pylon surface as tasks in WIPGuard. Urgent issues receive ACTIVE status for immediate attention. Resolved issues automatically complete their corresponding tasks. CSAT scores and response time metrics are tracked on task metadata.

### 3. Data Contract

**Inputs**:
- Pylon issues: status, priority, tags, customer info, CSAT score, response times
- API response with issues array

**Outputs**:
- Tasks created in a "Customer Support" project (auto-created if missing)
- Integration receipts for deduplication
- Domain events

**Invariants**:
- Issues are filtered by urgency flags and configurable include/exclude tag lists
- Status mapping is configurable per status value, with sensible fallbacks (resolved maps to DONE, urgent maps to ACTIVE)
- Upsert behavior: existing receipt with task results in update; existing receipt without task results in skip; no receipt results in create

### 4. FMEA

| Failure Mode | Likelihood | Severity | Detection | Mitigation | Status |
|---|---|---|---|---|---|
| API endpoint not found (404) | Medium | High | 404 response on /issues | Falls back to /v1/issues endpoint | Implemented |
| Token invalid | Medium | High | Non-200 status code | Returns `{ok: false}` tuple | Implemented |
| Large result set (>200 issues) | Low | Medium | No chunking in processing | **All issues processed at once, potential memory spike** | P2 Gap |
| Auto-project creation race condition | Low | Low | Concurrent sync invocations | Could create duplicate "Customer Support" projects | P2 Gap |
| Customer info fields missing | Medium | Low | Defensive field extraction | Tries multiple field name variants | Implemented |

### 5. Resilience Design

**Currently Implemented**:
- Endpoint version fallback (/issues to /v1/issues on 404)
- Defensive field extraction (tries multiple field name patterns for customer data)
- Per-issue error collection with dead-letter recording
- `withRetries` wrapper for API calls

**Gaps**:
- No chunking or batching for large result sets. Processing 200+ issues simultaneously could cause memory pressure.
- No explicit timeout configuration on API calls.
- The auto-project creation for "Customer Support" has no upsert/locking mechanism to prevent race conditions.

**Recommendations**:
1. Add chunking for result sets larger than 50 issues
2. Add explicit fetch timeout
3. Use `findOrCreate` with a unique constraint for the auto-project to prevent duplicates

### 6. Observability

**Currently Implemented**:
- Standard sync observability wrapper
- Per-issue error collection

**Gaps**:
- No logging of endpoint fallback events (when /issues fails and /v1/issues is used)
- No metrics on issue counts, status distribution, or tag filtering results

**Recommendations**:
- Log endpoint fallback at INFO level
- Add counters: issues_fetched, issues_created, issues_updated, issues_filtered

### 7. Testing Plan

**Existing Coverage**:
- Basic config tests
- Dedupe key format tests

**Missing Coverage**:
- Endpoint fallback logic tests
- Status mapping tests (all status values, including unmapped statuses)
- Tag filtering tests (include list, exclude list, both)
- Upsert behavior tests (all three paths: create, update, skip)

**Priority Additions**:
1. Endpoint fallback test: verify /v1/issues is called when /issues returns 404
2. Status mapping comprehensive test: cover all configured status values and the fallback path
3. Tag filtering test: verify include/exclude lists work correctly in combination

### 8. Patch List

| Priority | Description | Location |
|----------|-------------|----------|
| **P2** | Add chunking for large result sets (>50 issues) | Issue processing loop |
| **P2** | Add findOrCreate for "Customer Support" project | Auto-project creation |

### 9. Runbook

**On sync failures**:
1. Check connection status -- if ERROR, verify the API token is valid in Pylon
2. Check circuit breaker state
3. Review dead letter events for issue-level failures

**On missing issues**:
1. Check tag filtering configuration -- issues may be excluded by the include/exclude tag lists
2. Verify the issue status is not mapped to a skip condition
3. Check if the issue was created after the last sync checkpoint

**On duplicate "Customer Support" projects**:
1. Identify the duplicate projects by name
2. Move all tasks to one project
3. Delete the empty duplicate
4. The race condition fix (findOrCreate) should prevent recurrence

---

## Dossier 6: Google Ads

### 1. Summary

Google Ads is a Tier 3 metrics-only integration using the `provider-metrics-sync.ts` framework. It fetches campaign performance data (impressions, clicks, spend, conversions) via the Google Ads API and stores results as AnalyticsSnapshot records. OAuth-based authentication. Uses its own inline token refresh logic rather than the shared `token-refresh.ts`.

### 2. Business Promise

Google Ads campaign metrics refresh reliably on schedule, powering dashboards and analytics views with up-to-date ad spend and performance data.

### 3. Data Contract

**Inputs**:
- Google Ads API responses: campaign data including impressions, clicks, cost, conversions, CTR, CPC
- OAuth token with Google Ads API scope

**Outputs**:
- AnalyticsSnapshot records with Google Ads-specific JSON payload
- Connection status updates

**Invariants**:
- Snapshots use soft/hard stale detection (3-hour hard stale grace period)
- Metrics are aggregated at the campaign level per configured date range

### 4. FMEA

| Failure Mode | Likelihood | Severity | Detection | Mitigation | Status |
|---|---|---|---|---|---|
| OAuth token expired | Medium | High | Auth error on API call | Sets connection to ERROR | Implemented |
| API 5xx transient error | Medium | Medium | Error on fetch | **No retry -- immediate failure** | **P1 Gap** |
| API 429 rate limit | Low | Medium | No detection | **No rate limit handling** | **P1 Gap** |
| Inline token refresh diverges from shared logic | Low | Medium | Behavioral differences | **Not using shared token-refresh.ts** | **P1 Gap** |
| Fetch hangs indefinitely | Low | High | No timeout configured | **Raw fetch with no AbortController** | **P1 Gap** |

### 5. Resilience Design

**Currently Implemented**:
- Auth error detection sets connection to ERROR state
- Checkpoint tracking per sync rule
- Snapshot stale detection (soft and hard thresholds)

**Critical Gap**: The Google Ads fetcher in `fetchers-ads.ts` uses raw `fetch()` with no timeout, no retry logic, and no circuit breaker integration. Additionally, it implements its own inline token refresh rather than using the shared `token-refresh.ts` module.

**Recommendations**:
1. Migrate to `fetchWithResilience` from http-client.ts
2. Consolidate token refresh to use shared `token-refresh.ts`
3. Add circuit breaker integration

### 6. Observability

**Currently Implemented**:
- Connection status tracking
- Snapshot timestamps for stale detection

**Gaps**:
- No logging of fetch failures or retry attempts
- No metrics on API call latency or error rates

### 7. Testing Plan

**Existing Coverage**: Minimal -- config validation only.

**Missing Coverage**: Mocked API response tests, token refresh tests, error handling tests.

### 8. Patch List

| Priority | Description | Location |
|----------|-------------|----------|
| **P1** | Migrate fetcher to use fetchWithResilience | `fetchers-ads.ts` (Google Ads section) |
| **P1** | Consolidate inline token refresh to shared module | `fetchers-ads.ts` (Google Ads token refresh) |
| **P1** | Extend health checks to include Google Ads | `health-checks.ts` |

### 9. Runbook

**On stale metrics**:
1. Check connection status -- if ERROR, user needs to re-authenticate
2. Check the AnalyticsSnapshot table for the most recent record -- compare timestamp to current time
3. If the snapshot is older than the hard stale threshold (3 hours), trigger a manual sync

**On auth failures**:
1. Google Ads OAuth tokens require periodic re-authorization
2. Guide the user through the OAuth reconnection flow
3. Verify the Google Ads API is enabled in the Google Cloud project

---

## Dossier 7: Meta Ads (Facebook)

### 1. Summary

Meta Ads is a Tier 3 metrics-only integration using the `provider-metrics-sync.ts` framework. It fetches Facebook ad campaign performance data via the Meta Marketing API and stores results as AnalyticsSnapshot records. Uses long-lived OAuth tokens, which have a 60-day expiry window.

### 2. Business Promise

Facebook ad campaign metrics refresh reliably on schedule, providing up-to-date spend and performance data for dashboards and analytics.

### 3. Data Contract

**Inputs**:
- Meta Marketing API responses: ad account data, campaign metrics (spend, impressions, clicks, conversions)
- Long-lived OAuth token

**Outputs**:
- AnalyticsSnapshot records with Meta Ads-specific JSON payload
- Connection status updates

**Invariants**:
- Snapshots use soft/hard stale detection (3-hour hard stale grace)
- Long-lived tokens have a 60-day expiry window

### 4. FMEA

| Failure Mode | Likelihood | Severity | Detection | Mitigation | Status |
|---|---|---|---|---|---|
| OAuth token expired (60-day) | Medium | High | Auth error on API call | Sets connection to ERROR | Implemented |
| **No automated re-auth warning** | - | High | Token silently expires | **User not warned before 60-day expiry** | **P1 Gap** |
| API 5xx transient error | Medium | Medium | Error on fetch | **No retry -- immediate failure** | **P1 Gap** |
| API 429 rate limit | Low | Medium | No detection | **No rate limit handling** | **P1 Gap** |
| Fetch hangs indefinitely | Low | High | No timeout | **Raw fetch with no AbortController** | **P1 Gap** |

### 5. Resilience Design

**Currently Implemented**:
- Auth error detection sets connection to ERROR
- Checkpoint tracking
- Snapshot stale detection

**Critical Gaps**:
- Raw `fetch()` with no timeout, retry, or circuit breaker
- 60-day token expiry has no proactive warning. Users discover the token expired only when the sync fails.

**Recommendations**:
1. Migrate to `fetchWithResilience`
2. Implement token expiry tracking: warn at 7 days before expiry, alert at 3 days, ERROR at expiry
3. Add automated re-auth prompt via notification

### 6. Observability

**Currently Implemented**:
- Connection status tracking
- Snapshot timestamps

**Gaps**:
- No token expiry countdown tracking
- No logging of fetch failures

### 7. Testing Plan

**Existing Coverage**: Minimal -- config validation only.

**Missing Coverage**: Token expiry detection tests, mocked API tests, error handling.

### 8. Patch List

| Priority | Description | Location |
|----------|-------------|----------|
| **P1** | Migrate fetcher to use fetchWithResilience | `fetchers-ads.ts` (Meta Ads section) |
| **P1** | Add Meta token expiry warning and re-auth prompt | Token management module |
| **P1** | Extend health checks to include Meta Ads | `health-checks.ts` |

### 9. Runbook

**On stale metrics**:
1. Check connection status
2. If ERROR, the 60-day token likely expired -- user must re-authenticate via OAuth
3. After re-auth, trigger a manual sync to backfill missed data

**On token expiry**:
1. Meta long-lived tokens expire after 60 days with no refresh mechanism
2. The user must complete the full OAuth flow again
3. After the expiry warning is implemented, proactively remind users before expiry

---

## Dossier 8: Meta Page

### 1. Summary

Meta Page is a Tier 3 metrics-only integration using the `provider-metrics-sync.ts` framework. It fetches Facebook Page engagement and insights data via the Meta Graph API. Shares the long-lived OAuth token model with Meta Ads (60-day expiry).

### 2. Business Promise

Facebook Page engagement metrics (likes, comments, shares, reach, impressions) refresh reliably on schedule for dashboards.

### 3. Data Contract

**Inputs**:
- Meta Graph API responses: page insights, engagement metrics
- Long-lived OAuth token (shared characteristics with Meta Ads)

**Outputs**:
- AnalyticsSnapshot records with Meta Page-specific JSON payload
- Connection status updates

**Invariants**:
- Same soft/hard stale detection as other providers (3-hour hard stale grace)
- Token expiry characteristics identical to Meta Ads (60-day window)

### 4. FMEA

| Failure Mode | Likelihood | Severity | Detection | Mitigation | Status |
|---|---|---|---|---|---|
| OAuth token expired (60-day) | Medium | High | Auth error | Sets connection to ERROR | Implemented |
| No automated re-auth warning | - | High | Silent expiry | **Same gap as Meta Ads** | **P1 Gap** |
| API 5xx | Medium | Medium | Error on fetch | **No retry** | **P1 Gap** |
| Raw fetch with no timeout | Low | High | Hung connection | **No AbortController** | **P1 Gap** |

### 5. Resilience Design

Same profile as Meta Ads -- raw `fetch()`, no timeout, no retry, no circuit breaker, no token expiry warning.

**Recommendations**: Same as Meta Ads. Migrate to `fetchWithResilience`, add token expiry tracking.

### 6-7. Observability and Testing

Same gaps as Meta Ads. Minimal coverage.

### 8. Patch List

| Priority | Description | Location |
|----------|-------------|----------|
| **P1** | Migrate fetcher to use fetchWithResilience | `fetchers-ads.ts` (Meta Page section) |
| **P1** | Share Meta token expiry warning with Meta Ads implementation | Token management module |

### 9. Runbook

Same procedures as Meta Ads. The token expiry and re-auth flow are identical.

---

## Dossier 9: Reddit

### 1. Summary

Reddit is a Tier 3 metrics-only integration using the `provider-metrics-sync.ts` framework. It fetches Reddit Ads campaign data via the Reddit Ads API. Uses Basic auth (client_id:secret) for token acquisition, then bearer tokens for API calls. Implements its own inline token refresh logic.

### 2. Business Promise

Reddit ad campaign data refreshes reliably on schedule, providing spend and performance metrics for dashboards.

### 3. Data Contract

**Inputs**:
- Reddit Ads API responses: campaign performance data
- Basic auth credentials (client_id, client_secret) for token acquisition

**Outputs**:
- AnalyticsSnapshot records with Reddit-specific JSON payload
- Connection status updates

**Invariants**:
- Same soft/hard stale detection as other providers
- Token acquired via Basic auth flow, then used as bearer token

### 4. FMEA

| Failure Mode | Likelihood | Severity | Detection | Mitigation | Status |
|---|---|---|---|---|---|
| Token expired | Medium | High | Auth error | Sets connection to ERROR | Implemented |
| Inline token refresh diverges from shared logic | Low | Medium | Behavioral differences | **Not using shared token-refresh.ts** | **P1 Gap** |
| API 5xx | Medium | Medium | Error on fetch | **No retry** | **P1 Gap** |
| Raw fetch with no timeout | Low | High | Hung connection | **No AbortController** | **P1 Gap** |

### 5. Resilience Design

Same profile as Google Ads -- raw `fetch()`, inline token refresh, no timeout, no retry, no circuit breaker.

**Recommendations**:
1. Migrate to `fetchWithResilience`
2. Consolidate token refresh to shared `token-refresh.ts`

### 6-7. Observability and Testing

Minimal coverage. Same gaps as other Tier 3 providers.

### 8. Patch List

| Priority | Description | Location |
|----------|-------------|----------|
| **P1** | Migrate fetcher to use fetchWithResilience | `fetchers-ads.ts` (Reddit section) |
| **P1** | Consolidate inline token refresh to shared module | `fetchers-ads.ts` (Reddit token refresh) |

### 9. Runbook

**On auth failures**:
1. Verify Reddit app credentials (client_id, client_secret) are still valid
2. Check if the Reddit Ads account is still active
3. Re-authenticate if needed

---

## Dossier 10: Stripe

### 1. Summary

Stripe is a Tier 3 metrics-only integration using the `provider-metrics-sync.ts` framework. It fetches revenue data (charges, subscriptions, MRR, balance) via the Stripe API. OAuth-based authentication.

### 2. Business Promise

Revenue data from Stripe refreshes reliably on schedule, providing up-to-date financial metrics for dashboards including MRR, total revenue, and subscription counts.

### 3. Data Contract

**Inputs**:
- Stripe API responses: charges, subscriptions, balance data
- OAuth token

**Outputs**:
- AnalyticsSnapshot records with Stripe-specific JSON payload (revenue, MRR, subscription count)
- Connection status updates

**Invariants**:
- Same soft/hard stale detection as other providers
- Revenue figures are computed from Stripe's native currency amounts

### 4. FMEA

| Failure Mode | Likelihood | Severity | Detection | Mitigation | Status |
|---|---|---|---|---|---|
| OAuth token expired | Medium | High | Auth error | Sets connection to ERROR | Implemented |
| API 5xx | Medium | Medium | Error on fetch | **No retry** | **P1 Gap** |
| Raw fetch with no timeout | Low | High | Hung connection | **No AbortController** | **P1 Gap** |
| Currency conversion issues | Low | Low | Incorrect amounts | No explicit handling | P2 Gap |

### 5. Resilience Design

Same profile as other Tier 3 providers. Raw `fetch()`, no timeout, no retry, no circuit breaker.

**Recommendations**: Migrate to `fetchWithResilience`.

### 6-7. Observability and Testing

Minimal coverage. Same gaps as other Tier 3 providers.

### 8. Patch List

| Priority | Description | Location |
|----------|-------------|----------|
| **P1** | Migrate fetcher to use fetchWithResilience | `fetchers.ts` (Stripe section) |
| **P1** | Extend health checks to include Stripe | `health-checks.ts` |

### 9. Runbook

**On stale revenue data**:
1. Check connection status
2. If ERROR, guide user through OAuth reconnection
3. Verify Stripe API key permissions include read access to charges, subscriptions, and balance

---

## Dossier 11: Mercury

### 1. Summary

Mercury is a Tier 3 metrics-only integration using the `provider-metrics-sync.ts` framework. It fetches banking and cashflow data via the Mercury API. Uses a combination of OAuth PKCE flow and Basic auth for token management.

### 2. Business Promise

Banking and cashflow data from Mercury refreshes reliably on schedule, providing up-to-date financial metrics including account balances, transaction history, and cash runway calculations.

### 3. Data Contract

**Inputs**:
- Mercury API responses: account balances, transactions, cashflow data
- OAuth PKCE + Basic auth tokens

**Outputs**:
- AnalyticsSnapshot records with Mercury-specific JSON payload
- Connection status updates

**Invariants**:
- Same soft/hard stale detection as other providers
- Banking data is read-only; no write operations

### 4. FMEA

| Failure Mode | Likelihood | Severity | Detection | Mitigation | Status |
|---|---|---|---|---|---|
| OAuth token expired | Medium | High | Auth error | Sets connection to ERROR | Implemented |
| API 5xx | Medium | Medium | Error on fetch | **No retry** | **P1 Gap** |
| Raw fetch with no timeout | Low | High | Hung connection | **No AbortController** | **P1 Gap** |
| PKCE flow state mismatch | Low | Medium | Auth error during token exchange | Connection fails, user must retry | P2 Gap |

### 5. Resilience Design

Same profile as other Tier 3 providers. Raw `fetch()`, no timeout, no retry, no circuit breaker.

**Recommendations**: Migrate to `fetchWithResilience`.

### 6-7. Observability and Testing

Minimal coverage. Same gaps as other Tier 3 providers.

### 8. Patch List

| Priority | Description | Location |
|----------|-------------|----------|
| **P1** | Migrate fetcher to use fetchWithResilience | `fetchers.ts` (Mercury section) |
| **P1** | Extend health checks to include Mercury | `health-checks.ts` |

### 9. Runbook

**On stale banking data**:
1. Check connection status
2. Mercury uses PKCE + Basic auth -- if the token expired, the user must re-authenticate through the full OAuth PKCE flow
3. Verify Mercury API access is still authorized in the Mercury dashboard

---

## Dossier 12: Webflow (Tier 4 -- Stub)

### 1. Summary

Webflow is defined in the OAuth connection catalog but has no active sync logic implemented. Only the OAuth connection flow (authorize, callback, token storage) exists.

### 2. Business Promise

**Future**: Site pages, CMS collection items, and form submissions will sync to WIPGuard as tasks or reference data.

### 3-9. Sections Not Applicable

No active data contract, failure modes, resilience design, observability, testing, patches, or runbook procedures are applicable until implementation begins.

**Key Prerequisite**: Define which Webflow data types should surface as tasks vs. reference data, and whether the integration is read-only or bidirectional.

---

## Dossier 13: SEMrush (Tier 4 -- Stub)

### 1. Summary

SEMrush is defined in the provider registry as a token-based auth integration. A token connection route exists for API key storage. No active sync logic is implemented.

### 2. Business Promise

**Future**: SEO metrics, keyword rankings, site audit findings, and backlink data will surface in WIPGuard analytics.

### 3-9. Sections Not Applicable

No active data contract, failure modes, resilience design, observability, testing, patches, or runbook procedures are applicable until implementation begins.

**Key Prerequisite**: Define which SEMrush data types map to AnalyticsSnapshot payloads, and determine polling frequency based on SEMrush API rate limits and data freshness requirements.

---

## Cross-Integration Analysis

### A. Unified Integration Framework Proposal

**Problem Statement**: Each integration module implements its own patterns for API calls, error handling, checkpointing, and status mapping. Some integrations use `fetchWithResilience` from http-client.ts; most do not. Some handle 429 rate limits; most do not. Some have circuit breaker integration; the Tier 3 providers universally lack it.

**Proposal**:

1. **Create `IntegrationApiClient` wrapper** that enforces on every outbound API call:
   - Configurable timeout via AbortController (default 30 seconds)
   - Retry with exponential backoff for transient errors (429, 5xx)
   - Circuit breaker integration (shared DB-backed state)
   - Rate limit detection with Retry-After header parsing
   - Structured error classification (auth, rate_limit, upstream_error, config_error, data_error)

2. **Enforce the wrapper**: All provider API calls MUST go through `IntegrationApiClient`. No raw `fetch()` calls allowed in integration code. This should be enforced via lint rule.

3. **Standard `IntegrationSyncResult` return type** for all sync functions:
   - `processed`: number of records handled
   - `created`: number of new records
   - `updated`: number of updated records
   - `skipped`: number of deduped/filtered records
   - `failed`: number of failed records with error details
   - `deadLetters`: array of dead letter event references

4. **Standard `IntegrationCheckpoint` type** with validated serialization:
   - Type-safe serialization and deserialization
   - Validation on read (with logged fallback, not silent)
   - Version field for forward compatibility

### B. "Never Show Me Errors" UX Policy

The user-facing integration experience should follow these principles:

1. **Connection ERROR state** should include an actionable message explaining what the user needs to do, not just "failed" or "error"
2. **Stale data** should show last-known-good values with a "last updated X ago" indicator, not an error screen
3. **Rate limits** should queue and retry transparently. The user should never see a rate limit error.
4. **Token expiry** should trigger background refresh where possible, and proactive warning where refresh is not possible (Meta 60-day tokens)
5. **Circuit breaker OPEN state** should display "temporarily paused, will retry in X minutes" rather than "failed"

### C. Error Taxonomy Standardization

All integrations should classify errors into exactly 5 categories:

| Category | User Action Required | System Behavior | Example |
|----------|---------------------|-----------------|---------|
| `auth` | Yes -- re-connect | Mark connection ERROR, stop sync | Expired OAuth token, invalid API key |
| `rate_limit` | No | Transparent retry with Retry-After | 429 response from provider |
| `upstream_error` | No | Transparent retry with exponential backoff | 5xx from provider, network timeout |
| `config_error` | Yes -- fix settings | Mark rule as invalid, notify user | Invalid field mapping, missing required config |
| `data_error` | No | Log and skip individual record, continue batch | Malformed row, missing required field |

This taxonomy eliminates ambiguity in error handling and ensures consistent behavior across all 13 integrations.

---

## Consolidated P0/P1 Patch Registry

### P0 Patches (Days 1-14)

| # | Description | Affected Integration(s) | Location |
|---|-------------|------------------------|----------|
| P0-1 | Fix circuit breaker fire-and-forget DB writes -- add `.catch()` with `console.error` | All (shared infra) | `circuit-breaker.ts:191-210, 217-250` |
| P0-2 | Add structured logging to orchestrator catch block | All (shared infra) | `orchestrator.ts:181-185` |
| P0-3 | Add AbortController timeout to `postSlackMessage` and `openSlackDirectConversation` | Slack | `slack-notifications.ts:292, 329` |
| P0-4 | Change cron sync `Promise.all` to `Promise.allSettled` | All (cron-triggered) | `route.ts:50` |

### P1 Patches (Days 15-30)

| # | Description | Affected Integration(s) | Location |
|---|-------------|------------------------|----------|
| P1-1 | Extend health checks to all connected providers | All | `health-checks.ts:40` |
| P1-2 | Migrate fetchers-ads.ts to use `fetchWithResilience` | Google Ads, Meta Ads, Meta Page, Reddit | `fetchers-ads.ts` |
| P1-3 | Migrate fetchers.ts to use `fetchWithResilience` | Stripe, Mercury | `fetchers.ts` |
| P1-4 | Consolidate Google Ads inline token refresh to shared `token-refresh.ts` | Google Ads | `fetchers-ads.ts` |
| P1-5 | Consolidate Reddit Ads inline token refresh to shared `token-refresh.ts` | Reddit | `fetchers-ads.ts` |
| P1-6 | Add Meta token expiry warning and re-auth prompt | Meta Ads, Meta Page | Token management module |
| P1-7 | Add Calendar event pagination (nextPageToken) | Google Workspace | Calendar sync module |
| P1-8 | Add Gmail thread pagination | Google Workspace | Gmail sync module |
| P1-9 | Log checkpoint parse errors instead of silent fallback | Coda | Checkpoint deserialization |
| P1-10 | Distinguish P2002 dedupe from other unique constraints | Coda | Row upsert error handler |
| P1-11 | Log message fetch failures in Slack task creation | Slack | Task creation catch blocks |
| P1-12 | Log invalid regex patterns in unanswered detector | Slack | Detector initialization |
| P1-13 | Log association fetch failures in HubSpot | HubSpot | Association fetch catch blocks |

---

## 90-Day Hardening Roadmap

### Phase 1: Critical Foundation (Days 1-14)

**Goal**: Eliminate all P0 gaps and prevent silent failures.

1. Fix circuit breaker fire-and-forget DB writes (P0-1)
2. Add structured logging to orchestrator catch blocks (P0-2)
3. Add AbortController timeout to all raw `fetch()` calls in Slack notifications (P0-3)
4. Change cron sync from `Promise.all` to `Promise.allSettled` (P0-4)
5. Write tests for all P0 fixes
6. Deploy and monitor for 48 hours before proceeding

### Phase 2: Resilience Gaps (Days 15-30)

**Goal**: Close all P1 gaps. Every provider API call uses resilient infrastructure.

7. Extend health checks to all connected providers (P1-1)
8. Migrate `fetchers-ads.ts` to use `fetchWithResilience` (P1-2)
9. Migrate `fetchers.ts` to use `fetchWithResilience` (P1-3)
10. Consolidate Google Ads and Reddit Ads inline token refresh (P1-4, P1-5)
11. Add Calendar and Gmail pagination support (P1-7, P1-8)
12. Log checkpoint parse errors instead of silent fallback (P1-9)
13. Fix P2002 over-broad catch in Coda (P1-10)
14. Log all silent fallback paths (P1-11, P1-12, P1-13)

### Phase 3: Observability and Testing (Days 31-60)

**Goal**: Full visibility into integration health and comprehensive test coverage.

15. Add correlation IDs to webhook-to-task flow (HubSpot, Slack)
16. Persist HubSpot audit trail entries to database
17. Add integration tests for each provider with mocked APIs
18. Add SLA detection logic tests for Slack unanswered detector
19. Add conflict resolution tests with real database (HubSpot)
20. Add Meta token expiry warning and re-auth prompt (P1-6)
21. Add throttle metrics for Slack notification system

### Phase 4: Framework and Polish (Days 61-90)

**Goal**: Standardized integration framework and production-grade operational maturity.

22. Build unified `IntegrationApiClient` wrapper with enforced timeout/retry/circuit breaker
23. Implement standard `IntegrationSyncResult` return type across all sync functions
24. Implement standard `IntegrationCheckpoint` type with validated serialization
25. Add Redis-backed throttle state for multi-instance Slack deployments
26. Implement "Never Show Me Errors" UX policy across all connection status displays
27. Implement error taxonomy standardization across all integrations
28. Update all runbooks with production-validated procedures
29. Final review and sign-off by Strike Team

---

## Appendix: File Reference Index

Key files referenced across dossiers:

| File | Role | Referenced In |
|------|------|---------------|
| `circuit-breaker.ts` | Shared circuit breaker infrastructure | Dossiers 1, 2, 3 |
| `orchestrator.ts` | Sync orchestration and error handling | Dossier 1 |
| `slack-notifications.ts` | Slack message sending with throttling | Dossier 2 |
| `health-checks.ts` | Provider health check infrastructure | Dossiers 1, 6-11 |
| `route.ts` (cron) | Cron-triggered sync coordination | All |
| `fetchers-ads.ts` | Ad platform API fetchers | Dossiers 6, 7, 8, 9 |
| `fetchers.ts` | Non-ad platform API fetchers | Dossiers 10, 11 |
| `token-refresh.ts` | Shared OAuth token refresh | Dossiers 1, 4, 6, 9 |
| `http-client.ts` | Resilient HTTP client (`fetchWithResilience`) | All (target migration) |
| `provider-metrics-sync.ts` | Generic metrics sync framework | Dossiers 6-11 |
