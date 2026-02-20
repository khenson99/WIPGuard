import {
  IntegrationConnectionStatus,
  IntegrationProvider,
  Prisma,
  type IntegrationConnection,
  type IntegrationRule,
  type TaskStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { protectIntegrationSecret, unprotectIntegrationSecret } from "@/lib/integrations/token-crypto";
import { getNextColumnOrder } from "@/lib/task-order";
import { buildOutboxIdempotencyKey, publishDomainEvent } from "@/lib/event-bus";
import { withRetries } from "@/lib/integrations/with-retries";
import { isCircuitClosed, recordSuccess, recordFailure, CircuitOpenError, getCircuitState } from "@/lib/integrations/circuit-breaker";

export const GOOGLE_CALENDAR_RULE_KEY = "google_calendar_prep_followup";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

type SupportedAutoTaskStatus = "QUEUED" | "ACTIVE" | "NOT_DONE";

export interface GoogleCalendarRuleConfig {
  calendarIds: string[];
  prepLeadHours: number;
  followupDelayMinutes: number;
  lookaheadHours: number;
  lookbackHours: number;
}

interface GoogleCalendarCheckpoint {
  lastObservedAt?: string;
  lastEventId?: string;
}

interface GoogleCalendarDateTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  htmlLink?: string;
  updated?: string;
  status?: string;
  start?: GoogleCalendarDateTime;
  end?: GoogleCalendarDateTime;
  organizer?: { email?: string; displayName?: string };
}

interface GoogleCalendarEventsResponse {
  items?: GoogleCalendarEvent[];
}

type CalendarTaskVariant = "prep" | "followup";

export interface GoogleCalendarRuleState {
  id: string;
  key: string;
  enabled: boolean;
  statusOverride: SupportedAutoTaskStatus | null;
  config: GoogleCalendarRuleConfig;
  checkpoint: GoogleCalendarCheckpoint;
  lastObservedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface GoogleCalendarRulePatch {
  enabled?: boolean;
  statusOverride?: SupportedAutoTaskStatus | null;
  config?: Partial<GoogleCalendarRuleConfig>;
}

export interface GoogleCalendarCreatedTask {
  eventId: string;
  variant: CalendarTaskVariant;
  taskId: string;
  title: string;
  sourceUrl: string;
}

export interface GoogleCalendarRunResult {
  ruleId: string;
  enabled: boolean;
  scannedEvents: number;
  createdTasks: number;
  dedupedTasks: number;
  failedTasks: number;
  cursor: GoogleCalendarCheckpoint;
  tasks: GoogleCalendarCreatedTask[];
  errors: Array<{ eventId: string; error: string }>;
}

class GoogleCalendarIntegrationAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleCalendarIntegrationAuthError";
  }
}

