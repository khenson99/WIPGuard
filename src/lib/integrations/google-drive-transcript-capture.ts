import {
  IntegrationConnectionStatus,
  IntegrationProvider,
  Prisma,
  type IntegrationRule,
  type TaskStatus,
} from "@/generated/prisma/client";
import { dispatchWorkflowTriggerEvents, enqueueWorkflowTriggerEvent } from "@/lib/automations/runtime";
import { prisma } from "@/lib/prisma";
import { withRetries } from "@/lib/integrations/with-retries";
import {
  CircuitOpenError,
  getCircuitState,
  isCircuitClosed,
  recordFailure,
  recordSuccess,
} from "@/lib/integrations/circuit-breaker";
import { resolveIntegrationOrganizationId } from "@/lib/integrations/ownership";
import { getValidIntegrationAccessToken } from "@/lib/integrations/token-refresh";

export const GOOGLE_DRIVE_TRANSCRIPT_RULE_KEY = "google_drive_transcript_capture";

type SupportedAutoTaskStatus = "QUEUED" | "ACTIVE" | "NOT_DONE";

export interface GoogleDriveTranscriptCaptureConfig {
  folderIds: string[];
  lookbackHours: number;
  filenameKeywords: string[];
  maxFilesPerRun: number;
}

interface GoogleDriveTranscriptCheckpoint {
  lastObservedAt?: string;
  lastFileId?: string;
}

interface GoogleDriveFileOwner {
  displayName?: string;
  emailAddress?: string;
}

interface GoogleDriveTranscriptFile {
  id: string;
  name?: string;
  mimeType?: string;
  webViewLink?: string;
  modifiedTime?: string;
  owners?: GoogleDriveFileOwner[];
}

interface GoogleDriveFilesResponse {
  files?: GoogleDriveTranscriptFile[];
  nextPageToken?: string;
}

