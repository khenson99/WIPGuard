import {
  IntegrationProvider,
  Prisma,
  ProjectStatus,
  ProjectType,
  type IntegrationRule,
  type TaskStatus,
} from "@/generated/prisma/client";
import { getCredentials } from "@/lib/analytics/credentials";
import { parseAnalyticsTimeRange } from "@/lib/analytics/time-range";
import {
  fetchPylonIssues,
  getPylonIssueId,
  getPylonIssuePriority,
  getPylonIssueStatus,
  getPylonIssueTags,
  getPylonIssueTitle,
  getPylonIssueUpdatedAt,
  getPylonIssueUrl,
  type PylonIssue,
} from "@/lib/integrations/pylon-client";
import { prisma } from "@/lib/prisma";
import { getNextColumnOrder } from "@/lib/task-order";

export const PYLON_ISSUE_TASK_SYNC_RULE_KEY = "pylon_issue_task_sync";

type SupportedAutoTaskStatus = "QUEUED" | "ACTIVE" | "NOT_DONE";

export interface PylonIssueTaskSyncConfig {
  rangePreset: "7d" | "30d" | "90d";
  contextKey: string;
  onlyUrgent: boolean;
  includeTags: string[];
  excludeTags: string[];
  defaultTaskStatus: SupportedAutoTaskStatus;
  pylonStatusToTaskStatus?: Record<string, TaskStatus>;
}

export interface PylonIssueTaskSyncCheckpoint {
  projectId: string | null;
  lastRunAt: string | null;
}

