import { describe, expect, it } from "vitest";
import {
  buildHubSpotChecklistDedupeKey,
  defaultHubSpotChecklistConfig,
} from "@/lib/integrations/hubspot-stage-checklist";

describe("hubspot-stage-checklist helpers", () => {
  it("returns default checklist config", () => {
    const config = defaultHubSpotChecklistConfig();

    expect(config.maxResults).toBe(50);
    expect(config.monitoredPipelines).toEqual([]);
    expect(Object.keys(config.stageChecklists)).toContain("appointmentscheduled");
  });

  it("builds canonical dedupe keys", () => {
    const key = buildHubSpotChecklistDedupeKey({
      dealId: "12345",
      stageId: "contractsent",
      checklistIndex: 2,
    });

    expect(key).toBe("hubspot:hubspot_deal_stage:12345:contractsent:checklist-2");
  });
});
