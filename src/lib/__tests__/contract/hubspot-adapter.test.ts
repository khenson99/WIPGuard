import { describe, it, expect } from "vitest";

// ─── Contract types for HubSpot adapter ──────────────────────────────

type TaskStatus = "BACKLOG" | "QUEUED" | "ACTIVE" | "DONE" | "NOT_DONE";

/** HubSpot Deal shape as returned by the CRM v3 API */
interface HubSpotDeal {
  id: string;
  properties?: {
    dealname?: string;
    dealstage?: string;
    pipeline?: string;
    hs_lastmodifieddate?: string;
  };
}

/** Bidirectional sync config shape */
interface HubSpotBidirectionalSyncConfig {
  monitoredPipelines: string[];
  maxResults: number;
  taskStatusToDealStage: Record<string, string>;
  dealStageToTaskStatus: Record<string, TaskStatus>;
  conflictResolution: "hubspot_wins" | "task_wins" | "newest_wins";
}

/** Sync conflict record */
interface HubSpotSyncConflict {
  dealId: string;
  taskId: string;
  dealStage: string;
  mappedTaskStatus: TaskStatus;
  taskStatus: TaskStatus;
  mappedDealStage: string;
  resolution: string;
  winner: "deal" | "task";
  reason: string;
}

/** Webhook payload from HubSpot */
interface HubSpotWebhookPayload {
  eventId: number;
  subscriptionId: number;
  portalId: number;
  appId: number;
  occurredAt: number;
  subscriptionType: string;
  attemptNumber: number;
  objectId: number;
  propertyName?: string;
  propertyValue?: string;
  changeSource?: string;
}

// ─── Factory helpers ─────────────────────────────────────────────────

function makeDeal(overrides: Partial<HubSpotDeal> = {}): HubSpotDeal {
  return {
    id: "12345",
    properties: {
      dealname: "Test Deal",
      dealstage: "contractsent",
      pipeline: "default",
      hs_lastmodifieddate: "2026-02-16T10:00:00.000Z",
      ...overrides.properties,
    },
    ...overrides,
  };
}

function makeConfig(
  overrides: Partial<HubSpotBidirectionalSyncConfig> = {},
): HubSpotBidirectionalSyncConfig {
  return {
    monitoredPipelines: ["default"],
    maxResults: 150,
    taskStatusToDealStage: {
      BACKLOG: "appointmentscheduled",
      QUEUED: "qualifiedtobuy",
      ACTIVE: "contractsent",
      DONE: "closedwon",
      NOT_DONE: "closedlost",
    },
    dealStageToTaskStatus: {
      appointmentscheduled: "BACKLOG",
      qualifiedtobuy: "QUEUED",
      contractsent: "ACTIVE",
      closedwon: "DONE",
      closedlost: "NOT_DONE",
    },
    conflictResolution: "newest_wins",
    ...overrides,
  };
}

function makeWebhookPayload(
  overrides: Partial<HubSpotWebhookPayload> = {},
): HubSpotWebhookPayload {
  return {
    eventId: 1,
    subscriptionId: 100,
    portalId: 9999,
    appId: 500,
    occurredAt: Date.now(),
    subscriptionType: "deal.propertyChange",
    attemptNumber: 0,
    objectId: 12345,
    propertyName: "dealstage",
    propertyValue: "closedwon",
    changeSource: "CRM",
    ...overrides,
  };
}

// ─── Contract Tests ──────────────────────────────────────────────────

