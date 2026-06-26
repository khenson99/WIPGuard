import type { PrismaClientType } from "@/lib/prisma";
import {
  IMLADRIS_CANONICAL_MATERIALIZATION_DEPARTMENTS,
  materializeImladrisCanonicalMetrics,
  type ImladrisMaterializationDepartment,
} from "@/lib/imladris/materialization";
import { discoverConnectedUserIds } from "@/lib/sync/users";

const IMLADRIS_MATERIALIZATION_WINDOW_DAYS = 30;
const IMLADRIS_MATERIALIZATION_DEPARTMENT_BUCKET_MS = 10 * 60 * 1000;

interface UserOrganizationRow {
  id: string;
  organizationId: string | null;
}

interface ConnectionOrganizationRow {
  userId: string;
  organizationId: string | null;
}

export interface ImladrisMaterializationJobResult {
  startedAt: string;
  periodStart: string;
  periodEnd: string;
  departments: readonly ImladrisMaterializationDepartment[];
  contextsAttempted: number;
  contextsSucceeded: number;
  contextsFailed: number;
  metricsCount: number;
  metricKeys: string[];
  results: Array<{
    userId: string;
    organizationId: string | null;
    metricsCount: number;
    metricKeys: string[];
    error?: string;
  }>;
}

export interface ImladrisMaterializationJobInput {
  prisma: PrismaClientType;
  userIds?: string[];
  now?: Date;
  departments?: readonly ImladrisMaterializationDepartment[];
}

function daysBefore(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 86_400_000);
}

function parseImladrisMaterializationDepartmentLimit(): number {
  const raw = process.env.IMLADRIS_MATERIALIZATION_DEPARTMENT_LIMIT?.trim();
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(
      Math.floor(parsed),
      IMLADRIS_CANONICAL_MATERIALIZATION_DEPARTMENTS.length,
    );
  }

  return 1;
}

export function selectImladrisMaterializationDepartments(
  now: Date,
): readonly ImladrisMaterializationDepartment[] {
  const departmentLimit = parseImladrisMaterializationDepartmentLimit();
  const departments = IMLADRIS_CANONICAL_MATERIALIZATION_DEPARTMENTS;
  if (departmentLimit >= departments.length) return departments;

  const startIndex =
    Math.floor(now.getTime() / IMLADRIS_MATERIALIZATION_DEPARTMENT_BUCKET_MS) %
    departments.length;
  return Array.from({ length: departmentLimit }, (_, offset) => (
    departments[(startIndex + offset) % departments.length]
  ));
}

async function loadImladrisMaterializationContexts(
  prisma: PrismaClientType,
  userIds: string[],
): Promise<Array<{ userId: string; organizationId: string | null }>> {
  if (userIds.length === 0) return [];
  const users = (await prisma.user.findMany({
    where: {
      id: {
        in: userIds,
      },
    },
    select: {
      id: true,
      organizationId: true,
    },
  })) as UserOrganizationRow[];
  const userById = new Map(users.map((user) => [user.id, user]));
  const scopedConnections = (await prisma.integrationConnection.findMany({
    where: {
      userId: {
        in: userIds,
      },
      organizationId: {
        not: null,
      },
      status: {
        in: ["CONNECTED", "ERROR"],
      },
    },
    select: {
      userId: true,
      organizationId: true,
    },
    orderBy: [
      { lastSyncedAt: "desc" },
      { updatedAt: "desc" },
    ],
  })) as ConnectionOrganizationRow[];
  const connectionOrganizationByUserId = new Map<string, string>();
  for (const connection of scopedConnections) {
    if (connection.organizationId && !connectionOrganizationByUserId.has(connection.userId)) {
      connectionOrganizationByUserId.set(connection.userId, connection.organizationId);
    }
  }

  return userIds.map((userId) => ({
    userId,
    organizationId:
      userById.get(userId)?.organizationId ??
      connectionOrganizationByUserId.get(userId) ??
      null,
  }));
}

export async function runImladrisMaterializationJob(
  input: ImladrisMaterializationJobInput,
): Promise<ImladrisMaterializationJobResult> {
  const now = input.now ?? new Date();
  const userIds =
    input.userIds && input.userIds.length > 0
      ? input.userIds
      : await discoverConnectedUserIds(input.prisma);
  const contexts = await loadImladrisMaterializationContexts(input.prisma, userIds);
  const periodEnd = now;
  const periodStart = daysBefore(periodEnd, IMLADRIS_MATERIALIZATION_WINDOW_DAYS);
  const departments =
    input.departments && input.departments.length > 0
      ? input.departments
      : selectImladrisMaterializationDepartments(now);
  const results: ImladrisMaterializationJobResult["results"] = [];

  for (const context of contexts) {
    try {
      const metrics = await materializeImladrisCanonicalMetrics({
        prisma: input.prisma,
        context,
        periodStart,
        periodEnd,
        now,
        departments,
      });
      results.push({
        userId: context.userId,
        organizationId: context.organizationId,
        metricsCount: metrics.length,
        metricKeys: metrics.map((metric) => metric.metricKey),
      });
    } catch (error) {
      results.push({
        userId: context.userId,
        organizationId: context.organizationId,
        metricsCount: 0,
        metricKeys: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const metricKeys = results.flatMap((result) => result.metricKeys);

  return {
    startedAt: now.toISOString(),
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    departments,
    contextsAttempted: contexts.length,
    contextsSucceeded: results.filter((result) => !result.error).length,
    contextsFailed: results.filter((result) => result.error).length,
    metricsCount: metricKeys.length,
    metricKeys,
    results,
  };
}