export interface GoogleDriveTranscriptRuleState {
  id: string;
  key: string;
  enabled: boolean;
  statusOverride: SupportedAutoTaskStatus | null;
  config: GoogleDriveTranscriptCaptureConfig;
  checkpoint: GoogleDriveTranscriptCheckpoint;
  lastObservedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface GoogleDriveTranscriptRulePatch {
  enabled?: boolean;
  statusOverride?: SupportedAutoTaskStatus | null;
  config?: Partial<GoogleDriveTranscriptCaptureConfig>;
}

export interface GoogleDriveTranscriptMatchResult {
  meetingId: string;
  confidence: number;
  score: number;
  reasons: string[];
}

export interface GoogleDriveTranscriptIngestedRecord {
  fileId: string;
  fileName: string;
  operation: "matched" | "stored" | "updated";
  meetingId: string | null;
  confidence: number | null;
  sourceDocumentId: string | null;
}

export interface GoogleDriveTranscriptCaptureResult {
  ruleId: string;
  enabled: boolean;
  scannedFiles: number;
  matchedFiles: number;
  unmatchedFiles: number;
  dispatchedEvents: number;
  failedFiles: number;
  cursor: GoogleDriveTranscriptCheckpoint;
  transcripts: GoogleDriveTranscriptIngestedRecord[];
  errors: Array<{ fileId: string; error: string }>;
}

interface MatchingMeeting {
  id: string;
  title: string;
  status: string;
  startAt: string;
  endAt: string | null;
  dealId: string | null;
  dealName: string | null;
  hubspotDealId: string | null;
  companyName: string | null;
  attendeeEmails: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeConfig(raw: unknown): GoogleDriveTranscriptCaptureConfig {
  const input = asRecord(raw);
  const fallback = defaultGoogleDriveTranscriptCaptureConfig();
  const folderIds = Array.isArray(input.folderIds)
    ? input.folderIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : fallback.folderIds;
  const filenameKeywords = Array.isArray(input.filenameKeywords)
    ? input.filenameKeywords.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : fallback.filenameKeywords;
  const lookbackHours =
    typeof input.lookbackHours === "number" && Number.isFinite(input.lookbackHours)
      ? Math.max(1, Math.min(24 * 14, Math.floor(input.lookbackHours)))
      : fallback.lookbackHours;
  const maxFilesPerRun =
    typeof input.maxFilesPerRun === "number" && Number.isFinite(input.maxFilesPerRun)
      ? Math.max(1, Math.min(500, Math.floor(input.maxFilesPerRun)))
      : fallback.maxFilesPerRun;

  return {
    folderIds: Array.from(new Set(folderIds)),
    lookbackHours,
    filenameKeywords: filenameKeywords.length > 0 ? filenameKeywords : fallback.filenameKeywords,
    maxFilesPerRun,
  };
}

function normalizeCheckpoint(raw: unknown): GoogleDriveTranscriptCheckpoint {
  const input = asRecord(raw);
  const checkpoint: GoogleDriveTranscriptCheckpoint = {};
  if (typeof input.lastObservedAt === "string" && input.lastObservedAt.trim()) {
    checkpoint.lastObservedAt = input.lastObservedAt;
  }
  if (typeof input.lastFileId === "string" && input.lastFileId.trim()) {
    checkpoint.lastFileId = input.lastFileId;
  }
  return checkpoint;
}

function toSupportedStatus(value: TaskStatus | null | undefined): SupportedAutoTaskStatus {
  if (value === "ACTIVE" || value === "NOT_DONE") return value;
  return "QUEUED";
}

function toOptionalSupportedStatus(value: TaskStatus | null | undefined): SupportedAutoTaskStatus | null {
  if (!value) return null;
  return toSupportedStatus(value);
}

function normalizeKey(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function tokenize(value: string | null | undefined): string[] {
  return normalizeKey(value).split(/[^a-z0-9]+/g).filter((token) => token.length >= 3);
}

function sharedTokenCount(left: string | null | undefined, right: string | null | undefined): number {
  const leftTokens = new Set(tokenize(left));
  if (leftTokens.size === 0) return 0;
  let count = 0;
  for (const token of tokenize(right)) {
    if (leftTokens.has(token)) count += 1;
  }
  return count;
}

function isTranscriptCandidate(file: GoogleDriveTranscriptFile, config: GoogleDriveTranscriptCaptureConfig): boolean {
  const name = normalizeKey(file.name);
  if (!name) return false;
  return config.filenameKeywords.some((keyword) => name.includes(normalizeKey(keyword)));
}

function buildTranscriptReceiptDedupeKey(file: GoogleDriveTranscriptFile): string {
  return [
    "google_workspace",
    "drive_transcript",
    file.id,
    normalizeKey(file.modifiedTime ?? ""),
  ].join(":");
}

export function defaultGoogleDriveTranscriptCaptureConfig(): GoogleDriveTranscriptCaptureConfig {
  return {
    folderIds: [],
    lookbackHours: 72,
    filenameKeywords: ["transcript", "chat", "meet", "demo"],
    maxFilesPerRun: 50,
  };
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
      lastSyncedAt: new Date(),
    },
  });
}

async function listDriveTranscriptFiles(input: {
  token: string;
  config: GoogleDriveTranscriptCaptureConfig;
  checkpoint: GoogleDriveTranscriptCheckpoint;
}): Promise<GoogleDriveTranscriptFile[]> {
  const files: GoogleDriveTranscriptFile[] = [];
  const modifiedAfter = input.checkpoint.lastObservedAt
    ? new Date(input.checkpoint.lastObservedAt)
    : new Date(Date.now() - input.config.lookbackHours * 60 * 60 * 1000);
  const modifiedAfterIso = Number.isNaN(modifiedAfter.getTime())
    ? new Date(Date.now() - input.config.lookbackHours * 60 * 60 * 1000).toISOString()
    : modifiedAfter.toISOString();

  for (const folderId of input.config.folderIds) {
    let nextPageToken: string | undefined;

    do {
      const url = new URL("https://www.googleapis.com/drive/v3/files");
      url.searchParams.set("q", `'${folderId}' in parents and trashed = false and modifiedTime >= '${modifiedAfterIso}'`);
      url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime,owners(displayName,emailAddress))");
      url.searchParams.set("orderBy", "modifiedTime desc");
      url.searchParams.set("pageSize", String(Math.min(100, input.config.maxFilesPerRun)));
      url.searchParams.set("includeItemsFromAllDrives", "true");
      url.searchParams.set("supportsAllDrives", "true");
      if (nextPageToken) {
        url.searchParams.set("pageToken", nextPageToken);
      }

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${input.token}` },
        cache: "no-store",
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Google Drive files API error ${response.status}: ${body || response.statusText}`);
      }

      const payload = (await response.json()) as GoogleDriveFilesResponse;
      for (const file of payload.files ?? []) {
        if (!isTranscriptCandidate(file, input.config)) continue;
        files.push(file);
        if (files.length >= input.config.maxFilesPerRun) {
          return files;
        }
      }

      nextPageToken = payload.nextPageToken;
    } while (nextPageToken && files.length < input.config.maxFilesPerRun);
  }

  return files;
}

