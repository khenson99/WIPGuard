import { describe, expect, it } from "vitest";
import type { TaskStatus } from "@/generated/prisma/client";
import {
  __private__,
  defaultHubSpotBidirectionalConfig,
} from "@/lib/integrations/hubspot-bidirectional-sync";

describe("hubspot-bidirectional-sync helpers", () => {
  it("returns default config with both mapping directions", () => {
    const config = defaultHubSpotBidirectionalConfig();

    expect(config.maxResults).toBe(150);
    expect(config.conflictResolution).toBe("newest_wins");
    expect(config.taskStatusToDealStage.DONE).toBe("closedwon");
    expect(config.dealStageToTaskStatus.closedwon).toBe("DONE");
  });

  it("normalizes config overrides safely", () => {
    const config = __private__.normalizeConfig({
      maxResults: 999,
      conflictResolution: "hubspot_wins",
      taskStatusToDealStage: {
        ACTIVE: "contractsent",
      },
      dealStageToTaskStatus: {
        contractsent: "NOT_DONE",
        invalid: "UNKNOWN",
      },
    });

    expect(config.maxResults).toBe(500);
    expect(config.conflictResolution).toBe("hubspot_wins");
    expect(config.taskStatusToDealStage.ACTIVE).toBe("contractsent");
    expect(config.dealStageToTaskStatus.contractsent).toBe("NOT_DONE");
    expect(config.dealStageToTaskStatus.invalid).toBeUndefined();
  });

  it("chooses conflict winner from strategy and freshness", () => {
    const dealNewer = __private__.chooseConflictWinner({
      resolution: "newest_wins",
      dealUpdatedAt: new Date("2026-02-16T00:00:00.000Z"),
      taskUpdatedAt: new Date("2026-02-15T00:00:00.000Z"),
    });
    const taskWins = __private__.chooseConflictWinner({
      resolution: "task_wins",
      dealUpdatedAt: new Date("2026-02-16T00:00:00.000Z"),
      taskUpdatedAt: new Date("2026-02-15T00:00:00.000Z"),
    });

    expect(dealNewer.winner).toBe("deal");
    expect(taskWins.winner).toBe("task");
  });

  it("parses deal ids and builds canonical dedupe keys", () => {
    const dealId = __private__.parseDealIdFromExternalObjectId("12345:stage:contractsent");
    const taskToDeal = __private__.buildTaskToDealDedupeKey({
      taskId: "task-1",
      dealId: "12345",
      targetStage: "contractsent",
    });
    const dealToTask = __private__.buildDealToTaskDedupeKey({
      taskId: "task-1",
      dealId: "12345",
      targetStatus: "ACTIVE" as TaskStatus,
    });

    expect(dealId).toBe("12345");
    expect(taskToDeal).toBe("hubspot:hubspot_bidirectional:task-1:12345:to-stage-contractsent");
    expect(dealToTask).toBe("hubspot:hubspot_bidirectional:12345:task-1:to-status-ACTIVE");
  });
});
