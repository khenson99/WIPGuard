import { IntegrationProvider } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveIntegrationOwnerUserId } from "@/lib/integrations/ownership";
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
import { runSlackStatusSync } from "@/lib/integrations/slack-status-sync";
import { runSlackUnansweredDetector } from "@/lib/integrations/slack-unanswered-requests";
import { runGmailCapture } from "@/lib/integrations/google-gmail-capture";
import { runGoogleDriveCommentEscalation } from "@/lib/integrations/google-drive-comment-escalation";
import { runGoogleCalendarPrepFollowup } from "@/lib/integrations/google-calendar-followup";
import { runHubSpotStageChecklist } from "@/lib/integrations/hubspot-stage-checklist";
import { runHubSpotRiskIntervention } from "@/lib/integrations/hubspot-risk-intervention";
import { runHubSpotCustomerSignalAutomation } from "@/lib/integrations/hubspot-customer-signals";
import { runHubSpotBidirectionalSync } from "@/lib/integrations/hubspot-bidirectional-sync";
import { runCodaRowSync } from "@/lib/integrations/coda-row-sync";
import { runCodaDependencyGateAutomation } from "@/lib/integrations/coda-dependency-gates";
import { runCodaDecisionActionConverter } from "@/lib/integrations/coda-decision-actions";

export type IntegrationRunMode = "incremental" | "backfill";

interface RunRulesInput {
  mode: IntegrationRunMode;
  providers?: IntegrationProvider[];
  userIds?: string[];
  dryRun: boolean;
  pageBudget?: number;
  startedAt: string;
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

function isProviderMetricsRuleKey(value: string): value is ProviderMetricsRuleKey {
  return METRICS_RULE_KEYS.has(value);
}

async function resolveIntegrationOrganizationId(userId: string): Promise<string | null> {
  return (
    await prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    })
  )?.organizationId ?? null;
}

export async function runRules(input: RunRulesInput): Promise<RunRulesResult> {
  const startedAt = input.startedAt;
  const pageBudget = input.pageBudget ?? null;
  const maxRules = input.pageBudget ? Math.max(1, Math.floor(input.pageBudget)) : Number.POSITIVE_INFINITY;

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

        try {
          if (isProviderMetricsRuleKey(rule.key)) {
            await runProviderMetricsRule({ userId, ruleKey: rule.key, dryRun: input.dryRun });
            executedRules += 1;
            continue;
          }

          switch (rule.key) {
            case "slack_status_thread_sync":
              await runSlackStatusSync({ userId, dryRun: input.dryRun });
              executedRules += 1;
              break;
            case "slack_unanswered_request_detector":
              await runSlackUnansweredDetector({ userId, dryRun: input.dryRun });
              executedRules += 1;
              break;
            case "gmail_commitment_capture":
              await runGmailCapture({ userId, dryRun: input.dryRun });
              executedRules += 1;
              break;
            case "google_drive_comment_escalation":
              await runGoogleDriveCommentEscalation({ userId, dryRun: input.dryRun });
              executedRules += 1;
              break;
            case "google_calendar_prep_followup":
              await runGoogleCalendarPrepFollowup({ userId, dryRun: input.dryRun });
              executedRules += 1;
              break;
            case "hubspot_stage_transition_checklist":
              await runHubSpotStageChecklist({ userId, dryRun: input.dryRun });
              executedRules += 1;
              break;
            case "hubspot_stale_risk_intervention":
              await runHubSpotRiskIntervention({ userId, dryRun: input.dryRun });
              executedRules += 1;
              break;
            case "hubspot_customer_signal_followup":
              await runHubSpotCustomerSignalAutomation({ userId, dryRun: input.dryRun });
              executedRules += 1;
              break;
            case "hubspot_bidirectional_sync":
              await runHubSpotBidirectionalSync({ userId, dryRun: input.dryRun });
              executedRules += 1;
              break;
            case "coda_row_task_upsert":
              await runCodaRowSync({ userId, dryRun: input.dryRun });
              executedRules += 1;
              break;
            case "coda_dependency_gate_automation":
              await runCodaDependencyGateAutomation({ userId, dryRun: input.dryRun });
              executedRules += 1;
              break;
            case "coda_decision_action_converter":
              await runCodaDecisionActionConverter({ userId, dryRun: input.dryRun });
              executedRules += 1;
              break;
            default:
              // Skip unsupported/event-driven rules.
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
  };
}
