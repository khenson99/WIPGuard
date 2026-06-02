import { IntegrationConnectionStatus, IntegrationProvider } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  resolveIntegrationOrganizationId,
  resolveIntegrationOwnerUserId,
} from "@/lib/integrations/ownership";
import { runWithContextAsync } from "@/lib/request-context";
import {
  CODA_DOC_SYNC_RULE_KEY,
  GITHUB_PULL_REQUESTS_SYNC_RULE_KEY,
  GOOGLE_SEARCH_CONSOLE_SYNC_RULE_KEY,
  GOOGLE_WORKSPACE_ACTIVITY_SYNC_RULE_KEY,
  GOOGLE_ANALYTICS_TRAFFIC_SYNC_RULE_KEY,
  GOOGLE_ADS_METRICS_RULE_KEY,
  HUBSPOT_PIPELINE_SYNC_RULE_KEY,
  LINEAR_ISSUES_SYNC_RULE_KEY,
  META_ADS_METRICS_RULE_KEY,
  META_INSTAGRAM_METRICS_RULE_KEY,
  META_PAGE_METRICS_RULE_KEY,
  MERCURY_CASHFLOW_SYNC_RULE_KEY,
  POSTHOG_PRODUCT_EVENTS_SYNC_RULE_KEY,
  PYLON_CONVERSATION_SYNC_RULE_KEY,
  REDDIT_ADS_METRICS_RULE_KEY,
  SEMRUSH_DOMAIN_SYNC_RULE_KEY,
  SLACK_ACTIVITY_SYNC_RULE_KEY,
  STRIPE_REVENUE_SYNC_RULE_KEY,
  WEBFLOW_SITE_SYNC_RULE_KEY,
  ensureProviderMetricsRulesForConnectedProviders,
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
  bootstrappedProviderRules: number;
  failedUserRuns: number;
  failedRules: number;
  failedRuleErrors: FailedRuleRun[];
}

interface FailedRuleRun {
  ruleId: string;
  ruleKey: string;
  provider: IntegrationProvider;
  userId: string;
  error: string;
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
  CODA_DOC_SYNC_RULE_KEY,
  POSTHOG_PRODUCT_EVENTS_SYNC_RULE_KEY,
  LINEAR_ISSUES_SYNC_RULE_KEY,
  GITHUB_PULL_REQUESTS_SYNC_RULE_KEY,
  SEMRUSH_DOMAIN_SYNC_RULE_KEY,
  GOOGLE_ANALYTICS_TRAFFIC_SYNC_RULE_KEY,
  GOOGLE_SEARCH_CONSOLE_SYNC_RULE_KEY,
  WEBFLOW_SITE_SYNC_RULE_KEY,
  GOOGLE_WORKSPACE_ACTIVITY_SYNC_RULE_KEY,
  HUBSPOT_PIPELINE_SYNC_RULE_KEY,
  SLACK_ACTIVITY_SYNC_RULE_KEY,
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
          await prisma.integrationConnection.findMany({
            distinct: ["userId"],
            where: {
              status: {
                in: [
                  IntegrationConnectionStatus.CONNECTED,
                  IntegrationConnectionStatus.ERROR,
                ],
              },
            },
            select: { userId: true },
          })
        ).map((row) => row.userId);

  const providerFilter =
    input.providers && input.providers.length > 0 ? input.providers : null;

  const providers =
    providerFilter
      ? providerFilter
      : (
          await prisma.integrationRule.findMany({
            distinct: ["provider"],
            where: { enabled: true },
            select: { provider: true },
          })
        ).map((row) => row.provider);

  let executedRules = 0;
  let skippedLegacyTaskRules = 0;
  let bootstrappedProviderRules = 0;
  let failedUserRuns = 0;
  let failedRules = 0;
  const failedRuleErrors: FailedRuleRun[] = [];

  function recordFailedRule(input: FailedRuleRun): void {
    failedRules += 1;
    failedRuleErrors.push(input);
  }

  for (const rawUserId of userIds) {
    if (executedRules >= maxRules) break;

    // In org-level ownership mode, rules should operate with shared integration credentials.
    const userId = resolveIntegrationOwnerUserId(rawUserId);

    try {
      const organizationId = await resolveIntegrationOrganizationId(userId);

      if (!organizationId) {
        console.error("integration.orchestrator.user_skipped", {
          userId,
          error: "Missing organizationId for integration run context",
        });
        continue;
      }

      await runWithContextAsync({ organizationId, userId }, async () => {
        const bootstrap = await ensureProviderMetricsRulesForConnectedProviders({
          userId,
          ...(providerFilter ? { providers: providerFilter } : {}),
        });
        bootstrappedProviderRules += bootstrap.created;

        const rules = await prisma.integrationRule.findMany({
          where: {
            userId,
            enabled: true,
            ...(providerFilter ? { provider: { in: providerFilter } } : {}),
          },
          orderBy: [{ updatedAt: "desc" }],
        });

        for (const rule of rules) {
          if (executedRules >= maxRules) break;

          if (isLegacyTaskAutomationRuleKey(rule.key)) {
            skippedLegacyTaskRules += 1;
            continue;
          }

          try {
            if (isProviderMetricsRuleKey(rule.key)) {
              const result = await runProviderMetricsRule({
                userId,
                ruleKey: rule.key,
                dryRun: input.dryRun,
                mode: input.mode,
              });
              if (result.rawRecordCount > result.acceptedRawRecordCount) {
                recordFailedRule({
                  ruleId: rule.id,
                  ruleKey: rule.key,
                  provider: rule.provider,
                  userId,
                  error: `Imladris raw ingestion accepted ${result.acceptedRawRecordCount}/${result.rawRecordCount} records`,
                });
              }
              const statusPersistenceErrors = Array.isArray(result.statusPersistenceErrors)
                ? result.statusPersistenceErrors
                : [];
              for (const statusPersistenceError of statusPersistenceErrors) {
                recordFailedRule({
                  ruleId: rule.id,
                  ruleKey: rule.key,
                  provider: rule.provider,
                  userId,
                  error: statusPersistenceError,
                });
              }
              executedRules += 1;
              continue;
            }

            // Skip unsupported/event-driven rules.
          } catch (error) {
            // Keep the orchestrator moving; individual rule runners record their own lastError.
            const message = error instanceof Error ? error.message : String(error);
            recordFailedRule({
              ruleId: rule.id,
              ruleKey: rule.key,
              provider: rule.provider,
              userId,
              error: message,
            });
            console.error("integration.orchestrator.rule_failed", {
              ruleId: rule.id,
              ruleKey: rule.key,
              provider: rule.provider,
              userId,
              error: message,
            });
            executedRules += 1;
            continue;
          }
        }
      });
    } catch (error) {
      failedUserRuns += 1;
      console.error("integration.orchestrator.user_failed", {
        userId,
        rawUserId,
        providers,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
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
    bootstrappedProviderRules,
    failedUserRuns,
    failedRules,
    failedRuleErrors,
  };
}