export function defaultGoogleCalendarRuleConfig(): GoogleCalendarRuleConfig {
  return {
    calendarIds: ["primary"],
    prepLeadHours: 24,
    followupDelayMinutes: 15,
    lookaheadHours: 72,
    lookbackHours: 48,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeConfig(raw: unknown): GoogleCalendarRuleConfig {
  const input = asRecord(raw);
  const fallback = defaultGoogleCalendarRuleConfig();

  const calendarIds = Array.isArray(input.calendarIds)
    ? input.calendarIds.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0
      )
    : fallback.calendarIds;

  const prepLeadHours =
    typeof input.prepLeadHours === "number" && Number.isFinite(input.prepLeadHours)
      ? Math.max(1, Math.min(96, Math.floor(input.prepLeadHours)))
      : fallback.prepLeadHours;

  const followupDelayMinutes =
    typeof input.followupDelayMinutes === "number" && Number.isFinite(input.followupDelayMinutes)
      ? Math.max(0, Math.min(1440, Math.floor(input.followupDelayMinutes)))
      : fallback.followupDelayMinutes;

  const lookaheadHours =
    typeof input.lookaheadHours === "number" && Number.isFinite(input.lookaheadHours)
      ? Math.max(1, Math.min(240, Math.floor(input.lookaheadHours)))
      : fallback.lookaheadHours;

  const lookbackHours =
    typeof input.lookbackHours === "number" && Number.isFinite(input.lookbackHours)
      ? Math.max(1, Math.min(168, Math.floor(input.lookbackHours)))
      : fallback.lookbackHours;

  return {
    calendarIds: calendarIds.length > 0 ? calendarIds : fallback.calendarIds,
    prepLeadHours,
    followupDelayMinutes,
    lookaheadHours,
    lookbackHours,
  };
}

function normalizeCheckpoint(raw: unknown): GoogleCalendarCheckpoint {
  const input = asRecord(raw);
  const checkpoint: GoogleCalendarCheckpoint = {};

  if (typeof input.lastObservedAt === "string" && input.lastObservedAt.length > 0) {
    checkpoint.lastObservedAt = input.lastObservedAt;
  }
  if (typeof input.lastEventId === "string" && input.lastEventId.length > 0) {
    checkpoint.lastEventId = input.lastEventId;
  }

  return checkpoint;
}

function parseEventDateTime(value: GoogleCalendarDateTime | undefined): Date | null {
  if (!value) return null;
  if (typeof value.dateTime === "string") {
    const dt = new Date(value.dateTime);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  if (typeof value.date === "string") {
    const dt = new Date(`${value.date}T00:00:00`);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

function toSupportedStatus(value: TaskStatus | null | undefined): SupportedAutoTaskStatus {
  if (value === "ACTIVE" || value === "NOT_DONE") {
    return value;
  }
  return "QUEUED";
}

function toOptionalSupportedStatus(
  value: TaskStatus | null | undefined
): SupportedAutoTaskStatus | null {
  if (!value) return null;
  return toSupportedStatus(value);
}

export function buildGoogleCalendarDedupeKey(input: {
  calendarId: string;
  eventId: string;
  variant: CalendarTaskVariant;
}): string {
  return [
    "google_workspace",
    "calendar_event",
    `${input.calendarId}:${input.eventId}`,
    input.variant,
  ].join(":");
}

function shouldCreatePrepTask(eventStart: Date, now: Date, prepLeadHours: number): boolean {
  const msUntilStart = eventStart.getTime() - now.getTime();
  return msUntilStart > 0 && msUntilStart <= prepLeadHours * 60 * 60 * 1000;
}

function shouldCreateFollowupTask(eventEnd: Date, now: Date): boolean {
  return eventEnd.getTime() <= now.getTime();
}

function eventSourceUrl(calendarId: string, event: GoogleCalendarEvent): string {
  return (
    event.htmlLink ??
    `https://calendar.google.com/calendar/u/0/r/eventedit/${encodeURIComponent(`${calendarId}:${event.id}`)}`
  );
}

function buildTaskTitle(summary: string, variant: CalendarTaskVariant): string {
  if (variant === "prep") {
    return `[Calendar Prep] ${summary}`;
  }
  return `[Meeting Follow-up] ${summary}`;
}

function buildTaskNotes(input: {
  summary: string;
  description: string | null;
  sourceUrl: string;
  start: Date | null;
  end: Date | null;
  organizer: string | null;
  variant: CalendarTaskVariant;
}): string {
  const lines = [
    "Created from Google Calendar automation",
    `Variant: ${input.variant}`,
    input.organizer ? `Organizer: ${input.organizer}` : null,
    input.start ? `Start: ${input.start.toISOString()}` : null,
    input.end ? `End: ${input.end.toISOString()}` : null,
    `Source: ${input.sourceUrl}`,
    "",
    input.summary,
    input.description ? "" : null,
    input.description,
  ].filter(Boolean);

  return lines.join("\n");
}


async function markConnectionError(userId: string, message: string): Promise<void> {
  await prisma.integrationConnection.updateMany({
    where: {
      userId,
      provider: IntegrationProvider.GOOGLE_WORKSPACE,
    },
    data: {
      status: IntegrationConnectionStatus.ERROR,
      lastError: message,
      lastSyncedAt: null,
    },
  });
}

function parseTokenResponse(raw: unknown): {
  accessToken: string;
  expiresAt: Date | null;
  refreshToken: string | null;
  tokenType: string | null;
} {
  const body = asRecord(raw);
  const accessToken =
    typeof body.access_token === "string" && body.access_token.trim().length > 0
      ? body.access_token.trim()
      : null;

  if (!accessToken) {
    throw new GoogleCalendarIntegrationAuthError("Google token refresh response missing access token");
  }

  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : null;
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;
  const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : null;
  const tokenType = typeof body.token_type === "string" ? body.token_type : null;

  return { accessToken, expiresAt, refreshToken, tokenType };
}

async function refreshGoogleAccessToken(connection: IntegrationConnection): Promise<string> {
  const refreshToken = unprotectIntegrationSecret(connection.refreshToken);
  if (!refreshToken) {
    throw new GoogleCalendarIntegrationAuthError("Google refresh token is missing");
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new GoogleCalendarIntegrationAuthError("Google OAuth client credentials are missing");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
  });

  const parsed = await withRetries(
    async () => {
      const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        cache: "no-store",
      });

      const json = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) {
        const details = asRecord(json);
        const reason =
          (typeof details.error_description === "string" && details.error_description) ||
          (typeof details.error === "string" && details.error) ||
          "Google token refresh failed";
        throw new GoogleCalendarIntegrationAuthError(reason);
      }

      return parseTokenResponse(json);
    },
    { maxAttempts: 2, baseDelayMs: 500, maxDelayMs: 2000 }
  );

  await prisma.integrationConnection.update({
    where: {
      userId_provider: {
        userId: connection.userId,
        provider: IntegrationProvider.GOOGLE_WORKSPACE,
      },
    },
    data: {
      accessToken: protectIntegrationSecret(parsed.accessToken),
      refreshToken: protectIntegrationSecret(parsed.refreshToken) ?? connection.refreshToken,
      tokenType: parsed.tokenType ?? connection.tokenType,
      expiresAt: parsed.expiresAt,
      status: IntegrationConnectionStatus.CONNECTED,
      lastError: null,
      lastSyncedAt: new Date(),
    },
  });

  return parsed.accessToken;
}

