import type { Prisma } from "@/generated/prisma/client";
import type { EnrichmentProvider } from "@/lib/analytics/types";
import type { VisitorEnrichmentSignalInput } from "@/lib/analytics/visitor-funnel";

type JsonObject = Record<string, unknown>;

export interface UnifyPullRequest {
  mode: "pull";
  apiKey?: string | null;
  objectName?: string | null;
  updatedAfter?: string | null;
  maxRecords?: number | null;
}

export interface UnifyPullResult {
  signals: VisitorEnrichmentSignalInput[];
  truncated: boolean;
  totalFiltered: number;
  returned: number;
  maxRecords: number;
}

interface NormalizeContext {
  provider: EnrichmentProvider;
  payload: unknown;
}

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeLookupKey(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function getChildValue(source: unknown, segment: string): unknown {
  const record = asObject(source);
  if (!record) return null;

  const target = normalizeLookupKey(segment);
  for (const [key, value] of Object.entries(record)) {
    if (normalizeLookupKey(key) === target) {
      return value;
    }
  }

  return null;
}

function getPathValue(source: unknown, path: string): unknown {
  const segments = path.split(".").map((segment) => segment.trim()).filter(Boolean);
  let current: unknown = source;
  for (const segment of segments) {
    current = getChildValue(current, segment);
    if (current == null) return null;
  }
  return current;
}

function pickValue(source: unknown, candidates: string[]): unknown {
  for (const candidate of candidates) {
    const value = getPathValue(source, candidate);
    if (value == null) continue;
    if (typeof value === "string" && value.trim().length === 0) continue;
    return value;
  }
  return null;
}

function pickString(source: unknown, candidates: string[]): string | null {
  const value = pickValue(source, candidates);
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function pickNumber(source: unknown, candidates: string[]): number | null {
  const value = pickValue(source, candidates);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized = trimmed.endsWith("%")
      ? Number.parseFloat(trimmed.slice(0, -1)) / 100
      : Number.parseFloat(trimmed);
    return Number.isFinite(normalized) ? normalized : null;
  }
  return null;
}

function pickBoolean(source: unknown, candidates: string[]): boolean | null {
  const value = pickValue(source, candidates);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return null;
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = trimOrNull(value);
  return trimmed ? trimmed.toLowerCase() : null;
}

function clampConfidence(value: number | null | undefined, fallback: number): number {
  const candidate = value ?? fallback;
  if (!Number.isFinite(candidate)) return fallback;
  if (candidate > 1) {
    return Math.max(0, Math.min(1, candidate / 100));
  }
  return Math.max(0, Math.min(1, candidate));
}

function domainFromUrl(rawUrl: string | null | undefined): string | null {
  const value = trimOrNull(rawUrl);
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return value.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0]?.toLowerCase() ?? null;
  }
}

function fullNameFromParts(firstName: string | null, lastName: string | null): string | null {
  const combined = [trimOrNull(firstName), trimOrNull(lastName)].filter(Boolean).join(" ");
  return combined.length > 0 ? combined : null;
}

function unwrapRecords(payload: unknown): JsonObject[] {
  const record = asObject(payload);
  if (!record) return [];

  const listCandidates = [
    record,
    pickValue(record, ["signals", "rows", "records", "data", "results", "items", "lead_list"]),
    pickValue(record, ["body.rows", "body.records", "body.data", "body.results", "body.items"]),
  ];

  for (const candidate of listCandidates) {
    const values = asArray(candidate)
      .map((entry) => asObject(entry))
      .filter((entry): entry is JsonObject => entry !== null);
    if (values.length > 0) return values;
  }

  return [record];
}

function buildMetadata(record: JsonObject, extras: JsonObject): Prisma.InputJsonValue {
  return {
    ...extras,
    raw: record as Prisma.InputJsonValue,
  } as Prisma.InputJsonObject;
}

