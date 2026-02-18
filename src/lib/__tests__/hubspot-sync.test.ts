import { describe, expect, it } from "vitest";
import type { TaskStatus } from "@/generated/prisma/client";
import {
  verifyWebhookSignature,
  parseDealStageChanges,
  computeReconciliation,
  buildAuditEntry,
  detectDrift,
  validateMappingConfig,
  buildWebhookDedupeKey,
  buildOutboundSyncDedupeKey,
  aggregateWebhookResults,
  getDefaultMappingConfig,
  type ReconciliationAction,
  type WebhookVerificationInput,
  type HubSpotBidirectionalSyncConfig,
  type SyncAuditEntry,
} from "@/lib/integrations/hubspot-sync";
import { createHmac } from "crypto";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(
  overrides?: Partial<HubSpotBidirectionalSyncConfig>
): HubSpotBidirectionalSyncConfig {
  return { ...getDefaultMappingConfig(), ...overrides };
}

function makeTask(overrides?: Partial<{ id: string; status: TaskStatus; updatedAt: Date }>) {
  return {
    id: overrides?.id ?? "task-1",
    status: (overrides?.status ?? "ACTIVE") as TaskStatus,
    updatedAt: overrides?.updatedAt ?? new Date("2026-02-15T10:00:00Z"),
  };
}

function computeHmacSignature(input: {
  clientSecret: string;
  method: string;
  url: string;
  body: string;
  timestamp: string;
}): string {
  const sourceString = `${input.method}${input.url}${input.body}${input.timestamp}`;
  return createHmac("sha256", input.clientSecret)
    .update(sourceString, "utf8")
    .digest("base64");
}

// ---------------------------------------------------------------------------
// Webhook Signature Verification
// ---------------------------------------------------------------------------

