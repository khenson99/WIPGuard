import { describe, expect, it } from "vitest";
import { buildRemediationSteps } from "@/components/settings/integrations/remediation";
import type {
  IntegrationItem,
  RuleLoadState,
} from "@/components/settings/integrations/types";

const emptyRules: RuleLoadState[] = [];

function makeItem(overrides: Partial<IntegrationItem>): IntegrationItem {
  return {
    slug: "google-ads",
    provider: "GOOGLE_ADS",
    name: "Google Ads",
    description: "Google Ads integration",
    capabilities: ["Campaigns"],
    authType: "oauth",
    configured: false,
    missingEnv: ["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET"],
    connected: false,
    status: "DISCONNECTED",
    accountLabel: null,
    connectedAt: null,
    lastSyncedAt: null,
    lastError: null,
    credentialSource: "none",
    syncHealth: "missing",
    syncHealthReason: "No integration credentials found.",
    lastSnapshotAt: null,
    lastSnapshotStatus: null,
    ...overrides,
  };
}

describe("buildRemediationSteps", () => {
  it("includes missing OAuth app config when env is missing and no runtime credential path exists", () => {
    const steps = buildRemediationSteps({
      item: makeItem({ credentialSource: "none", connected: false }),
      rules: emptyRules,
    });

    expect(steps.some((step) => step.id === "missing-config")).toBe(true);
  });

  it("skips missing OAuth app config when runtime credentials are available via env fallback", () => {
    const steps = buildRemediationSteps({
      item: makeItem({
        credentialSource: "env",
        connected: false,
        configured: true,
      }),
      rules: emptyRules,
    });

    expect(steps.some((step) => step.id === "missing-config")).toBe(false);
  });
});