/** In-flight refresh promises keyed by userId to prevent concurrent refresh races. */
const inflightRefreshes = new Map<string, Promise<string>>();

async function getValidGoogleAccessToken(userId: string): Promise<string> {
  const connection = await prisma.integrationConnection.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: IntegrationProvider.GOOGLE_WORKSPACE,
      },
    },
  });

  if (!connection || connection.status !== IntegrationConnectionStatus.CONNECTED) {
    throw new GoogleCalendarIntegrationAuthError("Google Workspace is not connected");
  }

  const token = unprotectIntegrationSecret(connection.accessToken);
  if (!token) {
    throw new GoogleCalendarIntegrationAuthError("Google access token is missing");
  }

  const expiresSoon =
    Boolean(connection.expiresAt) &&
    connection.expiresAt!.getTime() <= Date.now() + 60_000;

  if (expiresSoon) {
    // Deduplicate concurrent refresh attempts for the same user
    const existing = inflightRefreshes.get(userId);
    if (existing) return existing;

    const promise = refreshGoogleAccessToken(connection).finally(() => {
      inflightRefreshes.delete(userId);
    });
    inflightRefreshes.set(userId, promise);
    return promise;
  }

  return token;
}

async function googleCalendarFetch<T>(accessToken: string, url: URL): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new GoogleCalendarIntegrationAuthError("Google access token is invalid or expired");
  }

  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || payload === null) {
    throw new Error(`Google Calendar API failed (${response.status})`);
  }

  return payload;
}

