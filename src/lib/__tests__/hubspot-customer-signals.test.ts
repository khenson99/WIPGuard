import { describe, expect, it } from "vitest";
import {
  buildHubSpotCustomerSignalDedupeKey,
  defaultHubSpotCustomerSignalConfig,
} from "@/lib/integrations/hubspot-customer-signals";

describe("hubspot-customer-signals helpers", () => {
  it("returns default customer signal config", () => {
    const config = defaultHubSpotCustomerSignalConfig();

    expect(config.maxResults).toBe(100);
    expect(config.maxContactsPerDeal).toBe(10);
    expect(config.monitoredPipelines).toEqual([]);
    expect(Object.keys(config.stageSignals)).toContain("appointmentscheduled");
    expect(Object.keys(config.contactLifecycleSignals)).toContain("salesqualifiedlead");
  });

  it("builds canonical dedupe key", () => {
    const key = buildHubSpotCustomerSignalDedupeKey({
      externalObjectId: "deal123:contact:contact456:lifecycle:opportunity",
      ruleVariant: "contact-lifecycle-opportunity",
    });

    expect(key).toBe(
      "hubspot:hubspot_customer_signal:deal123:contact:contact456:lifecycle:opportunity:contact-lifecycle-opportunity"
    );
  });
});