export interface PylonIssueTaskSyncRuleState {
  id: string;
  key: string;
  enabled: boolean;
  statusOverride: SupportedAutoTaskStatus | null;
  config: PylonIssueTaskSyncConfig;
  checkpoint: PylonIssueTaskSyncCheckpoint;
  lastObservedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface PylonIssueTaskSyncRulePatch {
  enabled?: boolean;
  statusOverride?: SupportedAutoTaskStatus | null;
  config?: Partial<PylonIssueTaskSyncConfig>;
}

export interface PylonIssueTaskSyncRunResult {
  ruleId: string;
  enabled: boolean;
  dryRun: boolean;
  scannedIssues: number;
  createdTasks: number;
  updatedTasks: number;
  deduped: number;
  skipped: number;
  errors: Array<{ issueId?: string; message: string }>;
  checkpoint: PylonIssueTaskSyncCheckpoint;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeRangePreset(raw: unknown): "7d" | "30d" | "90d" {
  return raw === "7d" || raw === "90d" ? raw : "30d";
}

function normalizeStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
}

function normalizeSupportedAutoTaskStatus(value: unknown): SupportedAutoTaskStatus {
  return value === "ACTIVE" || value === "NOT_DONE" ? value : "QUEUED";
}

function normalizeConfig(raw: unknown): PylonIssueTaskSyncConfig {
  const input = asRecord(raw);
  const contextKeyRaw = typeof input.contextKey === "string" ? input.contextKey.trim() : "";
  const contextKey = contextKeyRaw.length > 0 ? contextKeyRaw : "default";

  const mappingRaw = asRecord(input.pylonStatusToTaskStatus);
  const mapping: Record<string, TaskStatus> = {};
  for (const [key, value] of Object.entries(mappingRaw)) {
    if (
      value === "QUEUED" ||
      value === "ACTIVE" ||
      value === "NOT_DONE" ||
      value === "DONE" ||
      value === "BACKLOG" ||
      value === "WORKING_ON_TODAY"
    ) {
      mapping[key.toLowerCase().trim()] = value;
    }
  }

  return {
    rangePreset: normalizeRangePreset(input.rangePreset),
    contextKey,
    onlyUrgent: input.onlyUrgent === true,
    includeTags: normalizeStringList(input.includeTags),
    excludeTags: normalizeStringList(input.excludeTags),
    defaultTaskStatus: normalizeSupportedAutoTaskStatus(input.defaultTaskStatus),
    pylonStatusToTaskStatus: Object.keys(mapping).length > 0 ? mapping : undefined,
  };
}

function normalizeCheckpoint(raw: unknown): PylonIssueTaskSyncCheckpoint {
  const input = asRecord(raw);
  return {
    projectId: typeof input.projectId === "string" ? input.projectId : null,
    lastRunAt: typeof input.lastRunAt === "string" ? input.lastRunAt : null,
  };
}

function toSupportedStatus(value: TaskStatus | null | undefined): SupportedAutoTaskStatus {
  return value === "ACTIVE" || value === "NOT_DONE" ? value : "QUEUED";
}

function toOptionalSupportedStatus(
  value: TaskStatus | null | undefined
): SupportedAutoTaskStatus | null {
  if (!value) return null;
  return toSupportedStatus(value);
}

export function buildPylonIssueTaskDedupeKey(issueId: string): string {
  return `pylon:${PYLON_ISSUE_TASK_SYNC_RULE_KEY}:${issueId}`;
}

function issueTagSet(issue: PylonIssue): Set<string> {
  return new Set(getPylonIssueTags(issue).map((tag) => tag.toLowerCase()));
}

function issueIsUrgent(issue: PylonIssue): boolean {
  const priority = (getPylonIssuePriority(issue) ?? "").toLowerCase();
  const tags = issueTagSet(issue);
  return priority === "urgent" || priority === "high" || tags.has("urgent");
}

function issueIsResolved(issue: PylonIssue): boolean {
  const status = (getPylonIssueStatus(issue) ?? "").toLowerCase();
  return status.includes("resolved") || status.includes("closed");
}

export function shouldIncludePylonIssue(
  issue: PylonIssue,
  config: Pick<PylonIssueTaskSyncConfig, "onlyUrgent" | "includeTags" | "excludeTags">
): boolean {
  if (config.onlyUrgent && !issueIsUrgent(issue)) {
    return false;
  }

  const tags = issueTagSet(issue);

  if (config.includeTags.length > 0) {
    const include = config.includeTags.some((tag) => tags.has(tag.toLowerCase()));
    if (!include) return false;
  }

  if (config.excludeTags.length > 0) {
    const excluded = config.excludeTags.some((tag) => tags.has(tag.toLowerCase()));
    if (excluded) return false;
  }

  return true;
}

export function resolvePylonIssueTaskStatus(input: {
  issue: PylonIssue;
  config: PylonIssueTaskSyncConfig;
  statusOverride: SupportedAutoTaskStatus | null;
}): TaskStatus {
  const pylonStatus = (getPylonIssueStatus(input.issue) ?? "").toLowerCase().trim();
  const mapping = input.config.pylonStatusToTaskStatus ?? {};

  const mapped = mapping[pylonStatus];
  if (mapped) {
    return mapped;
  }

  if (issueIsResolved(input.issue)) {
    return "DONE";
  }

  if (input.statusOverride) {
    return input.statusOverride;
  }

  if (issueIsUrgent(input.issue)) {
    return "ACTIVE";
  }

  return input.config.defaultTaskStatus;
}

const NOTES_START = "<!-- wg:pylon:start -->";
const NOTES_END = "<!-- wg:pylon:end -->";

export function upsertPylonNotesBlock(existingNotes: string | null, block: string): string {
  const nextBlock = `${NOTES_START}\n${block.trim()}\n${NOTES_END}`;

  const base = (existingNotes ?? "").trim();
  if (!base) return nextBlock;

  const startIdx = base.indexOf(NOTES_START);
  const endIdx = base.indexOf(NOTES_END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = base.slice(0, startIdx).trimEnd();
    const after = base.slice(endIdx + NOTES_END.length).trimStart();
    return [before, nextBlock, after].filter((part) => part.length > 0).join("\n\n");
  }

  return [base, nextBlock].join("\n\n");
}

function buildPylonNotesBlock(issue: PylonIssue): string {
  const issueId = getPylonIssueId(issue) ?? "unknown";
  const url = getPylonIssueUrl(issue);
  const status = getPylonIssueStatus(issue) ?? "unknown";
  const priority = getPylonIssuePriority(issue);
  const updatedAt = getPylonIssueUpdatedAt(issue);
  const tags = getPylonIssueTags(issue);

  const lines = [
    "Pylon",
    `Issue ID: ${issueId}`,
    url ? `URL: ${url}` : null,
    `Status: ${status}`,
    priority ? `Priority: ${priority}` : null,
    tags.length > 0 ? `Tags: ${tags.join(", ")}` : null,
    updatedAt ? `Updated At: ${updatedAt}` : null,
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
}

function buildTaskTitleFromIssue(issue: PylonIssue): string {
  const title = getPylonIssueTitle(issue);
  if (title) return title;
  const issueId = getPylonIssueId(issue);
  return issueId ? `Pylon Issue ${issueId}` : "Pylon Issue";
}

async function resolveCustomerSupportProjectId(input: {
  userId: string;
  checkpoint: PylonIssueTaskSyncCheckpoint;
}): Promise<{ projectId: string; updatedCheckpoint: PylonIssueTaskSyncCheckpoint }> {
  if (input.checkpoint.projectId) {
    const existing = await prisma.project.findUnique({
      where: { id: input.checkpoint.projectId },
      select: { id: true },
    });
    if (existing) {
      return { projectId: existing.id, updatedCheckpoint: input.checkpoint };
    }
  }

  const byName = await prisma.project.findFirst({
    where: {
      status: ProjectStatus.ACTIVE,
      name: { equals: "Customer Support", mode: "insensitive" },
    },
    select: { id: true },
  });

  if (byName) {
    return {
      projectId: byName.id,
      updatedCheckpoint: { ...input.checkpoint, projectId: byName.id },
    };
  }

  const created = await prisma.project.create({
    data: {
      name: "Customer Support",
      projectType: ProjectType.PERPETUAL,
      status: ProjectStatus.ACTIVE,
      description: "Autocreated for Pylon issue sync",
      responsible: { connect: [{ id: input.userId }] },
    },
    select: { id: true },
  });

  return {
    projectId: created.id,
    updatedCheckpoint: { ...input.checkpoint, projectId: created.id },
  };
}

export function defaultPylonIssueTaskSyncConfig(): PylonIssueTaskSyncConfig {
  return {
    rangePreset: "30d",
    contextKey: "default",
    onlyUrgent: false,
    includeTags: [],
    excludeTags: [],
    defaultTaskStatus: "QUEUED",
    pylonStatusToTaskStatus: undefined,
  };
}

export async function getOrCreatePylonIssueTaskSyncRule(userId: string): Promise<IntegrationRule> {
  return prisma.integrationRule.upsert({
    where: {
      userId_provider_key: {
        userId,
        provider: IntegrationProvider.PYLON,
        key: PYLON_ISSUE_TASK_SYNC_RULE_KEY,
      },
    },
    update: {},
    create: {
      userId,
      provider: IntegrationProvider.PYLON,
      key: PYLON_ISSUE_TASK_SYNC_RULE_KEY,
      enabled: true,
      statusOverride: null,
      config: defaultPylonIssueTaskSyncConfig() as unknown as Prisma.InputJsonValue,
      checkpoint: { projectId: null, lastRunAt: null } as unknown as Prisma.InputJsonValue,
    },
  });
}

export function serializePylonIssueTaskSyncRule(rule: IntegrationRule): PylonIssueTaskSyncRuleState {
  return {
    id: rule.id,
    key: rule.key,
    enabled: rule.enabled,
    statusOverride: toOptionalSupportedStatus(rule.statusOverride),
    config: normalizeConfig(rule.config),
    checkpoint: normalizeCheckpoint(rule.checkpoint),
    lastObservedAt: rule.lastObservedAt?.toISOString() ?? null,
    lastRunAt: rule.lastRunAt?.toISOString() ?? null,
    lastError: rule.lastError,
  };
}

export async function patchPylonIssueTaskSyncRule(
  userId: string,
  patch: PylonIssueTaskSyncRulePatch
): Promise<PylonIssueTaskSyncRuleState> {
  const existing = await getOrCreatePylonIssueTaskSyncRule(userId);
  const baseConfig = normalizeConfig(existing.config);

  const nextConfig = patch.config
    ? normalizeConfig({ ...baseConfig, ...patch.config })
    : baseConfig;

  const updated = await prisma.integrationRule.update({
    where: { id: existing.id },
    data: {
      enabled: typeof patch.enabled === "boolean" ? patch.enabled : existing.enabled,
      statusOverride:
        typeof patch.statusOverride === "undefined" ? existing.statusOverride : patch.statusOverride,
      config: nextConfig as unknown as Prisma.InputJsonValue,
      lastError: null,
    },
  });

  return serializePylonIssueTaskSyncRule(updated);
}

export async function runPylonIssueTaskSync(input: {
  userId: string;
  dryRun?: boolean;
}): Promise<PylonIssueTaskSyncRunResult> {
  const rule = await getOrCreatePylonIssueTaskSyncRule(input.userId);
  const config = normalizeConfig(rule.config);
  const checkpoint = normalizeCheckpoint(rule.checkpoint);
  const dryRun = Boolean(input.dryRun);

  if (!rule.enabled) {
    return {
      ruleId: rule.id,
      enabled: false,
      dryRun,
      scannedIssues: 0,
      createdTasks: 0,
      updatedTasks: 0,
      deduped: 0,
      skipped: 0,
      errors: [],
      checkpoint,
    };
  }

  const creds = await getCredentials(input.userId);
  if (!creds.pylonApiKey) {
    throw new Error("Pylon is not connected (missing token)");
  }

  const resolved = await resolveCustomerSupportProjectId({
    userId: input.userId,
    checkpoint,
  });
  const projectId = resolved.projectId;
  let nextCheckpoint = resolved.updatedCheckpoint;

  const params = new URLSearchParams();
  params.set("range", config.rangePreset);
  const range = parseAnalyticsTimeRange(params);

  const issues = await fetchPylonIssues({
    apiKey: creds.pylonApiKey,
    baseUrl: creds.pylonBaseUrl ?? undefined,
    from: range.from,
    to: range.to,
    limit: 200,
    timeoutMs: 15_000,
  });

  let scannedIssues = 0;
  let createdTasks = 0;
  let updatedTasks = 0;
  let deduped = 0;
  let skipped = 0;
  const errors: Array<{ issueId?: string; message: string }> = [];

  for (const issue of issues) {
    scannedIssues += 1;

    try {
      if (!shouldIncludePylonIssue(issue, config)) {
        skipped += 1;
        continue;
      }

      const issueId = getPylonIssueId(issue);
      if (!issueId) {
        skipped += 1;
        errors.push({ message: "Missing issue id" });
        continue;
      }

      const dedupeKey = buildPylonIssueTaskDedupeKey(issueId);
      const sourceUrl = getPylonIssueUrl(issue);
      const observedAt = (() => {
        const updatedAt = getPylonIssueUpdatedAt(issue);
        const ms = updatedAt ? Date.parse(updatedAt) : NaN;
        return Number.isFinite(ms) ? new Date(ms) : new Date();
      })();

      const targetStatus = resolvePylonIssueTaskStatus({
        issue,
        config,
        statusOverride: toOptionalSupportedStatus(rule.statusOverride),
      });

      const title = buildTaskTitleFromIssue(issue);
      const notes = upsertPylonNotesBlock(null, buildPylonNotesBlock(issue));
      const metadata: Prisma.InputJsonObject = {
        integration: {
          provider: "pylon",
          externalId: issueId,
          externalObjectType: "pylon_issue",
          ruleId: rule.id,
          sourceUrl,
          lastObservedAt: observedAt.toISOString(),
          dedupeKey,
        },
      };

      const existingReceipt = await prisma.integrationReceipt.findUnique({
        where: { dedupeKey },
        select: { id: true, taskId: true },
      });

      if (existingReceipt?.taskId) {
        const task = await prisma.task.findUnique({
          where: { id: existingReceipt.taskId },
          select: {
            id: true,
            status: true,
            notes: true,
            completedOn: true,
          },
        });

        if (!task) {
          errors.push({
            issueId,
            message: `Receipt references missing task ${existingReceipt.taskId}`,
          });
          continue;
        }

        if (!dryRun) {
          await prisma.$transaction(async (tx) => {
            const statusChanged = task.status !== targetStatus;
            const nextColumnOrder = statusChanged
              ? await getNextColumnOrder(
                  tx as unknown as typeof prisma,
                  targetStatus,
                  task.id
                )
              : undefined;

            const nextNotes = upsertPylonNotesBlock(
              task.notes ?? null,
              buildPylonNotesBlock(issue)
            );

            await tx.task.update({
              where: { id: task.id },
              data: {
                title,
                notes: nextNotes,
                projectId,
                unplanned: true,
                unplannedReason: "CUSTOMER_REQUEST",
                addedBy: "pylon",
                status: targetStatus,
                columnOrder: nextColumnOrder,
                completedOn:
                  targetStatus === "DONE" ? task.completedOn ?? new Date() : null,
                statusHistory: statusChanged
                  ? {
                      create: {
                        fromStatus: task.status,
                        toStatus: targetStatus,
                        changedBy: input.userId,
                      },
                    }
                  : undefined,
                metadata: metadata as unknown as Prisma.InputJsonValue,
              },
            });

            await tx.integrationReceipt.update({
              where: { id: existingReceipt.id },
              data: {
                sourceUrl,
                lastObservedAt: observedAt,
              },
            });
          });
        }

        updatedTasks += 1;
        continue;
      }

      if (existingReceipt && !existingReceipt.taskId) {
        deduped += 1;
        continue;
      }

      if (dryRun) {
        createdTasks += 1;
        continue;
      }

      try {
        await prisma.$transaction(async (tx) => {
          await tx.integrationReceipt.create({
            data: {
              ruleId: rule.id,
              dedupeKey,
              externalObjectType: "pylon_issue",
              externalObjectId: issueId,
              sourceUrl,
              lastObservedAt: observedAt,
              metadata: {
                status: getPylonIssueStatus(issue),
                priority: getPylonIssuePriority(issue),
                tags: getPylonIssueTags(issue),
              },
            },
          });

          const nextColumnOrder = await getNextColumnOrder(
            tx as unknown as typeof prisma,
            targetStatus
          );

          const task = await tx.task.create({
            data: {
              title,
              notes,
              status: targetStatus,
              columnOrder: nextColumnOrder,
              project: { connect: { id: projectId } },
              assignedOn: new Date(),
              unplanned: true,
              unplannedReason: "CUSTOMER_REQUEST",
              addedBy: "pylon",
              completedOn: targetStatus === "DONE" ? new Date() : null,
              metadata: metadata as unknown as Prisma.InputJsonValue,
              statusHistory: {
                create: {
                  fromStatus: null,
                  toStatus: targetStatus,
                  changedBy: input.userId,
                },
              },
            },
            select: { id: true },
          });

          await tx.integrationReceipt.updateMany({
            where: { dedupeKey },
            data: { taskId: task.id },
          });
        });

        createdTasks += 1;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          deduped += 1;
        } else {
          throw error;
        }
      }
    } catch (error) {
      skipped += 1;
      const issueId = getPylonIssueId(issue) ?? undefined;
      errors.push({
        issueId,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const now = new Date();
  nextCheckpoint = { ...nextCheckpoint, lastRunAt: now.toISOString() };
  await prisma.integrationRule.update({
    where: { id: rule.id },
    data: {
      lastRunAt: now,
      lastError: null,
      checkpoint: nextCheckpoint as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    ruleId: rule.id,
    enabled: true,
    dryRun,
    scannedIssues,
    createdTasks,
    updatedTasks,
    deduped,
    skipped,
    errors,
    checkpoint: nextCheckpoint,
  };
}