async function fetchTranscriptText(input: {
  token: string;
  file: GoogleDriveTranscriptFile;
}): Promise<string | null> {
  const mimeType = input.file.mimeType ?? "";
  const endpoint = mimeType === "application/vnd.google-apps.document"
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.file.id)}/export?mimeType=text/plain`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.file.id)}?alt=media`;

  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${input.token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Google Drive file content error ${response.status}: ${body || response.statusText}`);
  }

  const text = await response.text();
  const normalized = text.trim();
  return normalized.length > 0 ? normalized : null;
}

async function listCandidateMeetings(
  organizationId: string,
  file: GoogleDriveTranscriptFile
): Promise<MatchingMeeting[]> {
  const modifiedAt = file.modifiedTime ? new Date(file.modifiedTime) : new Date();
  const from = new Date(modifiedAt.getTime() - 6 * 60 * 60 * 1000);
  const to = new Date(modifiedAt.getTime() + 24 * 60 * 60 * 1000);

  const meetings = await prisma.dealMeeting.findMany({
    where: {
      dealId: { not: null },
      deal: {
        is: {
          organizationId,
        },
      },
      startAt: {
        gte: from,
        lte: to,
      },
    },
    include: {
      deal: {
        select: {
          id: true,
          name: true,
          hubspotDealId: true,
        },
      },
      company: {
        select: {
          name: true,
        },
      },
      attendees: {
        select: {
          email: true,
        },
      },
    },
    orderBy: {
      startAt: "asc",
    },
  });

  return meetings.map((meeting) => ({
    id: meeting.id,
    title: meeting.title,
    status: meeting.status,
    startAt: meeting.startAt.toISOString(),
    endAt: meeting.endAt?.toISOString() ?? null,
    dealId: meeting.dealId,
    dealName: meeting.deal?.name ?? null,
    hubspotDealId: meeting.deal?.hubspotDealId ?? null,
    companyName: meeting.company?.name ?? null,
    attendeeEmails: meeting.attendees.map((attendee) => attendee.email).filter(Boolean) as string[],
  }));
}

export function scoreTranscriptMatch(input: {
  file: GoogleDriveTranscriptFile;
  meeting: MatchingMeeting;
}): GoogleDriveTranscriptMatchResult | null {
  const fileName = input.file.name ?? "";
  const reasons: string[] = [];
  let score = 0;

  const titleOverlap = sharedTokenCount(fileName, input.meeting.title);
  if (titleOverlap > 0) {
    score += Math.min(4, titleOverlap * 2);
    reasons.push("title");
  }

  const dealOverlap = sharedTokenCount(fileName, input.meeting.dealName);
  if (dealOverlap > 0) {
    score += Math.min(5, dealOverlap * 2);
    reasons.push("deal");
  }

  const companyOverlap = sharedTokenCount(fileName, input.meeting.companyName);
  if (companyOverlap > 0) {
    score += Math.min(4, companyOverlap * 2);
    reasons.push("company");
  }

  const ownerEmails = input.file.owners?.map((owner) => normalizeKey(owner.emailAddress)).filter(Boolean) ?? [];
  const attendeeMatch = input.meeting.attendeeEmails.some((email) => ownerEmails.includes(normalizeKey(email)));
  if (attendeeMatch) {
    score += 2;
    reasons.push("attendee");
  }

  const modifiedAt = input.file.modifiedTime ? new Date(input.file.modifiedTime).getTime() : Number.NaN;
  const meetingStart = new Date(input.meeting.startAt).getTime();
  const meetingEnd = input.meeting.endAt ? new Date(input.meeting.endAt).getTime() : meetingStart + 60 * 60 * 1000;
  const windowDistance = Number.isFinite(modifiedAt)
    ? Math.min(Math.abs(modifiedAt - meetingStart), Math.abs(modifiedAt - meetingEnd))
    : Number.POSITIVE_INFINITY;

  if (windowDistance <= 2 * 60 * 60 * 1000) {
    score += 4;
    reasons.push("time-tight");
  } else if (windowDistance <= 8 * 60 * 60 * 1000) {
    score += 2;
    reasons.push("time-near");
  }

  if (score < 5) {
    return null;
  }

  return {
    meetingId: input.meeting.id,
    confidence: Math.min(1, score / 12),
    score,
    reasons,
  };
}

export async function getOrCreateGoogleDriveTranscriptRule(userId: string): Promise<IntegrationRule> {
  return prisma.integrationRule.upsert({
    where: {
      userId_provider_key: {
        userId,
        provider: IntegrationProvider.GOOGLE_WORKSPACE,
        key: GOOGLE_DRIVE_TRANSCRIPT_RULE_KEY,
      },
    },
    update: {},
    create: {
      userId,
      provider: IntegrationProvider.GOOGLE_WORKSPACE,
      key: GOOGLE_DRIVE_TRANSCRIPT_RULE_KEY,
      enabled: true,
      statusOverride: null,
      config: defaultGoogleDriveTranscriptCaptureConfig() as unknown as Prisma.InputJsonValue,
      checkpoint: {} as unknown as Prisma.InputJsonValue,
    },
  });
}

export function serializeGoogleDriveTranscriptRule(rule: IntegrationRule): GoogleDriveTranscriptRuleState {
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

export async function patchGoogleDriveTranscriptRule(
  userId: string,
  patch: GoogleDriveTranscriptRulePatch,
): Promise<GoogleDriveTranscriptRuleState> {
  const existing = await getOrCreateGoogleDriveTranscriptRule(userId);
  const baseConfig = normalizeConfig(existing.config);
  const nextConfig = patch.config
    ? normalizeConfig({ ...baseConfig, ...patch.config })
    : baseConfig;

  const updated = await prisma.integrationRule.update({
    where: { id: existing.id },
    data: {
      enabled: typeof patch.enabled === "boolean" ? patch.enabled : existing.enabled,
      statusOverride: typeof patch.statusOverride === "undefined" ? existing.statusOverride : patch.statusOverride,
      config: nextConfig as unknown as Prisma.InputJsonValue,
      lastError: null,
    },
  });

  return serializeGoogleDriveTranscriptRule(updated);
}

export async function runGoogleDriveTranscriptCapture(input: {
  userId: string;
  dryRun?: boolean;
}): Promise<GoogleDriveTranscriptCaptureResult> {
  const rule = await getOrCreateGoogleDriveTranscriptRule(input.userId);
  const config = normalizeConfig(rule.config);
  const checkpoint = normalizeCheckpoint(rule.checkpoint);

  if (!rule.enabled) {
    return {
      ruleId: rule.id,
      enabled: false,
      scannedFiles: 0,
      matchedFiles: 0,
      unmatchedFiles: 0,
      dispatchedEvents: 0,
      failedFiles: 0,
      cursor: checkpoint,
      transcripts: [],
      errors: [],
    };
  }

  const CB_PROVIDER = "google_drive_transcript";
  if (!(await isCircuitClosed(CB_PROVIDER, input.userId))) {
    throw new CircuitOpenError(CB_PROVIDER, input.userId, getCircuitState(CB_PROVIDER, input.userId));
  }

  let circuitSuccess = false;
  try {
    const organizationId = await resolveIntegrationOrganizationId(input.userId);
    if (!organizationId) {
      throw new Error("Missing organizationId for transcript capture");
    }

    let accessToken: string;
    try {
      accessToken = await getValidIntegrationAccessToken({
        userId: input.userId,
        provider: IntegrationProvider.GOOGLE_WORKSPACE,
      });
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

    const files = await withRetries(() =>
      listDriveTranscriptFiles({
        token: accessToken,
        config,
        checkpoint,
      }),
    );

    let matchedFiles = 0;
    let unmatchedFiles = 0;
    let dispatchedEvents = 0;
    let failedFiles = 0;
    let lastObservedAtMs = checkpoint.lastObservedAt ? Date.parse(checkpoint.lastObservedAt) : Number.NaN;
    let lastFileId = checkpoint.lastFileId;
    const transcripts: GoogleDriveTranscriptIngestedRecord[] = [];
    const errors: Array<{ fileId: string; error: string }> = [];

    for (const file of files) {
      try {
        const textContent = await withRetries(() =>
          fetchTranscriptText({
            token: accessToken,
            file,
          }),
        );

        const observedAtIso = file.modifiedTime ?? new Date().toISOString();
        const observedAtMs = Date.parse(observedAtIso);
        if (Number.isFinite(observedAtMs) && (!Number.isFinite(lastObservedAtMs) || observedAtMs > lastObservedAtMs)) {
          lastObservedAtMs = observedAtMs;
          lastFileId = file.id;
        }

        const candidates = await listCandidateMeetings(organizationId, file);
        const bestMatch = candidates
          .map((meeting) => scoreTranscriptMatch({ file, meeting }))
          .filter((candidate): candidate is GoogleDriveTranscriptMatchResult => Boolean(candidate))
          .sort((a, b) => b.score - a.score || b.confidence - a.confidence)[0] ?? null;

        const sourceUrl = file.webViewLink ?? `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`;
        const metadata = {
          fileId: file.id,
          fileName: file.name ?? `Transcript ${file.id}`,
          modifiedTime: observedAtIso,
          ownerEmails: file.owners?.map((owner) => owner.emailAddress).filter(Boolean) ?? [],
          matchedMeetingId: bestMatch?.meetingId ?? null,
          matchConfidence: bestMatch?.confidence ?? null,
          matchReasons: bestMatch?.reasons ?? [],
        };

        if (input.dryRun) {
          transcripts.push({
            fileId: file.id,
            fileName: file.name ?? `Transcript ${file.id}`,
            operation: bestMatch ? "matched" : "stored",
            meetingId: bestMatch?.meetingId ?? null,
            confidence: bestMatch?.confidence ?? null,
            sourceDocumentId: null,
          });
          if (bestMatch) matchedFiles += 1;
          else unmatchedFiles += 1;
          continue;
        }

        const receiptDedupeKey = buildTranscriptReceiptDedupeKey(file);
        await prisma.integrationReceipt.upsert({
          where: { dedupeKey: receiptDedupeKey },
          create: {
            ruleId: rule.id,
            dedupeKey: receiptDedupeKey,
            externalObjectType: "drive_transcript",
            externalObjectId: file.id,
            sourceUrl,
            lastObservedAt: Number.isFinite(observedAtMs) ? new Date(observedAtMs) : new Date(),
            metadata: metadata as Prisma.InputJsonValue,
          },
          update: {
            sourceUrl,
            lastObservedAt: Number.isFinite(observedAtMs) ? new Date(observedAtMs) : new Date(),
            metadata: metadata as Prisma.InputJsonValue,
          },
        });

        if (!bestMatch) {
          unmatchedFiles += 1;
          transcripts.push({
            fileId: file.id,
            fileName: file.name ?? `Transcript ${file.id}`,
            operation: "stored",
            meetingId: null,
            confidence: null,
            sourceDocumentId: null,
          });
          continue;
        }

        const matchedMeeting = await prisma.dealMeeting.update({
          where: { id: bestMatch.meetingId },
          data: {
            googleDriveFileId: file.id,
            googleDriveFileName: file.name ?? `Transcript ${file.id}`,
            googleDriveFileUrl: sourceUrl,
            transcriptMatchedAt: new Date(),
            transcriptMatchConfidence: bestMatch.confidence,
          },
          select: {
            id: true,
            title: true,
            startAt: true,
            endAt: true,
            status: true,
            dealId: true,
            deal: {
              select: {
                id: true,
                name: true,
                hubspotDealId: true,
              },
            },
          },
        });

        await enqueueWorkflowTriggerEvent({
          provider: IntegrationProvider.GOOGLE_WORKSPACE,
          eventType: "google-workspace.meet.transcript_ready",
          externalId: `${matchedMeeting.id}:${file.id}`,
          idempotencyKey: `google-workspace:meet.transcript_ready:${file.id}:${normalizeKey(observedAtIso)}`,
          payload: {
            meetingId: matchedMeeting.id,
            dealId: matchedMeeting.dealId,
            hubspotDealId: matchedMeeting.deal?.hubspotDealId ?? null,
            dealName: matchedMeeting.deal?.name ?? null,
            title: matchedMeeting.title,
            sourceUrl,
            transcript: textContent,
            documents: [
              {
                externalId: file.id,
                documentType: "transcript",
                title: file.name ?? `Transcript ${file.id}`,
                mimeType: file.mimeType ?? "text/plain",
                sourceUrl,
                textContent,
                metadata,
              },
            ],
            meeting: {
              id: matchedMeeting.id,
              title: matchedMeeting.title,
              startAt: matchedMeeting.startAt.toISOString(),
              endAt: matchedMeeting.endAt?.toISOString() ?? null,
              status: matchedMeeting.status,
            },
            driveFile: {
              id: file.id,
              name: file.name ?? `Transcript ${file.id}`,
              modifiedTime: observedAtIso,
              url: sourceUrl,
            },
          },
        });
        const dispatch = await dispatchWorkflowTriggerEvents(10);

        matchedFiles += 1;
        dispatchedEvents += dispatch.startedRuns;
        transcripts.push({
          fileId: file.id,
          fileName: file.name ?? `Transcript ${file.id}`,
          operation: "matched",
          meetingId: matchedMeeting.id,
          confidence: bestMatch.confidence,
          sourceDocumentId: null,
        });
      } catch (error) {
        failedFiles += 1;
        errors.push({
          fileId: file.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const nextCheckpoint: GoogleDriveTranscriptCheckpoint = {
      lastObservedAt: Number.isFinite(lastObservedAtMs)
        ? new Date(lastObservedAtMs).toISOString()
        : checkpoint.lastObservedAt,
      lastFileId,
    };

    await prisma.integrationRule.update({
      where: { id: rule.id },
      data: {
        checkpoint: nextCheckpoint as unknown as Prisma.InputJsonValue,
        lastObservedAt: nextCheckpoint.lastObservedAt ? new Date(nextCheckpoint.lastObservedAt) : rule.lastObservedAt,
        lastRunAt: new Date(),
        lastError: errors.length > 0 ? `${errors.length} transcript capture(s) failed` : null,
      },
    });

    await prisma.integrationConnection.updateMany({
      where: {
        userId: input.userId,
        provider: IntegrationProvider.GOOGLE_WORKSPACE,
      },
      data: {
        status: IntegrationConnectionStatus.CONNECTED,
        lastError: errors.length > 0 ? `${errors.length} transcript capture(s) failed` : null,
        lastSyncedAt: new Date(),
      },
    });

    circuitSuccess = true;
    return {
      ruleId: rule.id,
      enabled: true,
      scannedFiles: files.length,
      matchedFiles,
      unmatchedFiles,
      dispatchedEvents,
      failedFiles,
      cursor: nextCheckpoint,
      transcripts,
      errors,
    };
  } finally {
    if (circuitSuccess) recordSuccess(CB_PROVIDER, input.userId);
    else recordFailure(CB_PROVIDER, input.userId);
  }
}
