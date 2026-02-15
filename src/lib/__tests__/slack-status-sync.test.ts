import { describe, expect, it } from "vitest";
import {
  buildSlackStatusSyncDedupeKey,
  defaultSlackStatusSyncConfig,
} from "@/lib/integrations/slack-status-sync";

describe("slack-status-sync helpers", () => {
  it("returns default status sync config", () => {
    const config = defaultSlackStatusSyncConfig();

    expect(config.maxTransitionsPerRun).toBe(200);
    expect(config.statusesToSync).toEqual(["ACTIVE", "NOT_DONE", "DONE"]);
    expect(config.statusMessages.ACTIVE).toContain("ACTIVE");
    expect(config.statusMessages.DONE).toContain("DONE");
  });

  it("builds canonical dedupe key", () => {
    const key = buildSlackStatusSyncDedupeKey({
      externalObjectId: "task123:status456",
      ruleVariant: "status-done",
    });

    expect(key).toBe("slack:slack_status_sync:task123:status456:status-done");
  });
});