function normalizeRb2bRecords(payload: unknown): VisitorEnrichmentSignalInput[] {
  const records = unwrapRecords(payload);

  return records
    .map((record) => {
      const firstName = pickString(record, ["First Name", "first_name"]);
      const lastName = pickString(record, ["Last Name", "last_name"]);
      const fullName =
        pickString(record, ["Full Name", "full_name", "Name", "name"]) ??
        fullNameFromParts(firstName, lastName);
      const website = pickString(record, ["Website", "website"]);
      const capturedUrl = pickString(record, ["Captured URL", "captured_url", "url", "page_url"]);
      const referrer = pickString(record, ["Referrer", "referrer"]);
      const email =
        normalizeEmail(
          pickString(record, [
            "Business Email",
            "business_email",
            "email",
            "Personal Email",
            "personal_email",
          ]),
        );
      const anonymousId = pickString(record, [
        "Anonymous ID",
        "anonymous_id",
        "Visitor ID",
        "visitor_id",
      ]);
      const occurredAt = pickString(record, ["Seen At", "seen_at", "timestamp"]);
      const confidence = clampConfidence(
        pickNumber(record, ["Confidence", "confidence", "Match Score", "match_score"]),
        0.95,
      );

      return {
        signalKey: pickString(record, ["id", "event_id", "signal_id"]),
        anonymousId,
        email,
        domain:
          trimOrNull(pickString(record, ["Domain", "domain"])) ??
          domainFromUrl(website) ??
          domainFromUrl(capturedUrl),
        fullName,
        companyName: pickString(record, ["Company Name", "company_name"]),
        confidence,
        occurredAt,
        provenance: anonymousId ? "exact" : "inferred",
        metadata: buildMetadata(record, {
          title: pickString(record, ["Title", "title"]),
          website,
          referrer,
          capturedUrl,
          linkedinUrl: pickString(record, ["LinkedIn URL", "linkedin_url"]),
          tags: pickString(record, ["Tags", "tags"]),
          isRepeatVisit: pickBoolean(record, ["is_repeat_visit", "Is Repeat Visit"]),
        }),
        payload: record as Prisma.InputJsonValue,
      } satisfies VisitorEnrichmentSignalInput;
    })
    .filter((signal) => Boolean(signal.email || signal.anonymousId || signal.domain));
}

function normalizeClayRecords(payload: unknown): VisitorEnrichmentSignalInput[] {
  const records = unwrapRecords(payload);

  return records
    .map((record) => {
      const firstName = pickString(record, [
        "first_name",
        "firstName",
        "person.first_name",
        "person.firstName",
        "contact.first_name",
      ]);
      const lastName = pickString(record, [
        "last_name",
        "lastName",
        "person.last_name",
        "person.lastName",
        "contact.last_name",
      ]);
      const fullName =
        pickString(record, [
          "full_name",
          "fullName",
          "name",
          "person.full_name",
          "person.fullName",
          "contact.name",
        ]) ?? fullNameFromParts(firstName, lastName);
      const website = pickString(record, [
        "website",
        "company_website",
        "companyWebsite",
        "company.website",
      ]);
      const capturedUrl = pickString(record, [
        "captured_url",
        "capturedUrl",
        "page_url",
        "pageUrl",
        "landing_page",
        "landingPage",
        "url",
      ]);
      const referrer = pickString(record, ["referrer", "referrer_url", "referrerUrl"]);

      return {
        signalKey: pickString(record, ["signal_key", "signalKey", "record_id", "recordId", "row_id", "rowId", "id"]),
        anonymousId: pickString(record, ["anonymous_id", "anonymousId", "visitor_id", "visitorId"]),
        email: normalizeEmail(
          pickString(record, [
            "email",
            "business_email",
            "businessEmail",
            "work_email",
            "workEmail",
            "person.email",
            "contact.email",
          ]),
        ),
        domain:
          trimOrNull(
            pickString(record, [
              "domain",
              "company_domain",
              "companyDomain",
              "website_domain",
              "websiteDomain",
              "company.domain",
            ]),
          ) ??
          domainFromUrl(website) ??
          domainFromUrl(capturedUrl),
        fullName,
        companyName: pickString(record, [
          "company_name",
          "companyName",
          "company",
          "account_name",
          "accountName",
          "organization",
        ]),
        confidence: clampConfidence(
          pickNumber(record, ["confidence", "match_score", "matchScore", "score"]),
          0.9,
        ),
        occurredAt: pickString(record, [
          "occurred_at",
          "occurredAt",
          "seen_at",
          "seenAt",
          "timestamp",
          "last_seen_at",
          "lastSeenAt",
          "updated_at",
          "updatedAt",
        ]),
        provenance: pickString(record, ["provenance"]) === "backfilled" ? "backfilled" : "inferred",
        metadata: buildMetadata(record, {
          firstName,
          lastName,
          title: pickString(record, ["title", "job_title", "jobTitle"]),
          website,
          referrer,
          capturedUrl,
          linkedinUrl: pickString(record, ["linkedin_url", "linkedinUrl", "person.linkedin_url"]),
        }),
        payload: record as Prisma.InputJsonValue,
      } satisfies VisitorEnrichmentSignalInput;
    })
    .filter((signal) => Boolean(signal.email || signal.anonymousId || signal.domain));
}