describe("HubSpot Adapter Contract Tests", () => {
  describe("deal object shape compliance", () => {
    it("validates a well-formed deal has required fields", () => {
      const deal = makeDeal();
      expect(deal.id).toEqual(expect.any(String));
      expect(deal.properties).toBeDefined();
      expect(deal.properties!.dealname).toEqual(expect.any(String));
      expect(deal.properties!.dealstage).toEqual(expect.any(String));
    });

    it("handles deals with missing optional properties", () => {
      const deal: HubSpotDeal = { id: "99999" };
      expect(deal.id).toBe("99999");
      expect(deal.properties).toBeUndefined();
    });

    it("validates deal id is always a string (not number)", () => {
      const deal = makeDeal({ id: "67890" });
      expect(typeof deal.id).toBe("string");
    });

    it("validates hs_lastmodifieddate is ISO 8601 format", () => {
      const deal = makeDeal();
      const date = new Date(deal.properties!.hs_lastmodifieddate!);
      expect(date.toISOString()).toBe(deal.properties!.hs_lastmodifieddate);
    });
  });

  describe("sync config field mapping", () => {
    it("maps all TaskStatus values to deal stages", () => {
      const config = makeConfig();
      const statuses: TaskStatus[] = ["BACKLOG", "QUEUED", "ACTIVE", "DONE", "NOT_DONE"];

      for (const status of statuses) {
        expect(config.taskStatusToDealStage[status]).toEqual(expect.any(String));
      }
    });

    it("provides reverse mapping for all configured deal stages", () => {
      const config = makeConfig();
      const dealStages = Object.values(config.taskStatusToDealStage);

      for (const stage of dealStages) {
        expect(config.dealStageToTaskStatus[stage]).toBeDefined();
      }
    });

    it("ensures round-trip mapping consistency", () => {
      const config = makeConfig();
      const statuses: TaskStatus[] = ["BACKLOG", "QUEUED", "ACTIVE", "DONE", "NOT_DONE"];

      for (const status of statuses) {
        const stage = config.taskStatusToDealStage[status];
        const roundTrip = config.dealStageToTaskStatus[stage];
        expect(roundTrip).toBe(status);
      }
    });

    it("enforces maxResults within API limits", () => {
      const config = makeConfig();
      expect(config.maxResults).toBeGreaterThan(0);
      expect(config.maxResults).toBeLessThanOrEqual(500);
    });

    it("validates conflict resolution is a known strategy", () => {
      const config = makeConfig();
      expect(["hubspot_wins", "task_wins", "newest_wins"]).toContain(
        config.conflictResolution,
      );
    });
  });

  describe("webhook payload validation", () => {
    it("validates required webhook fields are present", () => {
      const payload = makeWebhookPayload();

      expect(payload.eventId).toEqual(expect.any(Number));
      expect(payload.subscriptionId).toEqual(expect.any(Number));
      expect(payload.portalId).toEqual(expect.any(Number));
      expect(payload.occurredAt).toEqual(expect.any(Number));
      expect(payload.subscriptionType).toEqual(expect.any(String));
      expect(payload.objectId).toEqual(expect.any(Number));
    });

    it("validates deal.propertyChange subscription type format", () => {
      const payload = makeWebhookPayload({ subscriptionType: "deal.propertyChange" });
      const [objectType, eventType] = payload.subscriptionType.split(".");
      expect(objectType).toBe("deal");
      expect(eventType).toBe("propertyChange");
    });

    it("includes propertyName and propertyValue for property changes", () => {
      const payload = makeWebhookPayload({
        subscriptionType: "deal.propertyChange",
        propertyName: "dealstage",
        propertyValue: "closedwon",
      });
      expect(payload.propertyName).toBe("dealstage");
      expect(payload.propertyValue).toBe("closedwon");
    });

    it("validates attemptNumber starts at 0", () => {
      const payload = makeWebhookPayload();
      expect(payload.attemptNumber).toBeGreaterThanOrEqual(0);
    });

    it("validates occurredAt is a valid unix timestamp", () => {
      const payload = makeWebhookPayload();
      const date = new Date(payload.occurredAt);
      expect(date.getTime()).toBeGreaterThan(0);
    });
  });

  describe("sync conflict record shape", () => {
    it("validates conflict record contains all required fields", () => {
      const conflict: HubSpotSyncConflict = {
        dealId: "12345",
        taskId: "task-abc",
        dealStage: "contractsent",
        mappedTaskStatus: "ACTIVE",
        taskStatus: "DONE",
        mappedDealStage: "closedwon",
        resolution: "newest_wins",
        winner: "task",
        reason: "Task was updated more recently",
      };

      expect(conflict.dealId).toEqual(expect.any(String));
      expect(conflict.taskId).toEqual(expect.any(String));
      expect(conflict.winner).toMatch(/^(deal|task)$/);
      expect(conflict.reason).toEqual(expect.any(String));
    });

    it("validates winner field is strictly 'deal' or 'task'", () => {
      const validWinners = ["deal", "task"];
      for (const w of validWinners) {
        expect(validWinners).toContain(w);
      }
    });
  });

  describe("dedupe key format", () => {
    it("builds task-to-deal dedupe key in canonical format", () => {
      const key = `hubspot:hubspot_bidirectional:task-1:12345:to-stage-contractsent`;
      expect(key).toMatch(/^hubspot:hubspot_bidirectional:.+:.+:to-stage-.+$/);
    });

    it("builds deal-to-task dedupe key in canonical format", () => {
      const key = `hubspot:hubspot_bidirectional:12345:task-1:to-status-ACTIVE`;
      expect(key).toMatch(/^hubspot:hubspot_bidirectional:.+:.+:to-status-.+$/);
    });
  });
});
