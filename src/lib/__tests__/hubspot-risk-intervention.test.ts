import { describe, expect, it } from "vitest";
import {
  buildHubSpotRiskDedupeKey,
  defaultHubSpotRiskConfig,
} from "@/lib/integrations/hubspot-risk-intervention";

describe("hubspot-risk-intervention helpers", () => {
  it("returns default risk intervention config", () => {
    const config = defaultHubSpotRiskConfig();

    expect(config.maxResults).toBe(100);
    expect(config.staleDaysThreshold).toBe(7);
    expect(config.closeDateSlipDays).toBe(2);
    expect(config.healthScoreThreshold).toBe(40);
    expect(config.escalateToActiveRiskTypes).toEqual(["close_date_slip", "health_drop"]);
  });

  it("builds canonical dedupe key", () => {
    const key = buildHubSpotRiskDedupeKey({
      dealId: "12345",
      variant: "health_drop",
      severity: "critical",
    });

    expect(key).toBe("hubspot:hubspot_deal_risk:12345:health_drop:severity-critical");
  });
});