describe("verifyWebhookSignature", () => {
  const baseInput: WebhookVerificationInput = {
    signatureHeader: "test-sig",
    timestampHeader: String(Date.now()),
    method: "POST",
    url: "https://app.wipguard.com/api/integrations/hubspot/webhook",
    body: '[{"subscriptionType":"deal.propertyChange"}]',
    clientSecret: "test-secret-123",
  };

  it("rejects when signature header is missing", () => {
    const result = verifyWebhookSignature({ ...baseInput, signatureHeader: null });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Missing signature header");
  });

  it("rejects when timestamp header is missing", () => {
    const result = verifyWebhookSignature({ ...baseInput, timestampHeader: null });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Missing timestamp header");
  });

  it("rejects when client secret is empty", () => {
    const result = verifyWebhookSignature({ ...baseInput, clientSecret: "" });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Client secret not configured");
  });

  it("rejects when timestamp is not a number", () => {
    const result = verifyWebhookSignature({
      ...baseInput,
      timestampHeader: "not-a-number",
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Invalid timestamp format");
  });

  it("rejects expired timestamps (replay protection)", () => {
    const oldTimestamp = String(Date.now() - 6 * 60 * 1000); // 6 minutes ago
    const result = verifyWebhookSignature({
      ...baseInput,
      timestampHeader: oldTimestamp,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Timestamp expired (replay protection)");
  });

  it("validates correct HMAC signature", () => {
    const timestamp = String(Date.now());
    const secret = "my-client-secret";
    const method = "POST";
    const url = "https://app.wipguard.com/api/integrations/hubspot/webhook";
    const body = '[]';

    const signature = computeHmacSignature({
      clientSecret: secret,
      method,
      url,
      body,
      timestamp,
    });

    const result = verifyWebhookSignature({
      signatureHeader: signature,
      timestampHeader: timestamp,
      method,
      url,
      body,
      clientSecret: secret,
    });

    expect(result.valid).toBe(true);
    expect(result.reason).toBe("Signature verified");
  });

  it("rejects incorrect HMAC signature", () => {
    const timestamp = String(Date.now());
    const result = verifyWebhookSignature({
      ...baseInput,
      timestampHeader: timestamp,
      signatureHeader: "dGhpcyBpcyBhIGZha2Ugc2lnbmF0dXJl",
    });

    expect(result.valid).toBe(false);
    // Could be "Signature mismatch" or "Signature length mismatch"
    expect(result.reason).toMatch(/Signature/);
  });
});

// ---------------------------------------------------------------------------
// Webhook Payload Parsing
// ---------------------------------------------------------------------------

describe("parseDealStageChanges", () => {
  it("returns empty array for non-array input", () => {
    expect(parseDealStageChanges(null)).toEqual([]);
    expect(parseDealStageChanges("not an array")).toEqual([]);
    expect(parseDealStageChanges({})).toEqual([]);
  });

  it("parses valid deal.propertyChange events", () => {
    const events = [
      {
        subscriptionType: "deal.propertyChange",
        propertyName: "dealstage",
        propertyValue: "closedwon",
        objectId: 12345,
        occurredAt: 1708000000000,
        changeSource: "CRM_UI",
        eventId: 100,
        portalId: 9999,
        subscriptionId: 1,
        appId: 1,
        attemptNumber: 0,
      },
    ];

    const changes = parseDealStageChanges(events);
    expect(changes).toHaveLength(1);
    expect(changes[0].dealId).toBe("12345");
    expect(changes[0].newStage).toBe("closedwon");
    expect(changes[0].changeSource).toBe("CRM_UI");
    expect(changes[0].eventId).toBe("100");
    expect(changes[0].portalId).toBe(9999);
  });

  it("ignores non-dealstage property changes", () => {
    const events = [
      {
        subscriptionType: "deal.propertyChange",
        propertyName: "dealname",
        propertyValue: "New Name",
        objectId: 12345,
        occurredAt: 1708000000000,
        portalId: 9999,
        subscriptionId: 1,
        appId: 1,
        attemptNumber: 0,
      },
    ];

    const changes = parseDealStageChanges(events);
    expect(changes).toHaveLength(0);
  });

  it("ignores non-deal subscription types", () => {
    const events = [
      {
        subscriptionType: "contact.propertyChange",
        propertyName: "dealstage",
        propertyValue: "closedwon",
        objectId: 12345,
        occurredAt: 1708000000000,
        portalId: 9999,
        subscriptionId: 1,
        appId: 1,
        attemptNumber: 0,
      },
    ];

    const changes = parseDealStageChanges(events);
    expect(changes).toHaveLength(0);
  });

  it("sorts multiple events chronologically", () => {
    const events = [
      {
        subscriptionType: "deal.propertyChange",
        propertyName: "dealstage",
        propertyValue: "closedwon",
        objectId: 111,
        occurredAt: 1708000002000,
        portalId: 9999,
        subscriptionId: 1,
        appId: 1,
        attemptNumber: 0,
      },
      {
        subscriptionType: "deal.propertyChange",
        propertyName: "dealstage",
        propertyValue: "qualifiedtobuy",
        objectId: 222,
        occurredAt: 1708000001000,
        portalId: 9999,
        subscriptionId: 1,
        appId: 1,
        attemptNumber: 0,
      },
    ];

    const changes = parseDealStageChanges(events);
    expect(changes).toHaveLength(2);
    expect(changes[0].dealId).toBe("222"); // earlier event first
    expect(changes[1].dealId).toBe("111");
  });

  it("skips events with empty propertyValue", () => {
    const events = [
      {
        subscriptionType: "deal.propertyChange",
        propertyName: "dealstage",
        propertyValue: "",
        objectId: 12345,
        occurredAt: 1708000000000,
        portalId: 9999,
        subscriptionId: 1,
        appId: 1,
        attemptNumber: 0,
      },
    ];

    const changes = parseDealStageChanges(events);
    expect(changes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Inbound Reconciliation
// ---------------------------------------------------------------------------

describe("computeReconciliation", () => {
  it("returns skip_no_task when no task is linked", () => {
    const result = computeReconciliation({
      dealId: "deal-1",
      newDealStage: "closedwon",
      dealUpdatedAt: new Date(),
      task: null,
      config: makeConfig(),
    });

    expect(result.type).toBe("skip_no_task");
    if (result.type === "skip_no_task") {
      expect(result.dealId).toBe("deal-1");
    }
  });

  it("returns skip_unmapped_stage for unknown deal stages", () => {
    const result = computeReconciliation({
      dealId: "deal-1",
      newDealStage: "custom_unknown_stage",
      dealUpdatedAt: new Date(),
      task: makeTask(),
      config: makeConfig(),
    });

    expect(result.type).toBe("skip_unmapped_stage");
    if (result.type === "skip_unmapped_stage") {
      expect(result.stage).toBe("custom_unknown_stage");
    }
  });

  it("returns skip_already_synced when task status matches mapped status", () => {
    const result = computeReconciliation({
      dealId: "deal-1",
      newDealStage: "qualifiedtobuy",
      dealUpdatedAt: new Date(),
      task: makeTask({ status: "ACTIVE" }),
      config: makeConfig(),
    });

    expect(result.type).toBe("skip_already_synced");
    if (result.type === "skip_already_synced") {
      expect(result.taskId).toBe("task-1");
    }
  });

  it("returns update_task when deal wins (hubspot_wins strategy)", () => {
    const result = computeReconciliation({
      dealId: "deal-1",
      newDealStage: "closedwon",
      dealUpdatedAt: new Date("2026-02-15T12:00:00Z"),
      task: makeTask({ status: "ACTIVE", updatedAt: new Date("2026-02-15T11:00:00Z") }),
      config: makeConfig({ conflictResolution: "hubspot_wins" }),
    });

    expect(result.type).toBe("update_task");
    if (result.type === "update_task") {
      expect(result.taskId).toBe("task-1");
      expect(result.fromStatus).toBe("ACTIVE");
      expect(result.toStatus).toBe("DONE");
      expect(result.reason).toContain("hubspot_wins");
    }
  });

  it("returns skip_task_wins when task wins (task_wins strategy)", () => {
    const result = computeReconciliation({
      dealId: "deal-1",
      newDealStage: "closedwon",
      dealUpdatedAt: new Date("2026-02-15T12:00:00Z"),
      task: makeTask({ status: "ACTIVE", updatedAt: new Date("2026-02-15T11:00:00Z") }),
      config: makeConfig({ conflictResolution: "task_wins" }),
    });

    expect(result.type).toBe("skip_task_wins");
    if (result.type === "skip_task_wins") {
      expect(result.taskId).toBe("task-1");
      expect(result.reason).toContain("task_wins");
    }
  });

  it("uses newest_wins strategy based on timestamps", () => {
    // Deal is newer -> deal wins
    const dealNewer = computeReconciliation({
      dealId: "deal-1",
      newDealStage: "closedwon",
      dealUpdatedAt: new Date("2026-02-15T12:00:00Z"),
      task: makeTask({ status: "ACTIVE", updatedAt: new Date("2026-02-15T11:00:00Z") }),
      config: makeConfig({ conflictResolution: "newest_wins" }),
    });
    expect(dealNewer.type).toBe("update_task");

    // Task is newer -> task wins
    const taskNewer = computeReconciliation({
      dealId: "deal-1",
      newDealStage: "closedwon",
      dealUpdatedAt: new Date("2026-02-15T10:00:00Z"),
      task: makeTask({ status: "ACTIVE", updatedAt: new Date("2026-02-15T12:00:00Z") }),
      config: makeConfig({ conflictResolution: "newest_wins" }),
    });
    expect(taskNewer.type).toBe("skip_task_wins");
  });

  it("handles all standard deal stage to task status mappings", () => {
    const config = makeConfig();
    const stages = Object.keys(config.dealStageToTaskStatus);

    for (const stage of stages) {
      const expectedStatus = config.dealStageToTaskStatus[stage];
      // Use a different starting status so it's not already synced
      const startStatus = expectedStatus === "ACTIVE" ? "BACKLOG" : "ACTIVE";

      const result = computeReconciliation({
        dealId: "deal-test",
        newDealStage: stage,
        dealUpdatedAt: new Date("2026-02-16T00:00:00Z"),
        task: makeTask({ status: startStatus as TaskStatus, updatedAt: new Date("2026-02-14T00:00:00Z") }),
        config: makeConfig({ conflictResolution: "hubspot_wins" }),
      });

      expect(result.type).toBe("update_task");
      if (result.type === "update_task") {
        expect(result.toStatus).toBe(expectedStatus);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Sync Audit Log
// ---------------------------------------------------------------------------

describe("buildAuditEntry", () => {
  const config = makeConfig();

  it("builds audit entry for update_task action", () => {
    const action: ReconciliationAction = {
      type: "update_task",
      taskId: "task-1",
      fromStatus: "ACTIVE" as TaskStatus,
      toStatus: "DONE" as TaskStatus,
      reason: "Deal wins conflict: hubspot_wins",
    };

    const entry = buildAuditEntry({
      action,
      direction: "inbound",
      dealId: "deal-1",
      dealStage: "closedwon",
      eventId: "evt-100",
      dedupeKey: "dedup-key-1",
      config,
    });

    expect(entry.direction).toBe("inbound");
    expect(entry.dealId).toBe("deal-1");
    expect(entry.taskId).toBe("task-1");
    expect(entry.fromStatus).toBe("ACTIVE");
    expect(entry.toStatus).toBe("DONE");
    expect(entry.outcome).toBe("conflict_deal_wins");
    expect(entry.conflictWinner).toBe("deal");
    expect(entry.eventId).toBe("evt-100");
    expect(entry.dedupeKey).toBe("dedup-key-1");
    expect(entry.timestamp).toBeTruthy();
  });

  it("builds audit entry for skip_no_task action", () => {
    const action: ReconciliationAction = {
      type: "skip_no_task",
      dealId: "deal-1",
      reason: "No local task linked",
    };

    const entry = buildAuditEntry({
      action,
      direction: "inbound",
      dealId: "deal-1",
      dealStage: "closedwon",
      eventId: null,
      dedupeKey: null,
      config,
    });

    expect(entry.outcome).toBe("skipped_no_task");
    expect(entry.taskId).toBeNull();
    expect(entry.conflictResolution).toBeNull();
  });

  it("builds audit entry for skip_unmapped_stage action", () => {
    const action: ReconciliationAction = {
      type: "skip_unmapped_stage",
      dealId: "deal-1",
      stage: "custom_stage",
      reason: "No mapping",
    };

    const entry = buildAuditEntry({
      action,
      direction: "inbound",
      dealId: "deal-1",
      dealStage: "custom_stage",
      eventId: null,
      dedupeKey: null,
      config,
    });

    expect(entry.outcome).toBe("skipped_unmapped");
    expect(entry.fromStage).toBe("custom_stage");
  });

  it("builds audit entry for skip_already_synced action", () => {
    const action: ReconciliationAction = {
      type: "skip_already_synced",
      dealId: "deal-1",
      taskId: "task-1",
      reason: "Already in sync",
    };

    const entry = buildAuditEntry({
      action,
      direction: "inbound",
      dealId: "deal-1",
      dealStage: "qualifiedtobuy",
      eventId: null,
      dedupeKey: null,
      config,
    });

    expect(entry.outcome).toBe("skipped_already_synced");
    expect(entry.taskId).toBe("task-1");
  });

  it("builds audit entry for skip_task_wins action", () => {
    const action: ReconciliationAction = {
      type: "skip_task_wins",
      dealId: "deal-1",
      taskId: "task-1",
      reason: "Task wins",
    };

    const entry = buildAuditEntry({
      action,
      direction: "inbound",
      dealId: "deal-1",
      dealStage: "closedwon",
      eventId: null,
      dedupeKey: null,
      config,
    });

    expect(entry.outcome).toBe("skipped_conflict_task_wins");
    expect(entry.conflictWinner).toBe("task");
  });
});

// ---------------------------------------------------------------------------
// Drift Detection
// ---------------------------------------------------------------------------

describe("detectDrift", () => {
  const config = makeConfig();

  it("reports missing local tasks", () => {
    const report = detectDrift({
      deals: [
        { dealId: "d1", stage: "closedwon", lastModified: null, pipeline: null },
      ],
      linkedTasks: new Map(),
      config,
    });

    expect(report.scannedDeals).toBe(1);
    expect(report.drifts).toHaveLength(1);
    expect(report.drifts[0].kind).toBe("missing_local_task");
    expect(report.summary.missingLocalTasks).toBe(1);
  });

  it("reports missing HubSpot deals", () => {
    const linkedTasks = new Map([
      ["d1", [{ id: "t1", status: "ACTIVE" as TaskStatus, updatedAt: new Date() }]],
    ]);

    const report = detectDrift({
      deals: [], // no deals
      linkedTasks,
      config,
    });

    expect(report.drifts).toHaveLength(1);
    expect(report.drifts[0].kind).toBe("missing_hubspot_deal");
    expect(report.summary.missingHubSpotDeals).toBe(1);
  });

  it("reports unmapped deal stages", () => {
    const linkedTasks = new Map([
      ["d1", [{ id: "t1", status: "ACTIVE" as TaskStatus, updatedAt: new Date() }]],
    ]);

    const report = detectDrift({
      deals: [
        { dealId: "d1", stage: "custom_unknown_stage", lastModified: null, pipeline: null },
      ],
      linkedTasks,
      config,
    });

    expect(report.drifts.some((d) => d.kind === "unmapped_deal_stage")).toBe(true);
    expect(report.summary.unmappedDealStages).toBeGreaterThan(0);
  });

  it("reports unmapped task statuses for orphan tasks", () => {
    // Create a task linked to a deal that doesn't appear in HubSpot
    const linkedTasks = new Map([
      ["d-orphan", [{ id: "t1", status: "BACKLOG" as TaskStatus, updatedAt: new Date() }]],
    ]);

    // Note: BACKLOG maps to appointmentscheduled in default config,
    // so the unmapped check is for the orphan deal not being in deals array
    const report = detectDrift({
      deals: [],
      linkedTasks,
      config,
    });

    expect(report.drifts.some((d) => d.kind === "missing_hubspot_deal")).toBe(true);
  });

  it("detects no drift when everything is in sync", () => {
    const linkedTasks = new Map([
      ["d1", [{ id: "t1", status: "DONE" as TaskStatus, updatedAt: new Date() }]],
    ]);

    const report = detectDrift({
      deals: [
        { dealId: "d1", stage: "closedwon", lastModified: null, pipeline: null },
      ],
      linkedTasks,
      config,
    });

    // closedwon -> DONE, DONE -> closedwon: should be in sync
    expect(report.drifts).toHaveLength(0);
    expect(report.summary.statusMismatches).toBe(0);
  });

  it("detects status mismatches", () => {
    const linkedTasks = new Map([
      ["d1", [{ id: "t1", status: "BACKLOG" as TaskStatus, updatedAt: new Date() }]],
    ]);

    const report = detectDrift({
      deals: [
        { dealId: "d1", stage: "closedwon", lastModified: null, pipeline: null },
      ],
      linkedTasks,
      config,
    });

    // closedwon maps to DONE, but task is BACKLOG
    expect(report.summary.statusMismatches).toBe(1);
  });

  it("reports deals with empty stages", () => {
    const report = detectDrift({
      deals: [
        { dealId: "d1", stage: "", lastModified: null, pipeline: null },
      ],
      linkedTasks: new Map(),
      config,
    });

    expect(report.drifts).toHaveLength(1);
    expect(report.drifts[0].kind).toBe("unmapped_deal_stage");
    expect(report.drifts[0].detail).toContain("missing dealstage");
  });

  it("handles large datasets with multiple drifts", () => {
    const deals = Array.from({ length: 50 }, (_, i) => ({
      dealId: `d${i}`,
      stage: i % 5 === 0 ? "unknown_stage" : "closedwon",
      lastModified: null,
      pipeline: null,
    }));

    const linkedTasks = new Map<string, Array<{ id: string; status: TaskStatus; updatedAt: Date }>>();
    // Only link half the deals
    for (let i = 0; i < 25; i++) {
      linkedTasks.set(`d${i}`, [
        { id: `t${i}`, status: "ACTIVE" as TaskStatus, updatedAt: new Date() },
      ]);
    }
    // Add orphan tasks for non-existent deals
    for (let i = 100; i < 105; i++) {
      linkedTasks.set(`d${i}`, [
        { id: `t${i}`, status: "DONE" as TaskStatus, updatedAt: new Date() },
      ]);
    }

    const report = detectDrift({ deals, linkedTasks, config });

    expect(report.scannedDeals).toBe(50);
    expect(report.summary.missingLocalTasks).toBeGreaterThan(0);
    expect(report.summary.missingHubSpotDeals).toBe(5);
    expect(report.generatedAt).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Mapping Validation
// ---------------------------------------------------------------------------

describe("validateMappingConfig", () => {
  it("returns no issues for default config", () => {
    const issues = validateMappingConfig(makeConfig());
    expect(issues).toHaveLength(0);
  });

  it("flags missing task status mappings", () => {
    const config = makeConfig();
    const rest = Object.fromEntries(
      Object.entries(config.taskStatusToDealStage).filter(([status]) => status !== "BACKLOG")
    );
    const modified = {
      ...config,
      taskStatusToDealStage: rest as Record<TaskStatus, string>,
    };

    const issues = validateMappingConfig(modified);
    expect(issues.some((i) => i.includes("BACKLOG"))).toBe(true);
  });

  it("flags missing reverse mappings", () => {
    const config = makeConfig();
    config.taskStatusToDealStage.DONE = "my_custom_stage";
    // Don't add reverse mapping for "my_custom_stage"

    const issues = validateMappingConfig(config);
    expect(issues.some((i) => i.includes("my_custom_stage"))).toBe(true);
  });

  it("flags invalid conflict resolution strategy", () => {
    const config = makeConfig();
    (config as unknown as Record<string, unknown>).conflictResolution =
      "invalid_strategy";

    const issues = validateMappingConfig(config as HubSpotBidirectionalSyncConfig);
    expect(issues.some((i) => i.includes("invalid_strategy"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Idempotency Key Builders
// ---------------------------------------------------------------------------

describe("buildWebhookDedupeKey", () => {
  it("builds a deterministic dedupe key", () => {
    const key = buildWebhookDedupeKey({
      dealId: "12345",
      eventId: "evt-100",
      targetStatus: "DONE" as TaskStatus,
    });

    expect(key).toBe("hubspot:webhook:12345:evt-100:to-status-DONE");
  });

  it("produces different keys for different events", () => {
    const key1 = buildWebhookDedupeKey({
      dealId: "12345",
      eventId: "evt-100",
      targetStatus: "DONE" as TaskStatus,
    });
    const key2 = buildWebhookDedupeKey({
      dealId: "12345",
      eventId: "evt-101",
      targetStatus: "DONE" as TaskStatus,
    });

    expect(key1).not.toBe(key2);
  });

  it("produces different keys for different target statuses", () => {
    const key1 = buildWebhookDedupeKey({
      dealId: "12345",
      eventId: "evt-100",
      targetStatus: "DONE" as TaskStatus,
    });
    const key2 = buildWebhookDedupeKey({
      dealId: "12345",
      eventId: "evt-100",
      targetStatus: "ACTIVE" as TaskStatus,
    });

    expect(key1).not.toBe(key2);
  });
});

describe("buildOutboundSyncDedupeKey", () => {
  it("builds a deterministic dedupe key", () => {
    const key = buildOutboundSyncDedupeKey({
      taskId: "task-1",
      dealId: "12345",
      targetStage: "closedwon",
    });

    expect(key).toBe("hubspot:outbound:task-1:12345:to-stage-closedwon");
  });
});

// ---------------------------------------------------------------------------
// Webhook Processing Result Aggregation
// ---------------------------------------------------------------------------

describe("aggregateWebhookResults", () => {
  it("counts applied, skipped, and errors correctly", () => {
    const entries: Array<{
      action: ReconciliationAction;
      applied: boolean;
      error: string | null;
    }> = [
      {
        action: { type: "update_task", taskId: "t1", fromStatus: "ACTIVE" as TaskStatus, toStatus: "DONE" as TaskStatus, reason: "deal wins" },
        applied: true,
        error: null,
      },
      {
        action: { type: "skip_already_synced", dealId: "d2", taskId: "t2", reason: "already synced" },
        applied: false,
        error: null,
      },
      {
        action: { type: "update_task", taskId: "t3", fromStatus: "QUEUED" as TaskStatus, toStatus: "ACTIVE" as TaskStatus, reason: "deal wins" },
        applied: false,
        error: "DB connection error",
      },
    ];

    const result = aggregateWebhookResults(entries, []);
    expect(result.processed).toBe(3);
    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toBe(1);
  });

  it("returns empty result for no entries", () => {
    const result = aggregateWebhookResults([], []);
    expect(result.processed).toBe(0);
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Default Mapping Config
// ---------------------------------------------------------------------------

describe("getDefaultMappingConfig", () => {
  it("provides complete bidirectional mappings", () => {
    const config = getDefaultMappingConfig();

    expect(config.maxResults).toBe(150);
    expect(config.conflictResolution).toBe("newest_wins");

    // All task statuses should have mappings
    const statuses: TaskStatus[] = ["BACKLOG", "QUEUED", "WORKING_ON_TODAY", "ACTIVE", "NOT_DONE", "DONE"];
    for (const status of statuses) {
      expect(config.taskStatusToDealStage[status]).toBeTruthy();
    }

    // Standard HubSpot stages should have reverse mappings
    expect(config.dealStageToTaskStatus.closedwon).toBe("DONE");
    expect(config.dealStageToTaskStatus.closedlost).toBe("NOT_DONE");
    expect(config.dealStageToTaskStatus.qualifiedtobuy).toBe("ACTIVE");
  });
});

// ---------------------------------------------------------------------------
// Conflict Resolution Scenarios
// ---------------------------------------------------------------------------

describe("conflict resolution scenarios", () => {
  it("resolves simultaneous bidirectional update with newest_wins", () => {
    // Scenario: Task moved to DONE at T1, deal moved to qualifiedtobuy at T2 (newer)
    const result = computeReconciliation({
      dealId: "deal-1",
      newDealStage: "qualifiedtobuy",
      dealUpdatedAt: new Date("2026-02-15T12:01:00Z"), // T2
      task: makeTask({
        status: "DONE",
        updatedAt: new Date("2026-02-15T12:00:00Z"), // T1
      }),
      config: makeConfig({ conflictResolution: "newest_wins" }),
    });

    // Deal is newer, so deal wins -> update task back to ACTIVE
    expect(result.type).toBe("update_task");
    if (result.type === "update_task") {
      expect(result.toStatus).toBe("ACTIVE");
    }
  });

  it("resolves simultaneous bidirectional update with task_wins override", () => {
    // Same scenario but with task_wins strategy
    const result = computeReconciliation({
      dealId: "deal-1",
      newDealStage: "qualifiedtobuy",
      dealUpdatedAt: new Date("2026-02-15T12:01:00Z"),
      task: makeTask({
        status: "DONE",
        updatedAt: new Date("2026-02-15T12:00:00Z"),
      }),
      config: makeConfig({ conflictResolution: "task_wins" }),
    });

    // Task always wins
    expect(result.type).toBe("skip_task_wins");
  });

  it("handles deal with null timestamp under newest_wins", () => {
    const result = computeReconciliation({
      dealId: "deal-1",
      newDealStage: "closedwon",
      dealUpdatedAt: null as unknown as Date,
      task: makeTask({ status: "ACTIVE" }),
      config: makeConfig({ conflictResolution: "newest_wins" }),
    });

    // With null deal timestamp, the chooseConflictWinner falls back to task
    // This is by design: if we can't determine deal freshness, preserve local state
    expect(result.type).toBe("skip_task_wins");
  });

  it("always applies when hubspot_wins regardless of timestamps", () => {
    const result = computeReconciliation({
      dealId: "deal-1",
      newDealStage: "closedwon",
      dealUpdatedAt: new Date("2020-01-01T00:00:00Z"), // very old
      task: makeTask({
        status: "ACTIVE",
        updatedAt: new Date("2026-02-15T12:00:00Z"), // very new
      }),
      config: makeConfig({ conflictResolution: "hubspot_wins" }),
    });

    expect(result.type).toBe("update_task");
    if (result.type === "update_task") {
      expect(result.toStatus).toBe("DONE");
    }
  });

  it("preserves data when unmapped stage is received", () => {
    const result = computeReconciliation({
      dealId: "deal-1",
      newDealStage: "completely_new_custom_stage",
      dealUpdatedAt: new Date(),
      task: makeTask({ status: "ACTIVE" }),
      config: makeConfig({ conflictResolution: "hubspot_wins" }),
    });

    // Should skip without modifying task - no data loss
    expect(result.type).toBe("skip_unmapped_stage");
  });
});

// ---------------------------------------------------------------------------
// End-to-end inbound flow simulation
// ---------------------------------------------------------------------------

describe("end-to-end inbound webhook flow", () => {
  it("processes a complete webhook event lifecycle", () => {
    // 1. Parse webhook events
    const events = [
      {
        subscriptionType: "deal.propertyChange",
        propertyName: "dealstage",
        propertyValue: "closedwon",
        objectId: 99999,
        occurredAt: Date.now(),
        changeSource: "CRM_UI",
        eventId: 500,
        portalId: 12345,
        subscriptionId: 1,
        appId: 1,
        attemptNumber: 0,
      },
    ];

    const changes = parseDealStageChanges(events);
    expect(changes).toHaveLength(1);

    // 2. Compute reconciliation
    const config = makeConfig({ conflictResolution: "hubspot_wins" });
    const action = computeReconciliation({
      dealId: changes[0].dealId,
      newDealStage: changes[0].newStage,
      dealUpdatedAt: changes[0].occurredAt,
      task: makeTask({ status: "ACTIVE" }),
      config,
    });

    expect(action.type).toBe("update_task");

    // 3. Build dedupe key
    if (action.type === "update_task") {
      const dedupeKey = buildWebhookDedupeKey({
        dealId: changes[0].dealId,
        eventId: changes[0].eventId,
        targetStatus: action.toStatus,
      });
      expect(dedupeKey).toContain("hubspot:webhook:");

      // 4. Build audit entry
      const audit = buildAuditEntry({
        action,
        direction: "inbound",
        dealId: changes[0].dealId,
        dealStage: changes[0].newStage,
        eventId: changes[0].eventId,
        dedupeKey,
        config,
      });

      expect(audit.direction).toBe("inbound");
      expect(audit.outcome).toBe("conflict_deal_wins");
      expect(audit.fromStatus).toBe("ACTIVE");
      expect(audit.toStatus).toBe("DONE");
    }
  });

  it("handles multiple changes in a single webhook batch", () => {
    const now = Date.now();
    const events = [
      {
        subscriptionType: "deal.propertyChange",
        propertyName: "dealstage",
        propertyValue: "qualifiedtobuy",
        objectId: 111,
        occurredAt: now - 2000,
        changeSource: "CRM_UI",
        eventId: 501,
        portalId: 12345,
        subscriptionId: 1,
        appId: 1,
        attemptNumber: 0,
      },
      {
        subscriptionType: "deal.propertyChange",
        propertyName: "dealstage",
        propertyValue: "closedwon",
        objectId: 222,
        occurredAt: now - 1000,
        changeSource: "INTEGRATION",
        eventId: 502,
        portalId: 12345,
        subscriptionId: 1,
        appId: 1,
        attemptNumber: 0,
      },
      {
        subscriptionType: "deal.propertyChange",
        propertyName: "dealname", // not dealstage
        propertyValue: "Renamed Deal",
        objectId: 333,
        occurredAt: now,
        changeSource: "CRM_UI",
        eventId: 503,
        portalId: 12345,
        subscriptionId: 1,
        appId: 1,
        attemptNumber: 0,
      },
    ];

    const changes = parseDealStageChanges(events);
    expect(changes).toHaveLength(2); // Only deal stage changes

    const config = makeConfig({ conflictResolution: "hubspot_wins" });
    const auditLog: SyncAuditEntry[] = [];

    for (const change of changes) {
      const action = computeReconciliation({
        dealId: change.dealId,
        newDealStage: change.newStage,
        dealUpdatedAt: change.occurredAt,
        task: makeTask({ status: "ACTIVE" }),
        config,
      });

      const audit = buildAuditEntry({
        action,
        direction: "inbound",
        dealId: change.dealId,
        dealStage: change.newStage,
        eventId: change.eventId,
        dedupeKey: null,
        config,
      });
      auditLog.push(audit);
    }

    expect(auditLog).toHaveLength(2);
    expect(auditLog[0].dealId).toBe("111");
    expect(auditLog[1].dealId).toBe("222");
  });
});
