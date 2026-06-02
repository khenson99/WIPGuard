import { IntegrationHttpError, fetchJsonWithResilience } from "@/lib/integrations/http-client";

const GMAIL_API_BASE_URL = "https://gmail.googleapis.com/gmail/v1";
const CALENDAR_API_BASE_URL = "https://www.googleapis.com/calendar/v3";
const DRIVE_API_BASE_URL = "https://www.googleapis.com/drive/v3";

const DEFAULT_MAX_EMAIL_THREADS = 100;
const DEFAULT_MAX_CALENDAR_EVENTS = 250;
const DEFAULT_MAX_DOCUMENTS = 100;

export interface GoogleWorkspaceCalendarEventRecord {
  eventId: string;
  calendarId: string;
  summary: string | null;
  status: string | null;
  htmlLink: string | null;
  creatorEmail: string | null;
  organizerEmail: string | null;
  attendeeCount: number;
  startedAt: string | null;
  endedAt: string | null;
  updatedAt: string | null;
}

export interface GoogleWorkspaceEmailThreadRecord {
  threadId: string;
  messageId: string;
  subject: string | null;
  from: string | null;
  to: string | null;
  snippet: string | null;
  labelIds: string[];
  occurredAt: string | null;
}

export interface GoogleWorkspaceDocumentRecord {
  fileId: string;
  name: string | null;
  mimeType: string | null;
  webViewLink: string | null;
  ownerEmail: string | null;
  modifiedAt: string | null;
}