async function listCalendarEvents(input: {
  accessToken: string;
  calendarId: string;
  config: GoogleCalendarRuleConfig;
}): Promise<GoogleCalendarEvent[]> {
  const now = new Date();
  const timeMin = new Date(now.getTime() - input.config.lookbackHours * 60 * 60 * 1000);
  const timeMax = new Date(now.getTime() + input.config.lookaheadHours * 60 * 60 * 1000);

  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events`
  );
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("timeMin", timeMin.toISOString());
  url.searchParams.set("timeMax", timeMax.toISOString());
  url.searchParams.set("maxResults", "250");

  const payload = await googleCalendarFetch<GoogleCalendarEventsResponse>(input.accessToken, url);
  return payload.items ?? [];
}

async function findAssigneeByEmail(fallbackUserId: string, email: string | null): Promise<string> {
  if (!email) return fallbackUserId;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  return user?.id ?? fallbackUserId;
}

async function recordDeadLetterFailure(input: {
  ruleId: string;
  eventId: string;
  variant: CalendarTaskVariant;
  error: string;
}): Promise<void> {
  await prisma.outboxEvent.create({
    data: {
      eventType: "integration.google.calendar.failed",
      aggregateType: "integration_rule",
      aggregateId: input.ruleId,
      schemaVersion: 1,
      payload: {
        eventId: input.eventId,
        variant: input.variant,
        error: input.error,
      },
      idempotencyKey: `dead-letter:google-calendar:${input.ruleId}:${input.eventId}:${input.variant}:${Date.now()}`,
      status: "DEAD_LETTER",
      retryCount: 0,
      nextAttemptAt: new Date(),
      failedAt: new Date(),
      error: input.error,
      lastAttemptAt: new Date(),
    },
  });
}

function candidateVariants(input: {
  start: Date | null;
  end: Date | null;
  now: Date;
  config: GoogleCalendarRuleConfig;
}): CalendarTaskVariant[] {
  const variants: CalendarTaskVariant[] = [];
  if (input.start && shouldCreatePrepTask(input.start, input.now, input.config.prepLeadHours)) {
    variants.push("prep");
  }
  if (input.end && shouldCreateFollowupTask(input.end, input.now)) {
    variants.push("followup");
  }
  return variants;
}

export async function getOrCreateGoogleCalendarRule(userId: string): Promise<IntegrationRule> {
  return prisma.integrationRule.upsert({
    where: {
      userId_provider_key: {
        userId,
        provider: IntegrationProvider.GOOGLE_WORKSPACE,
        key: GOOGLE_CALENDAR_RULE_KEY,
      },
    },
    update: {},
    create: {
      userId,
      provider: IntegrationProvider.GOOGLE_WORKSPACE,
      key: GOOGLE_CALENDAR_RULE_KEY,
      enabled: true,
      statusOverride: null,
      config: defaultGoogleCalendarRuleConfig() as unknown as Prisma.InputJsonValue,
      checkpoint: {} as unknown as Prisma.InputJsonValue,
    },
  });
}

export function serializeGoogleCalendarRule(rule: IntegrationRule): GoogleCalendarRuleState {
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

export async function patchGoogleCalendarRule(
  userId: string,
  patch: GoogleCalendarRulePatch
): Promise<GoogleCalendarRuleState> {
  const existing = await getOrCreateGoogleCalendarRule(userId);
  const baseConfig = normalizeConfig(existing.config);

  const nextConfig = patch.config
    ? normalizeConfig({ ...baseConfig, ...patch.config })
    : baseConfig;

  const updated = await prisma.integrationRule.update({
    where: { id: existing.id },
    data: {
      enabled: typeof patch.enabled === "boolean" ? patch.enabled : existing.enabled,
      statusOverride:
        typeof patch.statusOverride === "undefined"
          ? existing.statusOverride
          : patch.statusOverride,
      config: nextConfig as unknown as Prisma.InputJsonValue,
      lastError: null,
    },
  });

  return serializeGoogleCalendarRule(updated);
}

export async function runGoogleCalendarPrepFollowup(input: {
  userId: string;
  dryRun?: boolean;
}): Promise<GoogleCalendarRunResult> {
  const rule = await getOrCreateGoogleCalendarRule(input.userId);
  const config = normalizeConfig(rule.config);
  const checkpoint = normalizeCheckpoint(rule.checkpoint);

  if (!rule.enabled) {
    return {
      ruleId: rule.id,
      enabled: false,
      scannedEvents: 0,
      createdTasks: 0,
      dedupedTasks: 0,
      failedTasks: 0,
      cursor: checkpoint,
      tasks: [],
      errors: [],
    };
  }

  const CB_PROVIDER = "google_calendar";
  if (!isCircuitClosed(CB_PROVIDER, input.userId)) {
    throw new CircuitOpenError(CB_PROVIDER, input.userId, getCircuitState(CB_PROVIDER, input.userId));
  }
  let _cbSuccess = false;
  try {

  let accessToken: string;
  try {
    accessToken = await getValidGoogleAccessToken(input.userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markConnectionError(input.userId, message);
    await prisma.integrationRule.update({
      where: { id: rule.id },
      data: {
        lastRunAt: new Date(),
        lastError: message,
      },
    });
    throw error;
  }

  let scannedEvents = 0;
  let createdTasks = 0;
  let dedupedTasks = 0;
  let failedTasks = 0;
  const tasks: GoogleCalendarCreatedTask[] = [];
  const errors: Array<{ eventId: string; error: string }> = [];

  let lastObservedAtMs = checkpoint.lastObservedAt
    ? Date.parse(checkpoint.lastObservedAt)
    : Number.NaN;
  let lastEventId = checkpoint.lastEventId;

  const now = new Date();
  const status = toSupportedStatus(rule.statusOverride);

  for (const calendarId of config.calendarIds) {
    const events = await withRetries(() =>
      listCalendarEvents({ accessToken, calendarId, config })
    );

    scannedEvents += events.length;

    for (const event of events) {
      if (!event.id || event.status === "cancelled") continue;

      const start = parseEventDateTime(event.start);
      const end = parseEventDateTime(event.end);
      const variants = candidateVariants({ start, end, now, config });
      if (variants.length === 0) continue;

      const updatedMs = event.updated ? Date.parse(event.updated) : Number.NaN;
      if (Number.isFinite(updatedMs) && (!Number.isFinite(lastObservedAtMs) || updatedMs > lastObservedAtMs)) {
        lastObservedAtMs = updatedMs;
        lastEventId = event.id;
      }

      for (const variant of variants) {
        const summary = event.summary?.trim() || "Meeting";
        const sourceUrl = eventSourceUrl(calendarId, event);
        const dedupeKey = buildGoogleCalendarDedupeKey({
          calendarId,
          eventId: event.id,
          variant,
        });

        const dueDate =
          variant === "prep"
            ? start
            : end
              ? new Date(end.getTime() + config.followupDelayMinutes * 60 * 1000)
              : null;

        if (input.dryRun) {
          tasks.push({
            eventId: event.id,
            variant,
            taskId: "dry-run",
            title: buildTaskTitle(summary, variant),
            sourceUrl,
          });
          continue;
        }

        try {
          const taskResult = await withRetries(async () => {
            try {
              return await prisma.$transaction(async (transaction) => {
                const receipt = await transaction.integrationReceipt.create({
                  data: {
                    ruleId: rule.id,
                    dedupeKey,
                    externalObjectType: "calendar_event",
                    externalObjectId: `${calendarId}:${event.id}`,
                    sourceUrl,
                    lastObservedAt: Number.isFinite(updatedMs) ? new Date(updatedMs) : new Date(),
                    metadata: {
                      variant,
                      calendarId,
                    },
                  },
                });

                const organizerEmail = event.organizer?.email ?? null;
                const assigneeId = await findAssigneeByEmail(input.userId, organizerEmail);

                const nextColumnOrder = await getNextColumnOrder(
                  transaction as unknown as typeof prisma,
                  status
                );

                const createdTask = await transaction.task.create({
                  data: {
                    title: buildTaskTitle(summary, variant),
                    notes: buildTaskNotes({
                      summary,
                      description: event.description?.trim() || null,
                      sourceUrl,
                      start,
                      end,
                      organizer: organizerEmail,
                      variant,
                    }),
                    status,
                    dueDate: dueDate ?? undefined,
                    assignedOn: new Date(),
                    columnOrder: nextColumnOrder,
                    metadata: {
                      integration: {
                        provider: "google_workspace",
                        externalId: `${calendarId}:${event.id}`,
                        externalObjectType: "calendar_event",
                        ruleId: rule.id,
                        sourceUrl,
                        lastObservedAt: event.updated ?? new Date().toISOString(),
                        dedupeKey,
                        variant,
                      },
                    },
                    responsible: {
                      connect: [{ id: assigneeId }],
                    },
                    statusHistory: {
                      create: {
                        fromStatus: null,
                        toStatus: status,
                        changedBy: input.userId,
                      },
                    },
                  },
                  select: {
                    id: true,
                    title: true,
                  },
                });

                await transaction.integrationReceipt.update({
                  where: { id: receipt.id },
                  data: { taskId: createdTask.id },
                });

                await publishDomainEvent(
                  {
                    eventType: "integration.google.calendar_task_created",
                    aggregateType: "integration_rule",
                    aggregateId: rule.id,
                    payload: {
                      ruleId: rule.id,
                      taskId: createdTask.id,
                      calendarId,
                      eventId: event.id,
                      variant,
                      sourceUrl,
                    },
                    idempotencyKey: buildOutboxIdempotencyKey({
                      aggregateType: "integration_rule",
                      aggregateId: rule.id,
                      eventType: `google_calendar_${variant}_${event.id}`,
                    }),
                  },
                  transaction
                );

                return createdTask;
              });
            } catch (error) {
              if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === "P2002"
              ) {
                return null;
              }
              throw error;
            }
          });

          if (!taskResult) {
            dedupedTasks += 1;
            continue;
          }

          createdTasks += 1;
          tasks.push({
            eventId: event.id,
            variant,
            taskId: taskResult.id,
            title: taskResult.title,
            sourceUrl,
          });

          console.info("integration.google.calendar.created", {
            provider: "google_workspace",
            ruleId: rule.id,
            externalId: `${calendarId}:${event.id}`,
            variant,
            taskId: taskResult.id,
          });
        } catch (error) {
          failedTasks += 1;
          const message = error instanceof Error ? error.message : String(error);
          errors.push({ eventId: event.id, error: message });

          await recordDeadLetterFailure({
            ruleId: rule.id,
            eventId: event.id,
            variant,
            error: message,
          });
        }
      }
    }
  }

  const nextCheckpoint: GoogleCalendarCheckpoint = {
    lastObservedAt: Number.isFinite(lastObservedAtMs)
      ? new Date(lastObservedAtMs).toISOString()
      : checkpoint.lastObservedAt,
    lastEventId,
  };

  await prisma.integrationRule.update({
    where: { id: rule.id },
    data: {
      checkpoint: nextCheckpoint as unknown as Prisma.InputJsonValue,
      lastObservedAt: nextCheckpoint.lastObservedAt
        ? new Date(nextCheckpoint.lastObservedAt)
        : rule.lastObservedAt,
      lastRunAt: new Date(),
      lastError: errors.length > 0 ? `${errors.length} calendar task(s) failed` : null,
    },
  });

  await prisma.integrationConnection.updateMany({
    where: {
      userId: input.userId,
      provider: IntegrationProvider.GOOGLE_WORKSPACE,
    },
    data: {
      status: IntegrationConnectionStatus.CONNECTED,
      lastError: errors.length > 0 ? `${errors.length} calendar task(s) failed` : null,
      lastSyncedAt: new Date(),
    },
  });

  _cbSuccess = true;
  return {
    ruleId: rule.id,
    enabled: true,
    scannedEvents,
    createdTasks,
    dedupedTasks,
    failedTasks,
    cursor: nextCheckpoint,
    tasks,
    errors,
  };

  } finally {
    if (_cbSuccess) recordSuccess(CB_PROVIDER, input.userId);
    else recordFailure(CB_PROVIDER, input.userId);
  }
}
