import type { AutomationOperatorKey } from "@/generated/prisma/client";

export interface AutomationOperatorDefinition {
  key: AutomationOperatorKey;
  slug: string;
  label: string;
  description: string;
}

export const AUTOMATION_OPERATORS: readonly AutomationOperatorDefinition[] = [
  {
    key: "SALES_FOLLOWUP",
    slug: "sales_followup",
    label: "Sales Follow-up",
    description:
      "Post-demo coaching, follow-up drafting, CRM hygiene, and meeting-next-step automation.",
  },
  {
    key: "CUSTOMER_HEALTH",
    slug: "customer_health",
    label: "Customer Health",
    description:
      "Churn-risk detection, intervention playbooks, and account-health monitoring.",
  },
  {
    key: "GTM_SCRUM",
    slug: "gtm_scrum",
    label: "GTM Scrum",
    description:
      "Cross-operator prioritization, digest generation, and execution-backlog orchestration.",
  },
  {
    key: "SEO_GROWTH",
    slug: "seo_growth",
    label: "SEO & Growth",
    description:
      "SEO, content, and traffic optimization recommendations backed by marketing analytics.",
  },
  {
    key: "ADS_OPTIMIZER",
    slug: "ads_optimizer",
    label: "Ads Optimizer",
    description:
      "Paid channel anomaly detection, experiment proposals, and spend-allocation recommendations.",
  },
  {
    key: "ROADMAP_INTELLIGENCE",
    slug: "roadmap_intelligence",
    label: "Roadmap Intelligence",
    description:
      "Roadmap synthesis from support, sales, meetings, and competitive inputs.",
  },
] as const;

const OPERATOR_BY_SLUG = new Map(
  AUTOMATION_OPERATORS.map((operator) => [operator.slug, operator] as const)
);

const OPERATOR_BY_KEY = new Map(
  AUTOMATION_OPERATORS.map((operator) => [operator.key, operator] as const)
);

export function resolveAutomationOperatorBySlug(
  slug: string | null | undefined
): AutomationOperatorDefinition | null {
  if (!slug) return null;
  return OPERATOR_BY_SLUG.get(slug.trim().toLowerCase()) ?? null;
}

export function resolveAutomationOperatorByKey(
  key: AutomationOperatorKey | null | undefined
): AutomationOperatorDefinition | null {
  if (!key) return null;
  return OPERATOR_BY_KEY.get(key) ?? null;
}

export function normalizeAutomationOperatorKey(
  value: unknown
): AutomationOperatorKey | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toUpperCase();
  const direct = OPERATOR_BY_KEY.get(normalized as AutomationOperatorKey);
  if (direct) {
    return direct.key;
  }

  const bySlug = resolveAutomationOperatorBySlug(value);
  return bySlug?.key ?? null;
}

export function automationOperatorLabel(
  key: AutomationOperatorKey | null | undefined
): string {
  return resolveAutomationOperatorByKey(key)?.label ?? "General Automation";
}
