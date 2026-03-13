import type {
  LirDefinition,
  RetentionLifecyclePhase,
  RetentionReasonCode,
  RetentionStatus,
} from "@/lib/retention/types";

export interface RetentionStatusInputs {
  lifecyclePhase: RetentionLifecyclePhase;
  primaryLirDefinition: LirDefinition;
  primaryLirValue: number | null;
  supportRisk: boolean;
  billingRisk: boolean;
  onboardingRisk: boolean;
  usageCollapse: boolean;
  reasonCodes: RetentionReasonCode[];
}

export function evaluateLir(definition: LirDefinition, value: number | null): boolean {
  if (value === null || Number.isNaN(value)) return false;
  if (definition.comparator === "gte") return value >= definition.threshold;
  return value <= definition.threshold;
}

export function classifyRetentionStatus(input: RetentionStatusInputs): RetentionStatus {
  if (input.billingRisk) return "Billing Risk";
  if (input.lifecyclePhase === "ONBOARDING" && input.onboardingRisk) return "Onboarding Risk";

  const lirPassed = evaluateLir(input.primaryLirDefinition, input.primaryLirValue);
  const criticalReasons = input.reasonCodes.filter((reason) => reason.severity === "critical").length;

  if (!lirPassed && (input.usageCollapse || input.supportRisk || criticalReasons > 0)) {
    return "At Risk";
  }

  if (!lirPassed || input.supportRisk || input.reasonCodes.some((reason) => reason.severity !== "info")) {
    return "Watch";
  }

  return "Healthy";
}

export function buildReasonCode(input: {
  code: string;
  label: string;
  detail: string;
  severity: RetentionReasonCode["severity"];
  dimension: RetentionReasonCode["dimension"];
}): RetentionReasonCode {
  return input;
}

export function retentionStatusToDb(status: RetentionStatus): string {
  switch (status) {
    case "Healthy":
      return "HEALTHY";
    case "Watch":
      return "WATCH";
    case "At Risk":
      return "AT_RISK";
    case "Onboarding Risk":
      return "ONBOARDING_RISK";
    case "Billing Risk":
      return "BILLING_RISK";
  }
}

export function retentionStatusFromDb(status: string | null | undefined): RetentionStatus | null {
  switch (status) {
    case "HEALTHY":
      return "Healthy";
    case "WATCH":
      return "Watch";
    case "AT_RISK":
      return "At Risk";
    case "ONBOARDING_RISK":
      return "Onboarding Risk";
    case "BILLING_RISK":
      return "Billing Risk";
    default:
      return null;
  }
}