function normalizeUnifyRecords(payload: unknown): VisitorEnrichmentSignalInput[] {
  const records = unwrapRecords(payload);

  return records
    .map((record) => {
      const attributes = asObject(record.attributes) ?? record;
      const firstName = pickString(attributes, ["first_name", "firstName"]);
      const lastName = pickString(attributes, ["last_name", "lastName"]);
      const fullName =
        pickString(attributes, ["full_name", "fullName", "name"]) ??
        fullNameFromParts(firstName, lastName);
      const website = pickString(attributes, ["website", "company_website", "companyWebsite"]);

      return {
        signalKey:
          pickString(record, ["id"]) ??
          pickString(attributes, ["record_id", "recordId", "signal_id", "signalId"]),
        anonymousId: pickString(attributes, [
          "anonymous_id",
          "anonymousId",
          "visitor_id",
          "visitorId",
          "device_id",
          "deviceId",
        ]),
        email: normalizeEmail(
          pickString(attributes, [
            "email",
            "work_email",
            "workEmail",
            "business_email",
            "businessEmail",
          ]),
        ),
        domain:
          trimOrNull(
            pickString(attributes, [
              "domain",
              "company_domain",
              "companyDomain",
              "website_domain",
              "websiteDomain",
            ]),
          ) ?? domainFromUrl(website),
        fullName,
        companyName: pickString(attributes, [
          "company_name",
          "companyName",
          "account_name",
          "accountName",
          "organization_name",
          "organizationName",
        ]),
        confidence: clampConfidence(
          pickNumber(attributes, ["confidence", "confidence_score", "confidenceScore", "score"]),
          0.9,
        ),
        occurredAt:
          pickString(attributes, ["seen_at", "seenAt", "last_seen_at", "lastSeenAt"]) ??
          pickString(record, ["updated_at", "created_at"]),
        provenance: pickString(attributes, ["anonymous_id", "anonymousId"]) ? "exact" : "inferred",
        metadata: buildMetadata(record, {
          object: pickString(record, ["object"]),
          recordId: pickString(record, ["id"]),
          createdAt: pickString(record, ["created_at"]),
          updatedAt: pickString(record, ["updated_at"]),
          website,
          linkedinUrl: pickString(attributes, ["linkedin_url", "linkedinUrl"]),
          title: pickString(attributes, ["title", "job_title", "jobTitle"]),
        }),
        payload: record as Prisma.InputJsonValue,
      } satisfies VisitorEnrichmentSignalInput;
    })
    .filter((signal) => Boolean(signal.email || signal.anonymousId || signal.domain));
}

export function isUnifyPullRequest(value: unknown): value is UnifyPullRequest {
  const record = asObject(value);
  return Boolean(record && pickString(record, ["mode"])?.toLowerCase() === "pull");
}

export function normalizeNativeProviderSignals(
  provider: EnrichmentProvider,
  payload: unknown,
): VisitorEnrichmentSignalInput[] {
  switch (provider) {
    case "rb2b":
      return normalizeRb2bRecords(payload);
    case "clay":
      return normalizeClayRecords(payload);
    case "unify":
      return normalizeUnifyRecords(payload);
    default:
      return [];
  }
}

function safeOptionalDate(value: string | null | undefined): Date | null {
  const trimmed = trimOrNull(value);
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function pullUnifySignalsFromApi(input: {
  apiKey: string;
  objectName: string;
  updatedAfter?: string | null;
  maxRecords?: number | null;
  fetchImpl?: typeof fetch;
}): Promise<UnifyPullResult> {
  const apiKey = trimOrNull(input.apiKey);
  const objectName = trimOrNull(input.objectName);
  if (!apiKey || !objectName) {
    throw new Error("Unify pull requires apiKey and objectName");
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `https://api.unifygtm.com/data/v1/objects/${encodeURIComponent(objectName)}/records`,
    {
      headers: {
        "x-api-key": apiKey,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Unify pull failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { data?: unknown[] };
  const signals = normalizeUnifyRecords(payload);
  const updatedAfter = safeOptionalDate(input.updatedAfter ?? null);
  const maxRecords = Math.max(1, Math.min(5000, input.maxRecords ?? 500));

  const filteredSignals = signals
    .filter((signal) => {
      if (!updatedAfter) return true;
      const occurredAt = safeOptionalDate(signal.occurredAt ?? null);
      return occurredAt ? occurredAt >= updatedAfter : true;
    });
  const returnedSignals = filteredSignals.slice(0, maxRecords);

  return {
    signals: returnedSignals,
    truncated: filteredSignals.length > returnedSignals.length,
    totalFiltered: filteredSignals.length,
    returned: returnedSignals.length,
    maxRecords,
  };
}

export function summarizeProviderPayload(input: NormalizeContext): string {
  if (isUnifyPullRequest(input.payload)) return "unify-pull";
  const records = normalizeNativeProviderSignals(input.provider, input.payload);
  return `${input.provider}:${records.length}`;
}
