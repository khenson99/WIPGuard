import { describe, expect, it } from "vitest";
import { classifyRetentionStatus, evaluateLir, retentionStatusFromDb, retentionStatusToDb } from "@/lib/retention/status";
import type { LirDefinition, RetentionReasonCode } from "@/lib/retention/types";

const MATURE_LIR: LirDefinition = {
  id: "mature-active-weeks",
  label: "Active weeks trailing 8",
  lifecyclePhase: "MATURE",
  metricKey: "activeWeeksTrailing8",
  comparator: "gte",
  threshold: 5,
  windowLabel: "Trailing 8 weeks",
  description: "Tenant is active in at least five of the last eight weeks.",
  rationale: "Habitual weekly operations are usually the clearest signal of embedded workflow value.",
};

const CRITICAL_USAGE_REASON: RetentionReasonCode = {
  code: "usage_collapse",
  label: "Current-month usage collapse",
  detail: "Recent activity is materially below the historical baseline.",
  severity: "critical",
  dimension: "usage",
};

describe("retention status", () => {
  it("evaluates threshold-based LIRs", () => {
    expect(evaluateLir(MATURE_LIR, 5)).toBe(true);
    expect(evaluateLir(MATURE_LIR, 4)).toBe(false);
    expect(evaluateLir(MATURE_LIR, null)).toBe(false);
  });

  it("prioritizes billing and onboarding risk over general watch states", () => {
    expect(
      classifyRetentionStatus({
        lifecyclePhase: "MATURE",
        primaryLirDefinition: MATURE_LIR,
        primaryLirValue: 10,
        supportRisk: false,
        billingRisk: true,
        onboardingRisk: false,
        usageCollapse: false,
        reasonCodes: [],
      })
    ).toBe("Billing Risk");

    expect(
      classifyRetentionStatus({
        lifecyclePhase: "ONBOARDING",
        primaryLirDefinition: { ...MATURE_LIR, lifecyclePhase: "ONBOARDING" },
        primaryLirValue: 10,
        supportRisk: false,
        billingRisk: false,
        onboardingRisk: true,
        usageCollapse: false,
        reasonCodes: [],
      })
    ).toBe("Onboarding Risk");
  });

  it("marks tenants at risk when the primary LIR fails with a hard distress signal", () => {
    expect(
      classifyRetentionStatus({
        lifecyclePhase: "MATURE",
        primaryLirDefinition: MATURE_LIR,
        primaryLirValue: 2,
        supportRisk: false,
        billingRisk: false,
        onboardingRisk: false,
        usageCollapse: true,
        reasonCodes: [CRITICAL_USAGE_REASON],
      })
    ).toBe("At Risk");
  });

  it("keeps soft misses in watch and healthy accounts in healthy", () => {
    expect(
      classifyRetentionStatus({
        lifecyclePhase: "MATURE",
        primaryLirDefinition: MATURE_LIR,
        primaryLirValue: 4,
        supportRisk: false,
        billingRisk: false,
        onboardingRisk: false,
        usageCollapse: false,
        reasonCodes: [],
      })
    ).toBe("Watch");

    expect(
      classifyRetentionStatus({
        lifecyclePhase: "MATURE",
        primaryLirDefinition: MATURE_LIR,
        primaryLirValue: 7,
        supportRisk: false,
        billingRisk: false,
        onboardingRisk: false,
        usageCollapse: false,
        reasonCodes: [],
      })
    ).toBe("Healthy");
  });

  it("round-trips database status mappings", () => {
    expect(retentionStatusToDb("Healthy")).toBe("HEALTHY");
    expect(retentionStatusFromDb("AT_RISK")).toBe("At Risk");
    expect(retentionStatusFromDb("UNKNOWN")).toBeNull();
  });
});
