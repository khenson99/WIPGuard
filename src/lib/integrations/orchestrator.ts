import { IntegrationProvider } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  resolveIntegrationOrganizationId,
  resolveIntegrationOwnerUserId,
} from "@/lib/integrations/ownership";
import { runWithContextAsync } from "@/lib/request-context";
import {
  GOOGLE_ADS_METRICS_RULE_KEY,
  META_ADS_METRICS_RULE_KEY,
  META_INSTAGRAM_METRICS_RULE_KEY,
  META_PAGE_METRICS_RULE_KEY,
  MERCURY_CASHFLOW_SYNC_RULE_KEY,
  PYLON_CONVERSATION_SYNC_RULE_KEY,
  REDDIT_ADS_METRICS_RULE_KEY,
  STRIPE_REVENUE_SYNC_RULE_KEY,
  runProviderMetricsRule,
  type ProviderMetricsRuleKey,
} from "@/lib/integrations/provider-metrics-sync";

export type IntegrationRunMode = "incremental" | "backfill";

interface RunRulesInput {
  mode: IntegrationRunMode;
  providers?: IntegrationProvider[];
  userIds?: string[];
  dryRun: boolean;
  pageBudget?: number;
  startedAt: string;
  includeLegacyTaskAutomations?: boolean;
}

interface RunRulesResult {
  mode: IntegrationRunMode;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  providers: IntegrationProvider[];
  userIds: string[] | null;
  pageBudget: number | null;
  executedRules: number;
  skippedLegacyTaskRules: number;
}

const METRICS_RULE_KEYS: ReadonlySet<string> = new Set([
  GOOGLE_ADS_METRICS_RULE_KEY,
  META_ADS_METRICS_RULE_KEY,
  META_PAGE_METRICS_RULE_KEY,
  META_INSTAGRAM_METRICS_RULE_KEY,
  REDDIT_ADS_METRICS_RULE_KEY,
  STRIPE_REVENUE_SYNC_RULE_KEY,
  MERCURY_CASHFLOW_SYNC_RULE_KEY,
  PYLON_CONVERSATION_SYNC_RULE_KEY,
]);

const LEGACY_TASK_AUTOMATION_RULE_KEYS: ReadonlySet<string> = new Set([
  "slack_status_thread_sync",
  "slack_unanswered_request_detector",
  "gmail_commitment_capture",
  "google_drive_comment_escalation",
  "google_drive_transcript_capture",
  "google_calendar_prep_followup",
  "hubspot_stage_transition_checklist",
  "hubspot_stale_risk_intervention",
  "hubspot_customer_signal_followup",
  "hubspot_bidirectional_sync",
  "coda_row_task_upsert",
  "coda_dependency_gate_automation",
  "coda_decision_action_converter",
]);

function isProviderMetricsRuleKey(value: string): value is ProviderMetricsRuleKey {
  return METRICS_RULE_KEYS.has(value);
}

function isLegacyTaskAutomationRuleKey(value: string): boolean {
  return LEGACY_TASK_AUTOMATION_RULE_KEYS.has(value);
}

function legacyTaskAutomationsEnabled(override: boolean | undefined): boolean {
  if (typeof override === "boolean") {
    return override;
  }

  const flag = process.env.ENABLE_LEGACY_TASK_AUTOMATIONS?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes" || flag === "on") {
    return true;
  }
  if (flag === "0" || flag === "false" || flag === "no" || flag === "off") {
    return false;
  }

  return process.env.NODE_ENV !== "production";
}

export async function runRules(input: RunRulesInput): Promise<RunRulesResult> {
  const startedAt = input.startedAt;
  const pageBudget = input.pageBudget ?? null;
  const maxRules = input.pageBudget ? Math.max(1, Math.floor(input.pageBudget)) : Number.POSITIVE_INFINITY;
  const runLegacyTaskAutomations = legacyTaskAutomationsEnabled(
    input.includeLegacyTaskAutomations
  );

  const inferredUserIds =
    input.userIds && input.userIds.length > 0
      ? input.userIds
      : (() => {
          const owner = process.env.INTEGRATION_OWNER_USER_ID?.trim();
          return owner ? [owner] : [];
        })();

  const userIds =
    inferredUserIds.length > 0
      ? inferredUserIds
      : (
          await prisma.integrationRule.findMany({
            distinct: ["userId"],
            where: { enabled: true },
            select: { userId: true },
          })
        ).map((row) => row.userId);

  const providers =
    input.providers && input.providers.length > 0
      ? input.providers
      : (
          await prisma.integrationRule.findMany({
            distinct: ["provider"],
            where: { enabled: true },
            select: { provider: true },
          })
        ).map((row) => row.provider);

  let executedRules = 0;
  let skippedLegacyTaskRules = 0;

  for (const rawUserId of userIds) {
    if (executedRules >= maxRules) break;

    // In org-level ownership mode, rules should operate with shared integration credentials.
    const userId = resolveIntegrationOwnerUserId(rawUserId);
    const organizationId = await resolveIntegrationOrganizationId(userId);

    if (!organizationId) {
      console.error("integration.orchestrator.user_skipped", {
        userId,
        error: "Missing organizationId for integration run context",
      });
      continue;
    }

    await runWithContextAsync({ organizationId, userId }, async () => {
      const rules = await prisma.integrationRule.findMany({
        where: {
          userId,
          enabled: true,
          ...(providers.length > 0 ? { provider: { in: providers } } : {}),
        },
        orderBy: [{ updatedAt: "desc" }],
      });

      for (const rule of rules) {
        if (executedRules >= maxRules) break;

        if (!runLegacyTaskAutomations && isLegacyTaskAutomationRuleKey(rule.key)) {
          skippedLegacyTaskRules += 1;
          continue;
        }

        try {
          if (isProviderMetricsRuleKey(rule.key)) {
            await runProviderMetricsRule({ userId, ruleKey: rule.key, dryRun: input.dryRun });
            executedRules += 1;
            continue;
          }

          switch (rule.key) {
            default:
              // Skip unsupported or retired event-driven rules.
              break;
          }
        } catch (error) {
          // Keep the orchestrator moving; individual rule runners record their own lastError.
          console.error("integration.orchestrator.rule_failed", {
            ruleId: rule.id,
            ruleKey: rule.key,
            provider: rule.provider,
            userId,
            error: error instanceof Error ? error.message : String(error),
          });
          executedRules += 1;
          continue;
        }
      }
    });
  }

  return {
    mode: input.mode,
    dryRun: input.dryRun,
    startedAt,
    finishedAt: new Date().toISOString(),
    providers,
    userIds,
    pageBudget,
    executedRules,
    skippedLegacyTaskRules,
  };
}