export interface GoogleWorkspaceData {
  profile: {
    emailAddress: string | null;
    messagesTotal: number | null;
    threadsTotal: number | null;
  };
  calendarEvents: GoogleWorkspaceCalendarEventRecord[];
  emailThreads: GoogleWorkspaceEmailThreadRecord[];
  documents: GoogleWorkspaceDocumentRecord[];
  _meta: {
    fetchedAt: string;
    calendarEventCount: number;
    emailThreadCount: number;
    documentCount: number;
    calendarIds: string[];
    truncated: boolean;
    truncatedResources: string[];
    skippedResources: string[];
    skippedEmailMessageDetails: number;
    source: "live";
  };
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function millisToIsoOrNull(value: unknown): string | null {
  const raw = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(raw)) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function dateParam(value: Date): string {
  return value.toISOString().slice(0, 10).replaceAll("-", "/");
}

function exclusiveDateParamAfter(value: Date): string {
  const exclusive = new Date(value);
  exclusive.setUTCDate(exclusive.getUTCDate() + 1);
  return dateParam(exclusive);
}

function normalizePositiveInteger(value: number | null | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

async function fetchGoogleJson<T>(accessToken: string, url: URL): Promise<T> {
  return fetchJsonWithResilience<T>({
    url: url.toString(),
    init: {
      method: "GET",
      headers: authHeaders(accessToken),
      cache: "no-store",
    },
    timeoutMs: 12_000,
    maxAttempts: 3,
  });
}

function headerValue(headers: unknown, name: string): string | null {
  if (!Array.isArray(headers)) return null;
  const target = name.toLowerCase();
  for (const item of headers) {
    const header = asRecord(item);
    if (asString(header.name)?.toLowerCase() === target) {
      return asString(header.value);
    }
  }
  return null;
}

async function fetchProfile(accessToken: string): Promise<GoogleWorkspaceData["profile"]> {
  const url = new URL(`${GMAIL_API_BASE_URL}/users/me/profile`);
  const payload = asRecord(await fetchGoogleJson<unknown>(accessToken, url));
  return {
    emailAddress: asString(payload.emailAddress),
    messagesTotal: asNumber(payload.messagesTotal),
    threadsTotal: asNumber(payload.threadsTotal),
  };
}

async function fetchCalendarEvents(input: {
  accessToken: string;
  fromDate: Date;
  toDate: Date;
  calendarIds: string[];
  maxEvents: number;
}): Promise<{
  events: GoogleWorkspaceCalendarEventRecord[];
  truncated: boolean;
}> {
  const events: GoogleWorkspaceCalendarEventRecord[] = [];
  let truncated = false;

  for (const calendarId of input.calendarIds) {
    if (events.length >= input.maxEvents) {
      truncated = true;
      break;
    }
    let pageToken: string | null = null;

    while (events.length < input.maxEvents) {
      const url = new URL(`${CALENDAR_API_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events`);
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");
      url.searchParams.set("maxResults", String(Math.min(250, input.maxEvents - events.length)));
      url.searchParams.set("timeMin", input.fromDate.toISOString());
      url.searchParams.set("timeMax", input.toDate.toISOString());
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const payload = asRecord(await fetchGoogleJson<unknown>(input.accessToken, url));
      const rows = Array.isArray(payload.items) ? payload.items : [];
      for (const row of rows) {
        if (events.length >= input.maxEvents) {
          truncated = true;
          break;
        }
        const event = asRecord(row);
        const eventId = asString(event.id);
        if (!eventId) continue;
        const start = asRecord(event.start);
        const end = asRecord(event.end);
        const creator = asRecord(event.creator);
        const organizer = asRecord(event.organizer);
        const attendees = Array.isArray(event.attendees) ? event.attendees : [];
        events.push({
          eventId,
          calendarId,
          summary: asString(event.summary),
          status: asString(event.status),
          htmlLink: asString(event.htmlLink),
          creatorEmail: asString(creator.email),
          organizerEmail: asString(organizer.email),
          attendeeCount: attendees.length,
          startedAt: isoOrNull(start.dateTime ?? start.date),
          endedAt: isoOrNull(end.dateTime ?? end.date),
          updatedAt: isoOrNull(event.updated),
        });
      }

      pageToken = asString(payload.nextPageToken);
      if (!pageToken || rows.length === 0) break;
    }

    if (pageToken) truncated = true;
  }

  return { events, truncated };
}

async function fetchEmailThreads(input: {
  accessToken: string;
  fromDate: Date;
  toDate: Date;
  maxThreads: number;
}): Promise<{
  threads: GoogleWorkspaceEmailThreadRecord[];
  truncated: boolean;
  skippedMessageDetails: number;
}> {
  const threads: GoogleWorkspaceEmailThreadRecord[] = [];
  const seenThreadIds = new Set<string>();
  let pageToken: string | null = null;
  let truncated = false;
  let skippedMessageDetails = 0;

  while (threads.length < input.maxThreads) {
    const listUrl = new URL(`${GMAIL_API_BASE_URL}/users/me/messages`);
    listUrl.searchParams.set("maxResults", String(Math.min(500, input.maxThreads - threads.length)));
    listUrl.searchParams.set("q", `after:${dateParam(input.fromDate)} before:${exclusiveDateParamAfter(input.toDate)}`);
    if (pageToken) listUrl.searchParams.set("pageToken", pageToken);

    const listPayload = asRecord(await fetchGoogleJson<unknown>(input.accessToken, listUrl));
    const rows = Array.isArray(listPayload.messages) ? listPayload.messages : [];

    for (const row of rows) {
      if (threads.length >= input.maxThreads) {
        truncated = true;
        break;
      }
      const listed = asRecord(row);
      const messageId = asString(listed.id);
      const threadId = asString(listed.threadId);
      if (!messageId || !threadId || seenThreadIds.has(threadId)) continue;

      const messageUrl = new URL(`${GMAIL_API_BASE_URL}/users/me/messages/${encodeURIComponent(messageId)}`);
      messageUrl.searchParams.set("format", "metadata");
      messageUrl.searchParams.set("metadataHeaders", "Subject");
      messageUrl.searchParams.append("metadataHeaders", "From");
      messageUrl.searchParams.append("metadataHeaders", "To");
      let message: Record<string, unknown>;
      try {
        message = asRecord(await fetchGoogleJson<unknown>(input.accessToken, messageUrl));
      } catch (error) {
        if (error instanceof IntegrationHttpError && error.status === 404) {
          skippedMessageDetails += 1;
          seenThreadIds.add(threadId);
          continue;
        }
        throw error;
      }
      const payload = asRecord(message.payload);
      const occurredAt = millisToIsoOrNull(message.internalDate);

      seenThreadIds.add(threadId);
      threads.push({
        threadId,
        messageId,
        subject: headerValue(payload.headers, "Subject"),
        from: headerValue(payload.headers, "From"),
        to: headerValue(payload.headers, "To"),
        snippet: asString(message.snippet),
        labelIds: asStringArray(message.labelIds),
        occurredAt,
      });
    }

    pageToken = asString(listPayload.nextPageToken);
    if (!pageToken || rows.length === 0) break;
  }

  if (pageToken) truncated = true;

  return { threads, truncated, skippedMessageDetails };
}

async function fetchDocuments(input: {
  accessToken: string;
  fromDate: Date;
  toDate: Date;
  maxDocuments: number;
}): Promise<{
  documents: GoogleWorkspaceDocumentRecord[];
  truncated: boolean;
}> {
  const documents: GoogleWorkspaceDocumentRecord[] = [];
  let pageToken: string | null = null;
  let truncated = false;

  while (documents.length < input.maxDocuments) {
    const url = new URL(`${DRIVE_API_BASE_URL}/files`);
    url.searchParams.set("pageSize", String(Math.min(1000, input.maxDocuments - documents.length)));
    url.searchParams.set("orderBy", "modifiedTime desc");
    url.searchParams.set(
      "fields",
      "nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime,owners(emailAddress))",
    );
    url.searchParams.set(
      "q",
      `modifiedTime >= '${input.fromDate.toISOString()}' and modifiedTime <= '${input.toDate.toISOString()}' and trashed = false`,
    );
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const payload = asRecord(await fetchGoogleJson<unknown>(input.accessToken, url));
    const rows = Array.isArray(payload.files) ? payload.files : [];

    for (const row of rows) {
      if (documents.length >= input.maxDocuments) {
        truncated = true;
        break;
      }
      const file = asRecord(row);
      const fileId = asString(file.id);
      if (!fileId) continue;
      const owners = Array.isArray(file.owners) ? file.owners.map(asRecord) : [];
      documents.push({
        fileId,
        name: asString(file.name),
        mimeType: asString(file.mimeType),
        webViewLink: asString(file.webViewLink),
        ownerEmail: asString(owners[0]?.emailAddress),
        modifiedAt: isoOrNull(file.modifiedTime),
      });
    }

    pageToken = asString(payload.nextPageToken);
    if (!pageToken || rows.length === 0) break;
  }

  if (pageToken) truncated = true;

  return { documents, truncated };
}

export async function fetchGoogleWorkspaceData(input: {
  accessToken: string;
  fromDate: Date;
  toDate: Date;
  calendarIds?: string[];
  maxEmailThreads?: number;
  maxCalendarEvents?: number;
  maxDocuments?: number;
}): Promise<GoogleWorkspaceData> {
  const accessToken = input.accessToken.trim();
  if (!accessToken) {
    throw new Error("Missing Google Workspace access token");
  }

  const calendarIds = (input.calendarIds && input.calendarIds.length > 0
    ? input.calendarIds
    : ["primary"]
  ).map((calendarId) => calendarId.trim()).filter(Boolean);

  const [profile, calendarResult, emailResult, documentResult] = await Promise.all([
    fetchProfile(accessToken),
    fetchCalendarEvents({
      accessToken,
      fromDate: input.fromDate,
      toDate: input.toDate,
      calendarIds,
      maxEvents: normalizePositiveInteger(input.maxCalendarEvents, DEFAULT_MAX_CALENDAR_EVENTS),
    }),
    fetchEmailThreads({
      accessToken,
      fromDate: input.fromDate,
      toDate: input.toDate,
      maxThreads: normalizePositiveInteger(input.maxEmailThreads, DEFAULT_MAX_EMAIL_THREADS),
    }),
    fetchDocuments({
      accessToken,
      fromDate: input.fromDate,
      toDate: input.toDate,
      maxDocuments: normalizePositiveInteger(input.maxDocuments, DEFAULT_MAX_DOCUMENTS),
    }),
  ]);
  const calendarEvents = calendarResult.events;
  const emailThreads = emailResult.threads;
  const documents = documentResult.documents;
  const truncatedResources = [
    ...(calendarResult.truncated ? ["calendarEvents"] : []),
    ...(emailResult.truncated ? ["emailThreads"] : []),
    ...(documentResult.truncated ? ["documents"] : []),
  ];
  const skippedResources = [
    ...(emailResult.skippedMessageDetails > 0 ? ["emailMessageDetails"] : []),
  ];

  return {
    profile,
    calendarEvents,
    emailThreads,
    documents,
    _meta: {
      fetchedAt: new Date().toISOString(),
      calendarEventCount: calendarEvents.length,
      emailThreadCount: emailThreads.length,
      documentCount: documents.length,
      calendarIds,
      truncated: truncatedResources.length > 0,
      truncatedResources,
      skippedResources,
      skippedEmailMessageDetails: emailResult.skippedMessageDetails,
      source: "live",
    },
  };
}
