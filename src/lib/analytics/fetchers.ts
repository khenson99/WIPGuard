// ─── Data Fetchers for Analytics Dashboard ────────────────
// Server-side functions that pull live data from HubSpot, Stripe, Mercury
// Used by API routes and server components

import type {
  HubSpotData,
  HubSpotContactRecord,
  ChannelGroup,
  SalesPerformanceDealAuditRow,
  SalesPerformancePack,
  SalesPerformanceRepMonthChannelRow,
  SalesPerformanceRepMonthRow,
  StripeData,
  MercuryData,
  MercuryTransactionData,
  ExpenseCategory,
  MercuryExpenseMapping,
  AnalyticsTimestamp,
  DealStage,
} from "./types";
import { safeJson } from "@/lib/analytics/fetcher-utils";

function makeMeta(source: "live" | "cached" = "live"): AnalyticsTimestamp {
  const now = new Date();
  return {
    fetchedAt: now.toISOString(),
    nextRefresh: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    source,
  };
}

// ═══════════════════════════════════════════════════════════
// HUBSPOT FETCHER
// ═══════════════════════════════════════════════════════════

const HUBSPOT_MAIN_PIPELINE_ID = "default";
const HUBSPOT_SUBSCRIPTION_PIPELINE_ID = "1390107368";

const HUBSPOT_MAIN_PIPELINE_FALLBACK_STAGES = [
  { id: "appointmentscheduled", label: "Prospect", displayOrder: 0 },
  { id: "1499838171", label: "Approached", displayOrder: 1 },
  { id: "qualifiedtobuy", label: "Lead", displayOrder: 2 },
  { id: "presentationscheduled", label: "Demo Scheduled", displayOrder: 3 },
  { id: "1955958510", label: "No-Show/Reschedule", displayOrder: 4 },
  { id: "decisionmakerboughtin", label: "Demo Follow-Up", displayOrder: 5 },
  { id: "1955580622", label: "Budgetary Quote Sent", displayOrder: 6 },
  { id: "1559099077", label: "Payment Link Sent", displayOrder: 7 },
  { id: "1499827945", label: "Free Trial", displayOrder: 8 },
  { id: "1731122907", label: "Freemium", displayOrder: 9 },
  { id: "closedwon", label: "Closed Won", displayOrder: 10 },
  { id: "contractsent", label: "Ping Later", displayOrder: 11 },
  { id: "closedlost", label: "Closed Lost", displayOrder: 12 },
  { id: "1499784890", label: "Churn", displayOrder: 13 },
  { id: "1499784891", label: "Unlikely", displayOrder: 14 },
  { id: "1499827944", label: "On Hold", displayOrder: 15 },
  { id: "1718686448", label: "Internal+Friends and Family", displayOrder: 16 },
  { id: "2025131723", label: "Interested in a pilot", displayOrder: 17 },
] as const;

const HUBSPOT_STAGE_LABEL_CANONICALIZATION: Record<string, string> = {
  "prospect": "Prospect",
  "approached": "Approached",
  "lead": "Lead",
  "demo scheduled": "Demo Scheduled",
  "no-show/reschedule demo": "No-Show/Reschedule",
  "no-show/reschedule": "No-Show/Reschedule",
  "demo follow-up": "Demo Follow-Up",
  "budgetary quote sent": "Budgetary Quote Sent",
  "payment link sent": "Payment Link Sent",
  "free trial": "Free Trial",
  "freemium": "Freemium",
  "closed won": "Closed Won",
  "ping later": "Ping Later",
  "closed lost": "Closed Lost",
  "churn": "Churn",
  "unlikely": "Unlikely",
  "on hold": "On Hold",
  "internal+friends and family": "Internal+Friends and Family",
  "interested in a pilot": "Interested in a pilot",
};

const HUBSPOT_STAGE_FALLBACK_LABEL_BY_ID = Object.fromEntries(
  HUBSPOT_MAIN_PIPELINE_FALLBACK_STAGES.map((stage) => [stage.id, stage.label]),
) as Record<string, string>;

const HUBSPOT_MEETING_PROPERTIES = [
  "hs_object_id",
  "hs_timestamp",
  "hs_meeting_title",
  "hs_meeting_body",
  "hs_meeting_outcome",
  "hs_createdate",
  "hs_lastmodifieddate",
  "hubspot_owner_id",
].join(",");

const HUBSPOT_COMPANY_PROPERTIES = [
  "hs_object_id",
  "name",
  "domain",
  "industry",
  "lifecyclestage",
  "numberofemployees",
  "annualrevenue",
  "createdate",
  "hs_lastmodifieddate",
  "hubspot_owner_id",
].join(",");

const HUBSPOT_TICKET_PROPERTIES = [
  "hs_object_id",
  "subject",
  "content",
  "hs_pipeline",
  "hs_pipeline_stage",
  "hs_ticket_priority",
  "hs_ticket_category",
  "source_type",
  "createdate",
  "hs_lastmodifieddate",
  "closed_date",
  "hubspot_owner_id",
].join(",");

type HubSpotPipelineStage = {
  id: string;
  label: string;
  archived: boolean;
  displayOrder: number;
};

type HubSpotPipeline = {
  id: string;
  label: string;
  archived: boolean;
  stages: HubSpotPipelineStage[];
};

type HubSpotPipelinesResponse = {
  results?: Array<{
    id?: string;
    label?: string;
    archived?: boolean;
    stages?: Array<{
      id?: string;
      label?: string;
      archived?: boolean;
      displayOrder?: number;
    }>;
  }>;
};

type HubSpotDealObject = {
  id?: string;
  properties?: Record<string, string>;
  propertiesWithHistory?: Record<string, Array<{ value?: string; timestamp?: string | number }>>;
  associations?: HubSpotAssociationMap;
};

type HubSpotDealsListResponse = {
  results?: HubSpotDealObject[];
  paging?: { next?: { after?: string } };
};

type HubSpotAssociationMap = Record<string, { results?: Array<{ id?: string | number; toObjectId?: string | number }> }>;

type HubSpotMeetingObject = {
  id?: string;
  properties?: Record<string, string>;
  associations?: HubSpotAssociationMap;
};

type HubSpotMeetingsListResponse = {
  results?: HubSpotMeetingObject[];
  paging?: { next?: { after?: string } };
};

type HubSpotMeetingsFetchResult = {
  data: HubSpotData["meetings"];
  truncated: boolean;
  available: boolean;
  error: string | null;
  pagesFetched: number;
};

type HubSpotCompanyObject = {
  id?: string;
  properties?: Record<string, string>;
};

type HubSpotCompaniesListResponse = {
  results?: HubSpotCompanyObject[];
  paging?: { next?: { after?: string } };
};

type HubSpotCompaniesFetchResult = {
  data: HubSpotData["companies"];
  truncated: boolean;
  available: boolean;
  error: string | null;
  pagesFetched: number;
};

type HubSpotTicketObject = {
  id?: string;
  properties?: Record<string, string>;
  associations?: HubSpotAssociationMap;
};

type HubSpotTicketsListResponse = {
  results?: HubSpotTicketObject[];
  paging?: { next?: { after?: string } };
};

type HubSpotTicketsFetchResult = {
  data: HubSpotData["tickets"];
  truncated: boolean;
  available: boolean;
  error: string | null;
  pagesFetched: number;
};

type HubSpotFormObject = {
  guid?: string;
  id?: string;
  name?: string;
  formType?: string;
};

type HubSpotFormSubmissionObject = {
  submittedAt?: string | number;
  pageUrl?: string;
  values?: Array<{ name?: string; value?: string }>;
};

type HubSpotFormsListResponse = {
  results?: HubSpotFormObject[];
  forms?: HubSpotFormObject[];
  hasMore?: boolean;
  offset?: string | number;
  paging?: { next?: { after?: string } };
};

type HubSpotFormSubmissionsResponse = {
  results?: HubSpotFormSubmissionObject[];
  submissions?: HubSpotFormSubmissionObject[];
  after?: string | number;
  paging?: { next?: { after?: string } };
};

type HubSpotCollectedFormsFetchResult = {
  data: HubSpotData["collectedForms"];
  truncated: boolean;
  truncatedResources: string[];
  available: boolean;
  error: string | null;
  pagesFetched: {
    forms: number;
    submissions: number;
  };
};

type HubSpotStageHistoryEntry = { value?: string; timestamp?: string | number };

type HubSpotStageEvent = {
  dealId: string;
  occurredAt: number;
  fromStage: string | null;
  toStage: string;
  ownerId: string | null;
  amount: number;
  source: string;
  dealName: string;
};

function normalizeHubSpotStageLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return trimmed;
  const canonical = HUBSPOT_STAGE_LABEL_CANONICALIZATION[trimmed.toLowerCase()];
  return canonical ?? trimmed;
}

function classifyHubSpotCollectedForm(
  formName: string,
): NonNullable<HubSpotData["collectedForms"]>["formSubmissions"][number]["funnelCategory"] {
  const normalized = formName.trim().toLowerCase();
  if (
    normalized.includes("kanban") ||
    normalized.includes("lead magnet") ||
    normalized.includes("coda")
  ) {
    return "lead_magnet";
  }
  if (
    normalized.includes("get in touch") ||
    normalized.includes("contact") ||
    normalized.includes("demo")
  ) {
    return "contact_request";
  }
  return "other";
}

function hubSpotSubmittedAt(value: string | number | undefined): Date | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function extractHubSpotSubmissionEmail(values: HubSpotFormSubmissionObject["values"]): string | null {
  const email = values?.find((value) => String(value.name ?? "").toLowerCase() === "email")?.value?.trim();
  return email ? email.toLowerCase() : null;
}

async function fetchHubSpotCollectedForms(input: {
  baseUrl: string;
  headers: Record<string, string>;
  from: Date | null;
  to: Date | null;
}): Promise<HubSpotCollectedFormsFetchResult> {
  const emptyResult = (error: string | null = null): HubSpotCollectedFormsFetchResult => ({
    data: undefined,
    truncated: false,
    truncatedResources: [],
    available: error === null,
    error,
    pagesFetched: {
      forms: 0,
      submissions: 0,
    },
  });

  try {
    const forms: HubSpotFormObject[] = [];
    let formOffset: string | null = "0";
    let formAfter: string | null = null;
    let formsTruncated = false;
    let submissionPagesTruncated = false;
    let formPagesFetched = 0;
    let submissionPagesFetched = 0;

    for (let page = 0; page < 100; page += 1) {
      const formsUrl = new URL(`${input.baseUrl}/forms/v2/forms`);
      formsUrl.searchParams.set("limit", "100");
      formsUrl.searchParams.set("formTypes", "ALL");
      if (formAfter) {
        formsUrl.searchParams.set("after", formAfter);
      } else if (formOffset) {
        formsUrl.searchParams.set("offset", formOffset);
      }

      const formsRes = await fetch(formsUrl.toString(), {
        headers: input.headers,
        cache: "no-store",
      });
      if (!formsRes.ok) {
        return emptyResult(`HubSpot collected forms request failed (${formsRes.status})`);
      }
      formPagesFetched += 1;

      const rawForms = (await formsRes.json().catch(() => [])) as unknown;
      const formsPage = (Array.isArray(rawForms)
        ? rawForms
        : Array.isArray((rawForms as HubSpotFormsListResponse).results)
          ? (rawForms as HubSpotFormsListResponse).results
          : Array.isArray((rawForms as HubSpotFormsListResponse).forms)
            ? (rawForms as HubSpotFormsListResponse).forms
            : []) as HubSpotFormObject[];
      forms.push(...formsPage);

      if (Array.isArray(rawForms)) break;

      const payload = rawForms as HubSpotFormsListResponse;
      const nextAfter = payload.paging?.next?.after?.trim() || null;
      const nextOffset =
        payload.hasMore && payload.offset !== undefined && payload.offset !== null
          ? String(payload.offset)
          : null;
      const hasNextFormPage = Boolean(nextAfter || (nextOffset && nextOffset !== formOffset));

      if (page === 99 && hasNextFormPage) {
        formsTruncated = true;
        break;
      }

      if (nextAfter) {
        formAfter = nextAfter;
        formOffset = null;
      } else if (nextOffset && nextOffset !== formOffset) {
        formOffset = nextOffset;
        formAfter = null;
      } else {
        break;
      }

      if (formsPage.length === 0) break;
    }

    const relevantForms = forms
      .map((form) => ({
        formGuid: String(form.guid ?? form.id ?? "").trim(),
        formName: String(form.name ?? "Unknown").trim() || "Unknown",
      }))
      .filter((form) => form.formGuid.length > 0)
      .filter((form) => classifyHubSpotCollectedForm(form.formName) !== "other");

    const submissions: NonNullable<HubSpotData["collectedForms"]>["submissions"] = [];
    const formCountMap = new Map<string, { formName: string; count: number; funnelCategory: ReturnType<typeof classifyHubSpotCollectedForm> }>();

    for (const form of relevantForms) {
      let after: string | null = null;

      for (let page = 0; page < 100; page += 1) {
        const submissionsUrl = new URL(
          `${input.baseUrl}/form-integrations/v1/submissions/forms/${encodeURIComponent(form.formGuid)}`,
        );
        submissionsUrl.searchParams.set("limit", "50");
        if (after) submissionsUrl.searchParams.set("after", after);

        const response = await fetch(submissionsUrl.toString(), {
          headers: input.headers,
          cache: "no-store",
        });
        if (!response.ok) {
          return emptyResult(`HubSpot collected form submissions request failed (${response.status})`);
        }
        submissionPagesFetched += 1;
        const payload = (await response.json().catch(() => ({}))) as HubSpotFormSubmissionsResponse;
        const category = classifyHubSpotCollectedForm(form.formName);
        const pageSubmissions = Array.isArray(payload.results)
          ? payload.results
          : Array.isArray(payload.submissions)
            ? payload.submissions
            : [];

        for (const submission of pageSubmissions) {
          const submittedAt = hubSpotSubmittedAt(submission.submittedAt);
          if (!submittedAt) continue;
          if (input.from && submittedAt < input.from) continue;
          if (input.to && submittedAt > input.to) continue;

          const email = extractHubSpotSubmissionEmail(submission.values);
          const id = `${form.formGuid}:${submittedAt.getTime()}:${email ?? stableFormSubmissionKey(submission)}`;
          submissions.push({
            id,
            formGuid: form.formGuid,
            formName: form.formName,
            funnelCategory: category,
            email,
            submittedAt: submittedAt.toISOString(),
            pageUrl: submission.pageUrl?.trim() || null,
          });

          const existing = formCountMap.get(form.formGuid) ?? {
            formName: form.formName,
            count: 0,
            funnelCategory: category,
          };
          existing.count += 1;
          formCountMap.set(form.formGuid, existing);
        }

        const nextAfter =
          payload.paging?.next?.after?.trim() ||
          (payload.after !== undefined && payload.after !== null ? String(payload.after) : null);
        if (page === 99 && nextAfter && nextAfter !== after) {
          submissionPagesTruncated = true;
          break;
        }
        if (!nextAfter || nextAfter === after || pageSubmissions.length === 0) break;
        after = nextAfter;
      }
    }

    const formSubmissions = [...formCountMap.values()].sort((a, b) => b.count - a.count || a.formName.localeCompare(b.formName));
    const totalFormSubmissions = submissions.length;
    const leadMagnetSubmissions = submissions.filter((submission) => submission.funnelCategory === "lead_magnet").length;
    const contactRequestSubmissions = submissions.filter((submission) => submission.funnelCategory === "contact_request").length;

    const truncatedResources = [
      ...(formsTruncated ? ["collectedForms"] : []),
      ...(submissionPagesTruncated ? ["collectedFormSubmissions"] : []),
    ];

    return {
      data: {
        formSubmissions,
        submissions,
        totalFormSubmissions,
        leadMagnetSubmissions,
        contactRequestSubmissions,
      },
      truncated: truncatedResources.length > 0,
      truncatedResources,
      available: true,
      error: null,
      pagesFetched: {
        forms: formPagesFetched,
        submissions: submissionPagesFetched,
      },
    };
  } catch (error) {
    return emptyResult(error instanceof Error ? error.message : String(error));
  }
}

function stableFormSubmissionKey(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url").slice(0, 24);
}

function buildFallbackPipelines(): HubSpotPipeline[] {
  return [
    {
      id: HUBSPOT_MAIN_PIPELINE_ID,
      label: "Deals pipeline",
      archived: false,
      stages: HUBSPOT_MAIN_PIPELINE_FALLBACK_STAGES.map((stage) => ({
        id: stage.id,
        label: stage.label,
        archived: false,
        displayOrder: stage.displayOrder,
      })),
    },
  ];
}

function isMainHubSpotPipeline(pipelineId: string | null | undefined): boolean {
  const normalized = pipelineId?.trim();
  return !normalized || normalized === HUBSPOT_MAIN_PIPELINE_ID;
}

function isHubSpotSubscriptionPipeline(pipelineId: string | null | undefined): boolean {
  return pipelineId?.trim() === HUBSPOT_SUBSCRIPTION_PIPELINE_ID;
}

function compareHubSpotDealsByRecency(
  a: { dealId: string; updatedAt: string | null; createdAt: string | null },
  b: { dealId: string; updatedAt: string | null; createdAt: string | null },
): number {
  const updatedDiff = (Date.parse(b.updatedAt || "") || 0) - (Date.parse(a.updatedAt || "") || 0);
  if (updatedDiff !== 0) return updatedDiff;
  const createdDiff = (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0);
  if (createdDiff !== 0) return createdDiff;
  return a.dealId.localeCompare(b.dealId);
}

function resolveHubSpotStageLabel(stageId: string, stageLabelById: Map<string, string>): string {
  return stageLabelById.get(stageId) ?? HUBSPOT_STAGE_FALLBACK_LABEL_BY_ID[stageId] ?? normalizeHubSpotStageLabel(stageId);
}

function buildOrderedHubSpotStages(
  stageAgg: Record<string, { count: number; value: number }>,
  pipeline: HubSpotPipeline | null,
): DealStage[] {
  const ordered: DealStage[] = [];
  const seen = new Set<string>();

  for (const stage of pipeline?.stages ?? []) {
    const entry = stageAgg[stage.id];
    if (!entry) continue;
    ordered.push({
      stageId: stage.id,
      label: stage.label,
      count: entry.count,
      value: entry.value,
    });
    seen.add(stage.id);
  }

  for (const [stageId, entry] of Object.entries(stageAgg)) {
    if (seen.has(stageId)) continue;
    ordered.push({
      stageId,
      label: HUBSPOT_STAGE_FALLBACK_LABEL_BY_ID[stageId] ?? normalizeHubSpotStageLabel(stageId),
      count: entry.count,
      value: entry.value,
    });
  }

  return ordered;
}

async function fetchAllHubSpotDeals(input: {
  baseUrl: string;
  headers: Record<string, string>;
  archived: boolean;
  properties: string;
  propertiesWithHistory?: string;
  maxTotalDeals?: number;
}): Promise<{
  deals: HubSpotDealObject[];
  pagesFetched: number;
  lastAfter: string | null;
  truncated: boolean;
}> {
  const deals: HubSpotDealObject[] = [];
  let after: string | undefined;
  let pagesFetched = 0;

  for (;;) {
    const url = new URL(`${input.baseUrl}/crm/v3/objects/deals`);
    // HubSpot restricts requests that include `propertiesWithHistory` to a
    // smaller page size (currently max 50 objects per request).
    url.searchParams.set("limit", input.propertiesWithHistory ? "50" : "100");
    url.searchParams.set("properties", input.properties);
    url.searchParams.set("associations", "companies,contacts");
    url.searchParams.set("archived", input.archived ? "true" : "false");
    if (input.propertiesWithHistory) {
      url.searchParams.set("propertiesWithHistory", input.propertiesWithHistory);
    }
    if (after) url.searchParams.set("after", after);

    const res = await fetch(url.toString(), { headers: input.headers, cache: "no-store" });

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown");
      throw new Error(`HubSpot deals API error ${res.status}: ${errText}`);
    }

    const data = (await res.json().catch(() => null)) as HubSpotDealsListResponse | null;
    const results = data?.results ?? [];
    deals.push(...results);
    pagesFetched += 1;

    after = data?.paging?.next?.after;
    if (!after || results.length === 0) break;
    if (input.maxTotalDeals && deals.length >= input.maxTotalDeals) break;
  }

  return {
    deals,
    pagesFetched,
    lastAfter: after ?? null,
    truncated: Boolean(after && input.maxTotalDeals && deals.length >= input.maxTotalDeals),
  };
}

function hubSpotAssociationIds(
  associations: HubSpotAssociationMap | undefined,
  key: "companies" | "contacts" | "deals",
): string[] {
  const seen = new Set<string>();
  const rows = associations?.[key]?.results ?? [];
  for (const row of rows) {
    const id = String(row.id ?? row.toObjectId ?? "").trim();
    if (id) seen.add(id);
  }
  return [...seen];
}

function firstHubSpotProperty(
  props: Record<string, string>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = props[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return null;
}

function hubSpotMeetingRecordFromObject(meeting: HubSpotMeetingObject) {
  const props = meeting.properties ?? {};
  const meetingId = String(props.hs_object_id ?? meeting.id ?? "").trim();
  if (!meetingId) return null;

  return {
    meetingId,
    title: props.hs_meeting_title || null,
    body: props.hs_meeting_body || null,
    outcome: props.hs_meeting_outcome || null,
    ownerId: props.hubspot_owner_id || null,
    startedAt: hubSpotTimestampToIso(props.hs_timestamp),
    createdAt: hubSpotTimestampToIso(props.hs_createdate),
    updatedAt: hubSpotTimestampToIso(props.hs_lastmodifieddate),
    contactIds: hubSpotAssociationIds(meeting.associations, "contacts"),
    dealIds: hubSpotAssociationIds(meeting.associations, "deals"),
  };
}

function numericHubSpotProperty(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hubSpotCompanyRecordFromObject(company: HubSpotCompanyObject) {
  const props = company.properties ?? {};
  const companyId = String(props.hs_object_id ?? company.id ?? "").trim();
  if (!companyId) return null;

  return {
    companyId,
    name: props.name || null,
    domain: props.domain || null,
    industry: props.industry || null,
    lifecycleStage: props.lifecyclestage || null,
    employeeCount: numericHubSpotProperty(props.numberofemployees),
    annualRevenue: numericHubSpotProperty(props.annualrevenue),
    ownerId: props.hubspot_owner_id || null,
    createdAt: hubSpotTimestampToIso(props.createdate),
    updatedAt: hubSpotTimestampToIso(props.hs_lastmodifieddate),
  };
}

function hubSpotTicketRecordFromObject(ticket: HubSpotTicketObject) {
  const props = ticket.properties ?? {};
  const ticketId = String(props.hs_object_id ?? ticket.id ?? "").trim();
  if (!ticketId) return null;

  return {
    ticketId,
    subject: props.subject || null,
    content: props.content || null,
    pipelineId: props.hs_pipeline || null,
    stageId: props.hs_pipeline_stage || null,
    priority: props.hs_ticket_priority || null,
    category: props.hs_ticket_category || null,
    sourceType: props.source_type || null,
    ownerId: props.hubspot_owner_id || null,
    createdAt: hubSpotTimestampToIso(props.createdate),
    updatedAt: hubSpotTimestampToIso(props.hs_lastmodifieddate),
    closedAt: hubSpotTimestampToIso(props.closed_date),
    companyIds: hubSpotAssociationIds(ticket.associations, "companies"),
    contactIds: hubSpotAssociationIds(ticket.associations, "contacts"),
    dealIds: hubSpotAssociationIds(ticket.associations, "deals"),
  };
}

async function fetchHubSpotMeetings(input: {
  baseUrl: string;
  headers: Record<string, string>;
}): Promise<HubSpotMeetingsFetchResult> {
  const meetings: NonNullable<HubSpotData["meetings"]> = [];
  let after: string | undefined;
  let pagesFetched = 0;

  try {
    for (let page = 0; page < 100; page += 1) {
      const url = new URL(`${input.baseUrl}/crm/v3/objects/meetings`);
      url.searchParams.set("limit", "100");
      url.searchParams.set("properties", HUBSPOT_MEETING_PROPERTIES);
      url.searchParams.set("associations", "contacts,deals");
      if (after) url.searchParams.set("after", after);

      const response = await fetch(url.toString(), {
        headers: input.headers,
        cache: "no-store",
      });

      if (!response.ok) {
        return {
          data: undefined,
          truncated: false,
          available: false,
          error: `HubSpot meetings request failed (${response.status})`,
          pagesFetched,
        };
      }

      pagesFetched += 1;
      const payload = await safeJson<HubSpotMeetingsListResponse>(response, "hubspot meetings");
      const results = payload.results ?? [];
      for (const meeting of results) {
        const record = hubSpotMeetingRecordFromObject(meeting);
        if (record) meetings.push(record);
      }

      after = payload.paging?.next?.after;
      if (!after || results.length === 0) {
        return { data: meetings, truncated: false, available: true, error: null, pagesFetched };
      }
    }

    return { data: meetings, truncated: true, available: true, error: null, pagesFetched };
  } catch (error) {
    return {
      data: undefined,
      truncated: false,
      available: false,
      error: error instanceof Error ? error.message : "HubSpot meetings request failed",
      pagesFetched,
    };
  }
}

async function fetchHubSpotTickets(input: {
  baseUrl: string;
  headers: Record<string, string>;
}): Promise<HubSpotTicketsFetchResult> {
  const tickets: NonNullable<HubSpotData["tickets"]> = [];
  let after: string | undefined;
  let pagesFetched = 0;

  try {
    for (let page = 0; page < 100; page += 1) {
      const url = new URL(`${input.baseUrl}/crm/v3/objects/tickets`);
      url.searchParams.set("limit", "100");
      url.searchParams.set("properties", HUBSPOT_TICKET_PROPERTIES);
      url.searchParams.set("associations", "companies,contacts,deals");
      if (after) url.searchParams.set("after", after);

      const response = await fetch(url.toString(), {
        headers: input.headers,
        cache: "no-store",
      });

      if (!response.ok) {
        return {
          data: undefined,
          truncated: false,
          available: false,
          error: `HubSpot tickets request failed (${response.status})`,
          pagesFetched,
        };
      }

      pagesFetched += 1;
      const payload = await safeJson<HubSpotTicketsListResponse>(response, "hubspot tickets");
      const results = payload.results ?? [];
      for (const ticket of results) {
        const record = hubSpotTicketRecordFromObject(ticket);
        if (record) tickets.push(record);
      }

      after = payload.paging?.next?.after;
      if (!after || results.length === 0) {
        return { data: tickets, truncated: false, available: true, error: null, pagesFetched };
      }
    }

    return { data: tickets, truncated: true, available: true, error: null, pagesFetched };
  } catch (error) {
    return {
      data: undefined,
      truncated: false,
      available: false,
      error: error instanceof Error ? error.message : "HubSpot tickets request failed",
      pagesFetched,
    };
  }
}

async function fetchHubSpotCompanies(input: {
  baseUrl: string;
  headers: Record<string, string>;
}): Promise<HubSpotCompaniesFetchResult> {
  const companies: NonNullable<HubSpotData["companies"]> = [];
  let after: string | undefined;
  let pagesFetched = 0;

  try {
    for (let page = 0; page < 100; page += 1) {
      const url = new URL(`${input.baseUrl}/crm/v3/objects/companies`);
      url.searchParams.set("limit", "100");
      url.searchParams.set("properties", HUBSPOT_COMPANY_PROPERTIES);
      if (after) url.searchParams.set("after", after);

      const response = await fetch(url.toString(), {
        headers: input.headers,
        cache: "no-store",
      });

      if (!response.ok) {
        return {
          data: undefined,
          truncated: false,
          available: false,
          error: `HubSpot companies request failed (${response.status})`,
          pagesFetched,
        };
      }

      pagesFetched += 1;
      const payload = await safeJson<HubSpotCompaniesListResponse>(response, "hubspot companies");
      const results = payload.results ?? [];
      for (const company of results) {
        const record = hubSpotCompanyRecordFromObject(company);
        if (record) companies.push(record);
      }

      after = payload.paging?.next?.after;
      if (!after || results.length === 0) {
        return { data: companies, truncated: false, available: true, error: null, pagesFetched };
      }
    }

    return { data: companies, truncated: true, available: true, error: null, pagesFetched };
  } catch (error) {
    return {
      data: undefined,
      truncated: false,
      available: false,
      error: error instanceof Error ? error.message : "HubSpot companies request failed",
      pagesFetched,
    };
  }
}

async function fetchHubSpotDealPipelines(input: {
  baseUrl: string;
  headers: Record<string, string>;
}): Promise<{ pipelines: HubSpotPipeline[]; source: "api" | "fallback" }> {
  const fallback = buildFallbackPipelines();

  try {
    const res = await fetch(`${input.baseUrl}/crm/v3/pipelines/deals`, {
      headers: input.headers,
      cache: "no-store",
    });
    if (!res.ok) {
      return { pipelines: fallback, source: "fallback" };
    }

    const data = (await res.json().catch(() => null)) as HubSpotPipelinesResponse | null;
    const pipelines = (data?.results ?? [])
      .map((pipeline) => {
        const id = String(pipeline.id ?? "").trim();
        if (!id) return null;

        const stages = (pipeline.stages ?? [])
          .map((stage, index) => {
            const stageId = String(stage.id ?? "").trim();
            if (!stageId) return null;
            return {
              id: stageId,
              label: normalizeHubSpotStageLabel(String(stage.label ?? stageId)),
              archived: Boolean(stage.archived),
              displayOrder: typeof stage.displayOrder === "number" ? stage.displayOrder : index,
            } satisfies HubSpotPipelineStage;
          })
          .filter(Boolean) as HubSpotPipelineStage[];

        stages.sort((a, b) => a.displayOrder - b.displayOrder);

        return {
          id,
          label: String(pipeline.label ?? id).trim() || id,
          archived: Boolean(pipeline.archived),
          stages,
        } satisfies HubSpotPipeline;
      })
      .filter(Boolean) as HubSpotPipeline[];

    const hasMainPipeline = pipelines.some((pipeline) => pipeline.id === HUBSPOT_MAIN_PIPELINE_ID);
    if (!hasMainPipeline) {
      return { pipelines: fallback, source: "fallback" };
    }

    return { pipelines, source: "api" };
  } catch {
    return { pipelines: fallback, source: "fallback" };
  }
}

function parseHubSpotTimestamp(value: string | number | undefined): number | null {
  const validMillis = (millis: number): number | null => {
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : millis;
  };

  if (typeof value === "number" && Number.isFinite(value)) {
    // HubSpot often returns ms timestamps; guard seconds timestamps too.
    const millis = value < 1_000_000_000_000 ? Math.round(value * 1000) : Math.round(value);
    return validMillis(millis);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      const millis = numeric < 1_000_000_000_000 ? Math.round(numeric * 1000) : Math.round(numeric);
      return validMillis(millis);
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? validMillis(parsed) : null;
  }
  return null;
}

function hubSpotTimestampToIso(value: string | number | undefined | null): string | null {
  const timestamp = parseHubSpotTimestamp(value ?? undefined);
  return timestamp === null ? null : new Date(timestamp).toISOString();
}

function extractHubSpotStageEvents(deal: HubSpotDealObject): HubSpotStageEvent[] {
  const dealId = String(deal.id ?? "").trim();
  if (!dealId) return [];
  const props = deal.properties || {};
  const amount = parseFloat(props.amount) || 0;
  const ownerId = props.hubspot_owner_id || null;
  const source = props.hs_analytics_source || "Unknown";
  const dealName = props.dealname || "Untitled deal";

  const history = (deal.propertiesWithHistory?.dealstage ?? []) as HubSpotStageHistoryEntry[];
  const normalized = history
    .map((entry) => {
      const stage = entry.value ? String(entry.value).trim() : "";
      const ts = parseHubSpotTimestamp(entry.timestamp);
      if (!stage || !ts) return null;
      return { stage, ts };
    })
    .filter(Boolean) as Array<{ stage: string; ts: number }>;

  if (normalized.length === 0) return [];
  normalized.sort((a, b) => a.ts - b.ts);

  const events: HubSpotStageEvent[] = [];
  for (let i = 0; i < normalized.length; i++) {
    const current = normalized[i];
    const previous = i > 0 ? normalized[i - 1] : null;
    events.push({
      dealId,
      occurredAt: current.ts,
      fromStage: previous?.stage ?? null,
      toStage: current.stage,
      ownerId,
      amount,
      source,
      dealName,
    });
  }
  return events;
}

function buildHubSpotStageHistory(
  deal: HubSpotDealObject,
  stageLabelById: Map<string, string>,
): Array<{ occurredAt: string; stageId: string; stageLabel: string }> {
  const history = (deal.propertiesWithHistory?.dealstage ?? []) as HubSpotStageHistoryEntry[];
  return history
    .map((entry) => {
      const stageId = entry.value ? String(entry.value).trim() : "";
      const timestamp = parseHubSpotTimestamp(entry.timestamp);
      if (!stageId || !timestamp) return null;
      return {
        occurredAt: new Date(timestamp).toISOString(),
        stageId,
        stageLabel: resolveHubSpotStageLabel(stageId, stageLabelById),
      };
    })
    .filter((entry): entry is { occurredAt: string; stageId: string; stageLabel: string } => entry !== null)
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
}

type HubSpotDealRecord = NonNullable<HubSpotData["deals"]>[number];

const SUSPICIOUS_EMAIL_DOMAINS = new Set([
  "10minutemail.com",
  "example.com",
  "fakeinbox.com",
  "guerrillamail.com",
  "mailinator.com",
  "sharklasers.com",
  "temp-mail.org",
  "test.com",
  "yopmail.com",
]);

const SUSPICIOUS_TEXT_PATTERN = /\b(asdf|bot|fake|junk|qwerty|spam|test)\b/i;

function normalizeEmail(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function hasNoHubSpotEngagement(analytics: HubSpotDealRecord["primaryContactAnalytics"]): boolean {
  if (!analytics) return false;
  const hasVisits = (analytics.numVisits ?? 0) > 0 || (analytics.numPageViews ?? 0) > 0;
  const hasAttribution = Boolean(
    analytics.utmSource ||
      analytics.utmMedium ||
      analytics.utmCampaign ||
      analytics.sourceData1 ||
      analytics.sourceData2,
  );
  return !hasVisits && !hasAttribution;
}

function isRandomLookingEmailLocalPart(value: string): boolean {
  if (value.length < 12 || value.length > 32) return false;
  if (!/^[a-z0-9._+-]+$/.test(value)) return false;
  const alnum = value.replace(/[^a-z0-9]/g, "");
  if (alnum.length < 12) return false;
  const vowels = alnum.match(/[aeiou]/g)?.length ?? 0;
  const digits = alnum.match(/\d/g)?.length ?? 0;
  return vowels <= 1 || digits >= Math.ceil(alnum.length * 0.45);
}

function suspiciousHubSpotLeadReasons(deal: HubSpotDealRecord): string[] {
  const reasons: string[] = [];
  const email = normalizeEmail(deal.primaryContactEmail);
  const [localPart = "", domain = ""] = email.split("@");
  const source = (deal.source || "").trim().toLowerCase();
  const dealName = (deal.dealName || "").trim();

  if (email && !email.includes("@")) reasons.push("invalid_email");
  if (domain && SUSPICIOUS_EMAIL_DOMAINS.has(domain)) reasons.push("disposable_or_test_email_domain");
  if (localPart && (SUSPICIOUS_TEXT_PATTERN.test(localPart) || isRandomLookingEmailLocalPart(localPart))) {
    reasons.push("junk_email_local_part");
  }
  if (SUSPICIOUS_TEXT_PATTERN.test(dealName)) reasons.push("junk_deal_name");
  if (!source || source === "unknown" || source === "(none)") reasons.push("missing_source");
  if (deal.amount <= 0) reasons.push("zero_amount");
  if (hasNoHubSpotEngagement(deal.primaryContactAnalytics)) reasons.push("no_contact_engagement");

  return reasons;
}

function isSuspiciousHubSpotLead(deal: HubSpotDealRecord): boolean {
  const reasons = suspiciousHubSpotLeadReasons(deal);
  const hasContactSignal = reasons.some((reason) =>
    reason === "invalid_email" ||
      reason === "disposable_or_test_email_domain" ||
      reason === "junk_email_local_part" ||
      reason === "no_contact_engagement",
  );
  const hasJunkIdentitySignal = reasons.some((reason) =>
    reason === "disposable_or_test_email_domain" ||
      reason === "junk_email_local_part" ||
      reason === "junk_deal_name" ||
      reason === "invalid_email",
  );

  return hasContactSignal && hasJunkIdentitySignal && reasons.length >= 3;
}

type HubSpotOwnerRecord = { id: string; name: string; email: string | null };

async function fetchHubSpotOwners(input: {
  baseUrl: string;
  headers: Record<string, string>;
}): Promise<{ owners: HubSpotOwnerRecord[]; source: "v3" | "v2" | "none" }> {
  // Best-effort: owners enrich the rep scoreboard. If this fails, we can still group by ownerId.
  try {
    const owners: HubSpotOwnerRecord[] = [];
    let after: string | undefined;
    for (let page = 0; page < 25; page++) {
      const url = new URL(`${input.baseUrl}/crm/v3/owners/`);
      url.searchParams.set("limit", "100");
      if (after) url.searchParams.set("after", after);
      const res = await fetch(url.toString(), { headers: input.headers, cache: "no-store" });
      if (!res.ok) throw new Error(`HubSpot owners v3 error ${res.status}`);
      const data = (await res.json().catch(() => null)) as
        | { results?: Array<{ id?: string; firstName?: string; lastName?: string; email?: string }>; paging?: { next?: { after?: string } } }
        | null;
      const results = data?.results ?? [];
      for (const row of results) {
        const id = String(row.id ?? "").trim();
        if (!id) continue;
        const full = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();
        const email = row.email?.trim() || null;
        owners.push({
          id,
          name: full || email || `Owner ${id}`,
          email,
        });
      }
      after = data?.paging?.next?.after;
      if (!after || results.length === 0) break;
    }
    return { owners, source: "v3" };
  } catch {
    // fall through
  }

  try {
    const owners: HubSpotOwnerRecord[] = [];
    const count = 500;

    for (let page = 0; page < 100; page += 1) {
      const offset = page * count;
      const res = await fetch(`${input.baseUrl}/owners/v2/owners?count=${count}&offset=${offset}`, {
        headers: input.headers,
        cache: "no-store",
      });
      if (!res.ok) return owners.length > 0 ? { owners, source: "v2" } : { owners: [], source: "none" };
      const data = (await res.json().catch(() => null)) as
        | Array<{ ownerId?: number; firstName?: string; lastName?: string; email?: string }>
        | null;
      const rows = data ?? [];
      for (const row of rows) {
        const id = String(row.ownerId ?? "").trim();
        if (!id) continue;
        const full = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();
        const email = row.email?.trim() || null;
        owners.push({ id, name: full || email || `Owner ${id}`, email });
      }
      if (rows.length < count) break;
    }

    return { owners, source: "v2" };
  } catch {
    return { owners: [], source: "none" };
  }
}

export async function fetchHubSpotData(
  accessToken: string,
  options?: { fromDate?: Date; toDate?: Date }
): Promise<HubSpotData> {
  const token = accessToken.trim();
  const baseUrl = "https://api.hubapi.com";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const rangeFrom = options?.fromDate ?? null;
  const rangeTo = options?.toDate ?? null;
  const useActivityInRange =
    Boolean(rangeFrom && rangeTo) &&
    !Number.isNaN(rangeFrom?.getTime() ?? NaN) &&
    !Number.isNaN(rangeTo?.getTime() ?? NaN) &&
    Boolean(rangeFrom && rangeTo && rangeFrom <= rangeTo);

  const properties =
    "dealstage,amount,dealname,closedate,createdate,hs_analytics_source,num_associated_contacts,hubspot_owner_id,hs_lastmodifieddate,stripe_customer_id,stripe_customer,pipeline,hs_mrr,hs_arr,monthly_recurring_revenue,annual_recurring_revenue,recurring_revenue,recurring_revenue_amount,subscription_start_date,subscription_end_date,hs_recurring_billing_start_date,hs_recurring_billing_end_date";
  const historyKey = "dealstage";

  const [
    pipelineResult,
    activeDealsResult,
    archivedDealsResult,
    collectedFormsResult,
    meetingsResult,
    companiesResult,
    ticketsResult,
  ] = await Promise.all([
    fetchHubSpotDealPipelines({ baseUrl, headers }),
    fetchAllHubSpotDeals({
      baseUrl,
      headers,
      archived: false,
      properties,
      propertiesWithHistory: historyKey,
      maxTotalDeals: 10_000,
    }),
    fetchAllHubSpotDeals({
      baseUrl,
      headers,
      archived: true,
      properties,
      propertiesWithHistory: historyKey,
      maxTotalDeals: 10_000,
    }),
    fetchHubSpotCollectedForms({
      baseUrl,
      headers,
      from: rangeFrom,
      to: rangeTo,
    }),
    fetchHubSpotMeetings({ baseUrl, headers }),
    fetchHubSpotCompanies({ baseUrl, headers }),
    fetchHubSpotTickets({ baseUrl, headers }),
  ]);

  const mainPipeline = pipelineResult.pipelines.find((pipeline) => pipeline.id === HUBSPOT_MAIN_PIPELINE_ID) ?? null;
  const stageLabelById = new Map(
    pipelineResult.pipelines.flatMap((pipeline) =>
      pipeline.stages.map((stage) => [stage.id, stage.label] as const),
    ),
  );
  const mainStageLabelById = new Map(
    (mainPipeline?.stages ?? []).map((stage) => [stage.id, stage.label]),
  );

  const allDealsById = new Map<string, HubSpotDealObject>();
  for (const deal of [...activeDealsResult.deals, ...archivedDealsResult.deals]) {
    const id = String(deal.id ?? "").trim();
    if (!id) continue;
    allDealsById.set(id, deal);
  }
  const allDeals = [...allDealsById.values()];
  const allMainPipelineDeals = allDeals.filter((deal) =>
    isMainHubSpotPipeline(deal.properties?.pipeline ?? null),
  );
  const allSubscriptionPipelineDeals = allDeals.filter((deal) =>
    isHubSpotSubscriptionPipeline(deal.properties?.pipeline ?? null),
  );
  const activeDeals = activeDealsResult.deals.filter((deal) =>
    isMainHubSpotPipeline(deal.properties?.pipeline ?? null),
  );
  const activeSubscriptionPipelineDeals = activeDealsResult.deals.filter((deal) =>
    isHubSpotSubscriptionPipeline(deal.properties?.pipeline ?? null),
  );
  let dealsFetched = allMainPipelineDeals.length;

  const shouldLoadOwners =
    useActivityInRange ||
    allMainPipelineDeals.some((deal) => Boolean(deal.properties?.hubspot_owner_id));

  const ownerNameById = new Map<string, string>();
  let ownerLookupDiagnostics: { ownersFetched: number; source: string } | null = null;
  if (shouldLoadOwners) {
    const { owners, source } = await fetchHubSpotOwners({ baseUrl, headers });
    ownerLookupDiagnostics = { ownersFetched: owners.length, source };
    for (const owner of owners) {
      ownerNameById.set(owner.id, owner.name);
    }
  }

  const resolveOwnerName = (ownerId: string | null | undefined): string => {
    if (!ownerId) return "Unassigned";
    const trimmed = String(ownerId).trim();
    if (!trimmed) return "Unassigned";
    return ownerNameById.get(trimmed) || `Owner ${trimmed}`;
  };

  let deals = allMainPipelineDeals.map((deal) => {
    const props = deal.properties || {};
    const stageId = props.dealstage || "unknown";
    const ownerId = props.hubspot_owner_id || null;
    return {
      dealId: String((deal as { id?: string }).id ?? ""),
      dealName: props.dealname || "Untitled deal",
      stageId,
      stageLabel: resolveHubSpotStageLabel(stageId, mainStageLabelById),
      amount: parseFloat(props.amount) || 0,
      source: props.hs_analytics_source || "Unknown",
      ownerId,
      repName: resolveOwnerName(ownerId),
      updatedAt: hubSpotTimestampToIso(props.hs_lastmodifieddate),
      createdAt: hubSpotTimestampToIso(props.createdate),
      closedAt: hubSpotTimestampToIso(props.closedate),
      stripeCustomerId: props.stripe_customer_id || props.stripe_customer || null,
      pipelineId: props.pipeline || null,
      companyIds: hubSpotAssociationIds(deal.associations, "companies"),
      contactIds: hubSpotAssociationIds(deal.associations, "contacts"),
      primaryContactId: null as string | null,
      primaryContactEmail: null as string | null,
      monthlyRecurringRevenue: firstHubSpotProperty(props, [
        "hs_mrr",
        "monthly_recurring_revenue",
      ]),
      recurringRevenueAmount: firstHubSpotProperty(props, [
        "hs_arr",
        "annual_recurring_revenue",
        "recurring_revenue_amount",
      ]),
      recurringRevenue: firstHubSpotProperty(props, ["recurring_revenue"]),
      subscriptionStartDate: firstHubSpotProperty(props, [
        "subscription_start_date",
        "hs_recurring_billing_start_date",
      ]),
      subscriptionEndDate: firstHubSpotProperty(props, [
        "subscription_end_date",
        "hs_recurring_billing_end_date",
      ]),
      stageHistory: buildHubSpotStageHistory(deal, mainStageLabelById),
    };
  });

  const subscriptionDeals = activeSubscriptionPipelineDeals.map((deal) => {
    const props = deal.properties || {};
    const stageId = props.dealstage || "unknown";
    const ownerId = props.hubspot_owner_id || null;
    return {
      dealId: String((deal as { id?: string }).id ?? ""),
      dealName: props.dealname || "Untitled subscription",
      stageId,
      stageLabel: resolveHubSpotStageLabel(stageId, stageLabelById),
      amount: parseFloat(props.amount) || 0,
      source: props.hs_analytics_source || "Unknown",
      ownerId,
      repName: resolveOwnerName(ownerId),
      updatedAt: hubSpotTimestampToIso(props.hs_lastmodifieddate),
      createdAt: hubSpotTimestampToIso(props.createdate),
      closedAt: hubSpotTimestampToIso(props.closedate),
      stripeCustomerId: props.stripe_customer_id || props.stripe_customer || null,
      pipelineId: props.pipeline || null,
      companyIds: hubSpotAssociationIds(deal.associations, "companies"),
      contactIds: hubSpotAssociationIds(deal.associations, "contacts"),
      primaryContactId: null as string | null,
      primaryContactEmail: null as string | null,
      monthlyRecurringRevenue: firstHubSpotProperty(props, [
        "hs_mrr",
        "monthly_recurring_revenue",
      ]),
      recurringRevenueAmount: firstHubSpotProperty(props, [
        "hs_arr",
        "annual_recurring_revenue",
        "recurring_revenue_amount",
      ]),
      recurringRevenue: firstHubSpotProperty(props, ["recurring_revenue"]),
      subscriptionStartDate: firstHubSpotProperty(props, [
        "subscription_start_date",
        "hs_recurring_billing_start_date",
      ]),
      subscriptionEndDate: firstHubSpotProperty(props, [
        "subscription_end_date",
        "hs_recurring_billing_end_date",
      ]),
      stageHistory: buildHubSpotStageHistory(deal, stageLabelById),
    };
  });

  // Enrich before aggregation so suspicious contact-backed leads can be removed
  // from all HubSpot-derived funnel, demo, and churn calculations.
  try {
    const dealIdsForContacts = [...deals, ...subscriptionDeals].map((d) => d.dealId).filter(Boolean);
    const contactAnalytics = await fetchDealContactAnalytics(baseUrl, headers, dealIdsForContacts);
    for (const deal of [...deals, ...subscriptionDeals]) {
      const analytics = contactAnalytics.get(deal.dealId);
      if (analytics) {
        if (analytics.contactIds.length > 0) {
          deal.contactIds = analytics.contactIds;
        }
        deal.primaryContactId = analytics.primaryContactId ?? deal.contactIds[0] ?? null;
        deal.primaryContactEmail = analytics.primaryContactEmail;
        (deal as Record<string, unknown>).primaryContactAnalytics = analytics.primaryContactAnalytics;
      }
    }
  } catch {
    // Non-critical — attribution will fall back to deal-level signals only.
  }

  const suspiciousDealIds = new Set(
    deals
      .filter((deal) => isSuspiciousHubSpotLead(deal))
      .map((deal) => deal.dealId),
  );
  const suspiciousLeadExclusions = suspiciousDealIds.size;
  deals = deals.filter((deal) => !suspiciousDealIds.has(deal.dealId));
  const metricActiveDeals = activeDeals.filter((deal) => !suspiciousDealIds.has(String(deal.id ?? "")));
  const metricAllMainPipelineDeals = allMainPipelineDeals.filter((deal) => !suspiciousDealIds.has(String(deal.id ?? "")));
  dealsFetched = metricAllMainPipelineDeals.length;

  const stageAgg: Record<string, { count: number; value: number }> = {};
  const sourceAgg: Record<string, { count: number; value: number; closedWon: number; followUpNeeded: number; churned: number }> = {};
  let notActivatedCount = 0;

  for (const deal of metricActiveDeals) {
    const props = deal.properties || {};

    const stage = props.dealstage || "unknown";
    const mappedLabel = resolveHubSpotStageLabel(stage, mainStageLabelById);
    const amount = parseFloat(props.amount) || 0;
    const source = props.hs_analytics_source || "Unknown";

    if (!stageAgg[stage]) stageAgg[stage] = { count: 0, value: 0 };
    stageAgg[stage].count++;
    stageAgg[stage].value += amount;

    if (!sourceAgg[source]) sourceAgg[source] = { count: 0, value: 0, closedWon: 0, followUpNeeded: 0, churned: 0 };
    sourceAgg[source].count++;
    sourceAgg[source].value += amount;

    if (stage === "closedwon") sourceAgg[source].closedWon++;
    if (mappedLabel === "Demo Follow-Up") sourceAgg[source].followUpNeeded++;
    if (mappedLabel === "Churn") {
      sourceAgg[source].churned++;

      const createdMs = props.createdate ? new Date(props.createdate).getTime() : 0;
      const updatedMs = props.hs_lastmodifieddate ? new Date(props.hs_lastmodifieddate).getTime()
        : props.closedate ? new Date(props.closedate).getTime()
        : new Date().getTime();

      const daysSinceCreation = createdMs > 0 ? (updatedMs - createdMs) / 86_400_000 : Infinity;

      if (createdMs > 0 && daysSinceCreation <= 60) {
        notActivatedCount++;
      }
    }
  }

  const STAGE_CLOSED_WON = "closedwon";
  const STAGE_CLOSED_LOST = "closedlost";
  const STAGE_UNLIKELY = "1499784891";
  const STAGE_CHURN = "1499784890";
  const STAGE_NO_SHOW = "1955958510";
  const STAGE_DEMO_SCHEDULED = "presentationscheduled";
  const STAGE_DEMO_FOLLOW_UP = "decisionmakerboughtin";

  let funnelStages = buildOrderedHubSpotStages(stageAgg, mainPipeline);
  let dealsBySource = Object.entries(sourceAgg).map(([source, data]) => ({
    source,
    count: data.count,
    value: data.value,
  }));
  let totalDeals = dealsFetched;
  let closedWon = stageAgg[STAGE_CLOSED_WON]?.count || 0;
  let closedLost = stageAgg[STAGE_CLOSED_LOST]?.count || 0;
  let unlikely = stageAgg[STAGE_UNLIKELY]?.count || 0;
  let churn = stageAgg[STAGE_CHURN]?.count || 0;
  let subscriptions = activeSubscriptionPipelineDeals.length;
  let noShows = stageAgg[STAGE_NO_SHOW]?.count || 0;
  let demoScheduled = stageAgg[STAGE_DEMO_SCHEDULED]?.count || 0;
  let demoFollowUp = stageAgg[STAGE_DEMO_FOLLOW_UP]?.count || 0;
  let wonValue = stageAgg[STAGE_CLOSED_WON]?.value || 0;

  let repScoreboard: HubSpotData["repScoreboard"] = undefined;

  if (useActivityInRange && rangeFrom && rangeTo) {
    const fromMs = rangeFrom.getTime();
    const toMs = rangeTo.getTime();
    const stageEntryAgg: Record<string, { count: number; value: number }> = {};
    const touchedDeals = new Map<string, { ownerId: string | null; amount: number; source: string; dealName: string }>();
    const eventsInRange: HubSpotStageEvent[] = [];
    const hadWonBeforeChurnInRange = new Set<string>();

    for (const deal of metricAllMainPipelineDeals) {
      const events = extractHubSpotStageEvents(deal);
      if (events.length === 0) continue;

      // Detect churned-won: churn entry in range with a prior won stage.
      const wonAt = events.find((e) => e.toStage === STAGE_CLOSED_WON)?.occurredAt ?? null;

      for (const ev of events) {
        if (ev.occurredAt < fromMs || ev.occurredAt > toMs) continue;
        eventsInRange.push(ev);

        // touched deal set
        touchedDeals.set(ev.dealId, {
          ownerId: ev.ownerId,
          amount: ev.amount,
          source: ev.source,
          dealName: ev.dealName,
        });

        if (!stageEntryAgg[ev.toStage]) stageEntryAgg[ev.toStage] = { count: 0, value: 0 };
        stageEntryAgg[ev.toStage].count += 1;
        stageEntryAgg[ev.toStage].value += ev.amount;

        if (ev.toStage === STAGE_CHURN && wonAt && wonAt < ev.occurredAt) {
          hadWonBeforeChurnInRange.add(ev.dealId);
        }
      }
    }

    // Overwrite funnel KPIs with activity-in-range metrics.
    totalDeals = touchedDeals.size;
    closedWon = stageEntryAgg[STAGE_CLOSED_WON]?.count || 0;
    closedLost = stageEntryAgg[STAGE_CLOSED_LOST]?.count || 0;
    unlikely = stageEntryAgg[STAGE_UNLIKELY]?.count || 0;
    churn = stageEntryAgg[STAGE_CHURN]?.count || 0;
    subscriptions = activeSubscriptionPipelineDeals.length;
    noShows = stageEntryAgg[STAGE_NO_SHOW]?.count || 0;
    demoScheduled = stageEntryAgg[STAGE_DEMO_SCHEDULED]?.count || 0;
    demoFollowUp = stageEntryAgg[STAGE_DEMO_FOLLOW_UP]?.count || 0;
    wonValue = stageEntryAgg[STAGE_CLOSED_WON]?.value || 0;

    funnelStages = buildOrderedHubSpotStages(stageEntryAgg, mainPipeline);

    const sourceAggTouched: Record<string, { count: number; value: number }> = {};
    for (const touched of touchedDeals.values()) {
      const source = touched.source || "Unknown";
      if (!sourceAggTouched[source]) sourceAggTouched[source] = { count: 0, value: 0 };
      sourceAggTouched[source].count += 1;
      sourceAggTouched[source].value += touched.amount;
    }
    dealsBySource = Object.entries(sourceAggTouched).map(([source, data]) => ({
      source,
      count: data.count,
      value: data.value,
    }));

    const scoreboardByOwner = new Map<
      string,
      {
        ownerId: string | null;
        ownerName: string;
        dealIds: Set<string>;
        totalPipeline: number;
        demos: number;
        noShows: number;
        wonCount: number;
        wonRevenue: number;
        lostCount: number;
        churnedWon: number;
      }
    >();

    function bucket(ownerId: string | null): string {
      return ownerId ? `owner:${ownerId}` : "owner:unassigned";
    }

    function ensure(ownerId: string | null) {
      const key = bucket(ownerId);
      const existing = scoreboardByOwner.get(key);
      if (existing) return existing;
      const ownerName = ownerId ? ownerNameById.get(ownerId) || `Owner ${ownerId}` : "Unassigned";
      const created = {
        ownerId,
        ownerName,
        dealIds: new Set<string>(),
        totalPipeline: 0,
        demos: 0,
        noShows: 0,
        wonCount: 0,
        wonRevenue: 0,
        lostCount: 0,
        churnedWon: 0,
      };
      scoreboardByOwner.set(key, created);
      return created;
    }

    // Pipeline totals: sum amounts for touched deals.
    for (const [dealId, touched] of touchedDeals.entries()) {
      const row = ensure(touched.ownerId);
      row.dealIds.add(dealId);
      row.totalPipeline += touched.amount;
    }

    // Event counters.
    for (const ev of eventsInRange) {
      const row = ensure(ev.ownerId);
      if (ev.toStage === STAGE_DEMO_SCHEDULED) row.demos += 1;
      if (ev.toStage === STAGE_NO_SHOW) row.noShows += 1;
      if (ev.toStage === STAGE_CLOSED_WON) {
        row.wonCount += 1;
        row.wonRevenue += ev.amount;
      }
      if (ev.toStage === STAGE_CLOSED_LOST) row.lostCount += 1;
    }

    // Churned-won attribution: attribute to current owner bucket.
    for (const dealId of hadWonBeforeChurnInRange) {
      const touched = touchedDeals.get(dealId);
      const row = ensure(touched?.ownerId ?? null);
      row.churnedWon += 1;
    }

    repScoreboard = [...scoreboardByOwner.values()]
      .map((row) => {
        const totalDeals = row.dealIds.size;
        const avgDealSize = totalDeals > 0 ? row.totalPipeline / totalDeals : 0;
        const noShowRate = row.demos + row.noShows > 0 ? (row.noShows / (row.demos + row.noShows)) * 100 : 0;
        const winRate = row.wonCount + row.lostCount > 0 ? (row.wonCount / (row.wonCount + row.lostCount)) * 100 : 0;
        const avgWon = row.wonCount > 0 ? row.wonRevenue / row.wonCount : 0;
        const demoToWonRate = row.demos > 0 ? (row.wonCount / row.demos) * 100 : 0;
        const churnRate = row.wonCount > 0 ? (row.churnedWon / row.wonCount) * 100 : 0;
        return {
          ownerId: row.ownerId,
          ownerName: row.ownerName,
          totalDeals,
          totalPipeline: row.totalPipeline,
          avgDealSize,
          demos: row.demos,
          noShows: row.noShows,
          noShowRate,
          wonCount: row.wonCount,
          wonRevenue: row.wonRevenue,
          avgWon,
          lostCount: row.lostCount,
          winRate,
          demoToWonRate,
          churnedWon: row.churnedWon,
          churnRate,
        };
      })
      .sort((a, b) => b.totalPipeline - a.totalPipeline);

  }

  deals.sort(compareHubSpotDealsByRecency);
  subscriptionDeals.sort(compareHubSpotDealsByRecency);

  let displayDeals = [...deals];
  if (useActivityInRange && rangeFrom && rangeTo) {
    const fromMs = rangeFrom.getTime();
    const toMs = rangeTo.getTime();
    displayDeals = deals
      .filter((deal) => {
        const updatedAtMs = Date.parse(deal.updatedAt || "");
        return Number.isFinite(updatedAtMs) && updatedAtMs >= fromMs && updatedAtMs <= toMs;
      })
      .sort(compareHubSpotDealsByRecency);
  }

  const winRate = closedWon + closedLost > 0 ? (closedWon / (closedWon + closedLost)) * 100 : 0;
  const terminal = closedWon + closedLost + unlikely + churn;
  const effectiveWinRate = terminal > 0 ? (closedWon / terminal) * 100 : 0;
  const noShowRate = demoScheduled + noShows > 0 ? (noShows / (demoScheduled + noShows)) * 100 : 0;
  const avgDealSize = closedWon > 0 ? wonValue / closedWon : 0;

  // ── Fetch recent contacts count using list endpoint ──
  let recentContacts = 0;
  try {
    const contactsUrl = `${baseUrl}/crm/v3/objects/contacts?limit=1&properties=createdate`;
    const contactsRes = await fetch(contactsUrl, {
      headers,
      cache: "no-store",
    });
    if (contactsRes.ok) {
      const contactsData = await safeJson<{ total?: number }>(contactsRes, "hubspot contacts");
      // The list endpoint returns total count in the response
      recentContacts = contactsData.total || 0;
    }
  } catch {
    // Non-critical — skip
  }

  const meta = makeMeta("live");
  const collectedForms = collectedFormsResult.data;
  const meetings = meetingsResult.data;
  const companies = companiesResult.data;
  const tickets = ticketsResult.data;
  const truncatedResources = [
    ...(activeDealsResult.truncated ? ["activeDeals"] : []),
    ...(archivedDealsResult.truncated ? ["archivedDeals"] : []),
    ...collectedFormsResult.truncatedResources,
    ...(meetingsResult.truncated ? ["meetings"] : []),
    ...(companiesResult.truncated ? ["companies"] : []),
    ...(ticketsResult.truncated ? ["tickets"] : []),
  ];
  meta.truncated = truncatedResources.length > 0;
  meta.truncatedResources = truncatedResources;
  meta.diagnostics = {
    dealsFetched,
    archivedIncluded: true,
    activityMode: useActivityInRange ? "activity_in_range" : "snapshot_current_stage",
    pagesFetched: {
      active: activeDealsResult.pagesFetched,
      archived: archivedDealsResult.pagesFetched,
    },
    activeDealsRaw: activeDealsResult.deals.length,
    archivedDealsRaw: archivedDealsResult.deals.length,
    includedPipelineId: HUBSPOT_MAIN_PIPELINE_ID,
    subscriptionPipelineId: HUBSPOT_SUBSCRIPTION_PIPELINE_ID,
    suspiciousLeadExclusions,
    subscriptionDealsFetched: allSubscriptionPipelineDeals.length,
    subscriptionActiveDealsFetched: activeSubscriptionPipelineDeals.length,
    excludedPipelineIds: pipelineResult.pipelines
      .map((pipeline) => pipeline.id)
      .filter((pipelineId) => pipelineId !== HUBSPOT_MAIN_PIPELINE_ID && pipelineId !== HUBSPOT_SUBSCRIPTION_PIPELINE_ID),
    excludedDeals: allDeals.length - allMainPipelineDeals.length - allSubscriptionPipelineDeals.length,
    lastAfter: {
      active: activeDealsResult.lastAfter,
      archived: archivedDealsResult.lastAfter,
    },
    range: useActivityInRange
      ? {
          from: rangeFrom?.toISOString() ?? null,
          to: rangeTo?.toISOString() ?? null,
        }
      : null,
    ownerLookup: ownerLookupDiagnostics,
    collectedFormsAvailable: collectedFormsResult.available,
    collectedFormsError: collectedFormsResult.error,
    collectedFormsFetched: collectedForms?.totalFormSubmissions ?? 0,
    collectedFormsTruncated: collectedFormsResult.truncated,
    collectedFormsPagesFetched: collectedFormsResult.pagesFetched,
    meetingsAvailable: meetingsResult.available,
    meetingsError: meetingsResult.error,
    meetingsFetched: meetings?.length ?? 0,
    meetingsTruncated: meetingsResult.truncated,
    meetingsPagesFetched: meetingsResult.pagesFetched,
    companiesAvailable: companiesResult.available,
    companiesError: companiesResult.error,
    companiesFetched: companies?.length ?? 0,
    companiesTruncated: companiesResult.truncated,
    companiesPagesFetched: companiesResult.pagesFetched,
    ticketsAvailable: ticketsResult.available,
    ticketsError: ticketsResult.error,
    ticketsFetched: tickets?.length ?? 0,
    ticketsTruncated: ticketsResult.truncated,
    ticketsPagesFetched: ticketsResult.pagesFetched,
  };

  return {
    funnel: {
      totalDeals,
      closedWon,
      closedLost,
      unlikely,
      churn,
      notActivated: notActivatedCount,
      excludedSuspiciousLeads: suspiciousLeadExclusions,
      activeSubscriptions: subscriptions,
      noShows,
      demoScheduled,
      demoFollowUp,
      collectedFormSubmissions: collectedForms?.totalFormSubmissions ?? 0,
      leadMagnetSubmissions: collectedForms?.leadMagnetSubmissions ?? 0,
      contactRequestSubmissions: collectedForms?.contactRequestSubmissions ?? 0,
      avgDealSize,
      winRate,
      effectiveWinRate,
      noShowRate,
      stages: funnelStages,
      dealsBySource,
    },
    collectedForms,
    meetings,
    companies,
    tickets,
    contacts: {
      totalContacts: Math.max(0, recentContacts - suspiciousLeadExclusions),
      recentContacts: Math.max(0, recentContacts - suspiciousLeadExclusions),
      bySource: [],
    },
    pipelineDetected: {
      pipelineId: HUBSPOT_MAIN_PIPELINE_ID,
      dealCount: deals.length,
    },
    subscriptionPipelineDetected: {
      pipelineId: HUBSPOT_SUBSCRIPTION_PIPELINE_ID,
      dealCount: subscriptionDeals.length,
    },
    pipelineStageLabelsSource: pipelineResult.source,
    pipelineStages: (mainPipeline?.stages ?? []).map((stage) => ({
      stageId: stage.id,
      label: stage.label,
    })),
    repScoreboard,
    deals,
    subscriptionDeals,
    displayDeals,
    _meta: meta,
  };
}

// ── Contact analytics enrichment for attribution ──

interface ContactAnalyticsResult {
  contactIds: string[];
  primaryContactId: string | null;
  primaryContactEmail: string | null;
  primaryContactAnalytics: {
    createdAt?: string | null;
    source: string | null;
    sourceData1: string | null;
    sourceData2: string | null;
    firstSeenAt: string | null;
    lastSeenAt: string | null;
    firstUrl: string | null;
    lastUrl: string | null;
    numVisits: number | null;
    numPageViews: number | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
  } | undefined;
}

const CONTACT_ANALYTICS_PROPERTIES = [
  "email",
  "createdate",
  "hs_analytics_source",
  "hs_analytics_source_data_1",
  "hs_analytics_source_data_2",
  "hs_analytics_first_url",
  "hs_analytics_last_url",
  "hs_analytics_num_visits",
  "hs_analytics_num_page_views",
  "hs_analytics_first_timestamp",
  "hs_analytics_last_timestamp",
  "utm_source",
  "utm_medium",
  "utm_campaign",
];

type HubSpotAssociationBatchReadResponse = {
  results?: Array<{
    from?: { id?: string | number };
    to?: Array<{ toObjectId?: string | number }>;
  }>;
};

type HubSpotBatchReadResponse<TProps extends Record<string, string>> = {
  results?: Array<{ id?: string | number; properties?: TProps }>;
};

type HubSpotContactsSearchResponse = {
  results?: Array<{ id?: string | number; properties?: Record<string, string> }>;
  paging?: { next?: { after?: string } };
};

async function fetchDealContactAnalytics(
  baseUrl: string,
  headers: Record<string, string>,
  dealIds: string[],
): Promise<Map<string, ContactAnalyticsResult>> {
  const resultMap = new Map<string, ContactAnalyticsResult>();
  if (dealIds.length === 0) return resultMap;

  // Step 1: Batch-fetch deal→contact associations (100 per batch)
  const dealContactMap = new Map<string, string[]>();
  const batchSize = 100;

  for (let i = 0; i < dealIds.length; i += batchSize) {
    const batch = dealIds.slice(i, i + batchSize);
    try {
      const res = await fetch(`${baseUrl}/crm/v4/associations/deal/contact/batch/read`, {
        method: "POST",
        headers,
        cache: "no-store",
        body: JSON.stringify({ inputs: batch.map((id) => ({ id })) }),
      });
      if (!res.ok) continue;
      const data = await safeJson<HubSpotAssociationBatchReadResponse>(res, "hubspot deal contact associations");
      for (const result of data.results ?? []) {
        const fromId = String(result.from?.id ?? "");
        const toIds = (result.to ?? [])
          .map((t) => String(t.toObjectId ?? ""))
          .filter(Boolean);
        if (fromId && toIds.length > 0) {
          dealContactMap.set(fromId, toIds);
        }
      }
    } catch {
      // Non-critical — continue without associations for this batch
    }
  }

  // Step 2: Collect unique contact IDs and batch-fetch their analytics properties
  const allContactIds = new Set<string>();
  for (const contactIds of dealContactMap.values()) {
    for (const id of contactIds) allContactIds.add(id);
  }
  if (allContactIds.size === 0) {
    // No contacts found — populate empty results
    for (const dealId of dealIds) {
      resultMap.set(dealId, { contactIds: [], primaryContactId: null, primaryContactEmail: null, primaryContactAnalytics: undefined });
    }
    return resultMap;
  }

  const contactPropsMap = new Map<string, Record<string, string>>();
  const contactIdArray = [...allContactIds];

  for (let i = 0; i < contactIdArray.length; i += batchSize) {
    const batch = contactIdArray.slice(i, i + batchSize);
    try {
      const res = await fetch(`${baseUrl}/crm/v3/objects/contacts/batch/read`, {
        method: "POST",
        headers,
        cache: "no-store",
        body: JSON.stringify({
          inputs: batch.map((id) => ({ id })),
          properties: CONTACT_ANALYTICS_PROPERTIES,
        }),
      });
      if (!res.ok) continue;
      const data = await safeJson<HubSpotBatchReadResponse<Record<string, string>>>(res, "hubspot contact batch");
      for (const contact of data.results ?? []) {
        const id = String(contact.id ?? "");
        if (id) contactPropsMap.set(id, contact.properties ?? {});
      }
    } catch {
      // Non-critical — continue
    }
  }

  // Step 3: Assemble results per deal
  for (const dealId of dealIds) {
    const contactIds = dealContactMap.get(dealId) ?? [];
    const primaryContactId = contactIds[0] ?? null;
    const primaryProps = primaryContactId ? contactPropsMap.get(primaryContactId) : undefined;

    resultMap.set(dealId, {
      contactIds,
      primaryContactId,
      primaryContactEmail: primaryProps?.email ?? null,
      primaryContactAnalytics: primaryProps ? {
        createdAt: hubSpotTimestampToIso(primaryProps.createdate),
        source: primaryProps.hs_analytics_source || null,
        sourceData1: primaryProps.hs_analytics_source_data_1 || null,
        sourceData2: primaryProps.hs_analytics_source_data_2 || null,
        firstSeenAt: primaryProps.hs_analytics_first_timestamp
          ? hubSpotTimestampToIso(primaryProps.hs_analytics_first_timestamp)
          : null,
        lastSeenAt: primaryProps.hs_analytics_last_timestamp
          ? hubSpotTimestampToIso(primaryProps.hs_analytics_last_timestamp)
          : null,
        firstUrl: primaryProps.hs_analytics_first_url || null,
        lastUrl: primaryProps.hs_analytics_last_url || null,
        numVisits: primaryProps.hs_analytics_num_visits ? Number(primaryProps.hs_analytics_num_visits) : null,
        numPageViews: primaryProps.hs_analytics_num_page_views ? Number(primaryProps.hs_analytics_num_page_views) : null,
        utmSource: primaryProps.utm_source || null,
        utmMedium: primaryProps.utm_medium || null,
        utmCampaign: primaryProps.utm_campaign || null,
      } : undefined,
    });
  }

  return resultMap;
}

export async function fetchHubSpotContacts(
  accessToken: string,
  from: Date,
  to: Date,
  opts?: { maxPages?: number }
): Promise<HubSpotContactRecord[]> {
  const token = accessToken.trim();
  const baseUrl = "https://api.hubapi.com";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const envMaxPages = Number(process.env.HUBSPOT_CONTACTS_MAX_PAGES || "");
  const maxPages = Math.max(1, Math.min(opts?.maxPages ?? (Number.isFinite(envMaxPages) ? envMaxPages : 1000), 1000));

  const { owners } = await fetchHubSpotOwners({ baseUrl, headers });
  const ownerMap = Object.fromEntries(owners.map((owner) => [owner.id, owner.name]));

  const fromMs = from.getTime();
  const toMs = to.getTime();

  const out: HubSpotContactRecord[] = [];
  let after: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const url = `${baseUrl}/crm/v3/objects/contacts/search`;

    const body = {
      filterGroups: [
        {
          filters: [
            { propertyName: "createdate", operator: "GTE", value: String(fromMs) },
            { propertyName: "createdate", operator: "LTE", value: String(toMs) },
          ],
        },
      ],
      sorts: ["createdate"],
      properties: [
        "email",
        "createdate",
        "hubspot_owner_id",
        "hs_analytics_source",
        "hs_analytics_num_visits",
        "hs_analytics_num_page_views",
        "utm_source",
        "utm_medium",
        "utm_campaign",
      ],
      limit: 100,
      after,
    };

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "unknown");
      throw new Error(`HubSpot contacts API error ${res.status}: ${text}`);
    }

    const data = await safeJson<HubSpotContactsSearchResponse>(res, "hubspot contacts");
    const results = data.results || [];

    for (const contact of results) {
      const props = contact.properties || {};
      const ownerId = props.hubspot_owner_id ? String(props.hubspot_owner_id) : null;
      const email = props.email ? String(props.email) : null;
      const rawSource = props.hs_analytics_source ? String(props.hs_analytics_source) : null;
      const syntheticDeal: HubSpotDealRecord = {
        dealId: String(contact.id ?? ""),
        dealName: email?.split("@")[0] || "Untitled contact",
        stageId: "contact",
        stageLabel: "Lead",
        amount: 0,
        source: rawSource || "Unknown",
        ownerId,
        repName: ownerId ? ownerMap[ownerId] || "Unknown" : "Unassigned",
        updatedAt: null,
        createdAt: hubSpotTimestampToIso(props.createdate),
        closedAt: null,
        stripeCustomerId: null,
        pipelineId: null,
        contactIds: [String(contact.id ?? "")].filter(Boolean),
        primaryContactId: String(contact.id ?? "") || null,
        primaryContactEmail: email,
        primaryContactAnalytics: {
          createdAt: hubSpotTimestampToIso(props.createdate),
          source: rawSource,
          sourceData1: null,
          sourceData2: null,
          firstSeenAt: null,
          lastSeenAt: null,
          firstUrl: null,
          lastUrl: null,
          numVisits: props.hs_analytics_num_visits ? Number(props.hs_analytics_num_visits) : null,
          numPageViews: props.hs_analytics_num_page_views ? Number(props.hs_analytics_num_page_views) : null,
          utmSource: props.utm_source || null,
          utmMedium: props.utm_medium || null,
          utmCampaign: props.utm_campaign || null,
        },
      };
      if (isSuspiciousHubSpotLead(syntheticDeal)) continue;

      out.push({
        contactId: String(contact.id ?? ""),
        createdAt: hubSpotTimestampToIso(props.createdate),
        ownerId,
        repName: ownerId ? ownerMap[ownerId] || "Unknown" : "Unassigned",
        rawSource,
      });
    }

    after = data.paging?.next?.after;
    if (!after || results.length === 0) break;
  }

  return out;
}

// ═══════════════════════════════════════════════════════════
// STRIPE FETCHER
// ═══════════════════════════════════════════════════════════

interface StripeSubItem {
  price: {
    unit_amount: number | string;
    recurring?: { interval?: string; interval_count?: number };
  };
}

interface StripeSub extends Record<string, unknown> {
  id: string;
  items: { data: StripeSubItem[] };
  customer: string | { id?: string | null; email?: string | null } | null;
  canceled_at: number | null;
}

interface StripeCharge extends Record<string, unknown> {
  id?: string;
  amount: number | string;
  created: number | string | null | undefined;
  status: string;
}

type StripeInvoice = Record<string, unknown> & {
  id?: string;
  created?: number | string | null;
};

type StripeDispute = Record<string, unknown> & {
  id?: string;
  created?: number | string | null;
};

type StripeRefund = Record<string, unknown> & {
  id?: string;
  created?: number | string | null;
};

function stripeSubscriptionItemMonthlyAmount(item: StripeSubItem): number {
  if (!item.price) return 0;
  const unitAmount = readStripeAmountCents(item.price.unit_amount) / 100;
  const interval = item.price.recurring?.interval || "month";
  const intervalCount = item.price.recurring?.interval_count || 1;

  if (interval === "year") {
    return unitAmount / (12 * intervalCount);
  }
  if (interval === "week") {
    return (unitAmount * 52) / (12 * intervalCount);
  }
  if (interval === "day") {
    return (unitAmount * 365) / (12 * intervalCount);
  }
  return unitAmount / intervalCount;
}

function stripeSubscriptionMonthlyAmount(subscription: StripeSub): number {
  return (subscription.items?.data ?? []).reduce(
    (sum, item) => sum + stripeSubscriptionItemMonthlyAmount(item),
    0,
  );
}

function stripeSubscriptionCustomerId(customer: StripeSub["customer"]): string {
  if (typeof customer === "string" && customer.trim().length > 0) {
    return customer.trim();
  }

  if (
    customer &&
    typeof customer === "object" &&
    typeof customer.id === "string" &&
    customer.id.trim().length > 0
  ) {
    return customer.id.trim();
  }

  return "Unknown customer";
}

function stripeSubscriptionCustomerEmail(customer: StripeSub["customer"]): string | null {
  if (
    customer &&
    typeof customer === "object" &&
    typeof customer.email === "string" &&
    customer.email.trim().length > 0
  ) {
    return customer.email.trim().toLowerCase();
  }

  return null;
}

function normalizeEmailDomain(email: string | null): string | null {
  if (!email || !email.includes("@")) return null;
  const [, domain] = email.split("@");
  const normalized = domain?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function readStripeAmountCents(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;

  const normalized = value.trim().replace(/[$,\s]/g, "");
  if (!normalized) return 0;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readStripeCreatedSeconds(value: unknown): number | null {
  const seconds =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value.trim())
        : null;

  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }

  const millis = seconds * 1000;
  return Number.isNaN(new Date(millis).getTime()) ? null : seconds;
}

export async function fetchStripeData(
  apiKey: string,
  options?: { fromDate?: Date; toDate?: Date; maxPages?: number }
): Promise<StripeData> {
  const headers = { Authorization: `Bearer ${apiKey}` };
  const baseUrl = "https://api.stripe.com/v1";
  const maxPages =
    typeof options?.maxPages === "number" && Number.isFinite(options.maxPages)
      ? Math.max(1, Math.floor(options.maxPages))
      : 1000;
  const now = Math.floor(Date.now() / 1000);
  const rangeFrom = options?.fromDate ?? null;
  const rangeTo = options?.toDate ?? null;
  const useRange =
    Boolean(rangeFrom && rangeTo) &&
    !Number.isNaN(rangeFrom?.getTime() ?? NaN) &&
    !Number.isNaN(rangeTo?.getTime() ?? NaN) &&
    Boolean(rangeFrom && rangeTo && rangeFrom <= rangeTo);

  const rangeStart = useRange ? Math.floor(rangeFrom!.getTime() / 1000) : now - 30 * 24 * 60 * 60;
  const rangeEnd = useRange ? Math.floor(rangeTo!.getTime() / 1000) : now;
  const rangeDays = Math.max(1, Math.ceil((rangeEnd - rangeStart) / (24 * 60 * 60)));
  const previousStart = rangeStart - rangeDays * 24 * 60 * 60;
  const previousEnd = rangeEnd - rangeDays * 24 * 60 * 60;

  const fetchStripe = async (url: string): Promise<Response> =>
    fetch(url, { headers, cache: "no-store" });

  const readStripeErrorMessage = async (response: Response): Promise<string> => {
    const text = await response.text().catch(() => "");
    if (!text) return response.statusText || "Stripe API request failed";
    try {
      const parsed = JSON.parse(text) as {
        error?: { message?: string };
        message?: string;
      };
      return parsed.error?.message ?? parsed.message ?? text;
    } catch {
      return text;
    }
  };

  const fetchSubscriptionsByStatus = async (status: string): Promise<{
    subscriptions: StripeSub[];
    pagesFetched: number;
    truncated: boolean;
  }> => {
    const subscriptions: StripeSub[] = [];
    let startingAfter: string | undefined;
    let pagesFetched = 0;
    let truncated = false;

    for (let page = 0; page < maxPages; page++) {
      let url = `${baseUrl}/subscriptions?limit=100&status=${encodeURIComponent(status)}&expand[]=data.customer`;
      if (startingAfter) url += `&starting_after=${startingAfter}`;

      const res = await fetchStripe(url);
      if (!res.ok) {
        throw new Error(`Stripe subscriptions(${status}) error ${res.status}`);
      }

      const data = await safeJson<{ data?: StripeSub[]; has_more?: boolean }>(
        res,
        `stripe subscriptions (${status})`
      );
      const batch = data.data ?? [];
      subscriptions.push(...batch);
      pagesFetched += 1;

      if (!data.has_more || batch.length === 0) break;
      startingAfter = batch[batch.length - 1]?.id;
      if (!startingAfter) break;
      if (page === maxPages - 1) {
        truncated = true;
        break;
      }
    }

    return { subscriptions, pagesFetched, truncated };
  };

  const fetchPastDueAndTrialingCounts = async (): Promise<{
    pastDueCount: number;
    trialingCount: number;
    pastDueSubscriptions: StripeSub[];
    trialingSubscriptions: StripeSub[];
    truncatedResources: string[];
    pagesFetched: Record<string, number>;
  }> => {
    try {
      const [pastDueResult, trialingResult] = await Promise.all([
        fetchSubscriptionsByStatus("past_due"),
        fetchSubscriptionsByStatus("trialing"),
      ]);
      return {
        pastDueCount: pastDueResult.subscriptions.length,
        trialingCount: trialingResult.subscriptions.length,
        pastDueSubscriptions: pastDueResult.subscriptions,
        trialingSubscriptions: trialingResult.subscriptions,
        truncatedResources: [
          ...(pastDueResult.truncated ? ["pastDueSubscriptions"] : []),
          ...(trialingResult.truncated ? ["trialingSubscriptions"] : []),
        ],
        pagesFetched: {
          pastDueSubscriptions: pastDueResult.pagesFetched,
          trialingSubscriptions: trialingResult.pagesFetched,
        },
      };
    } catch {
      // Non-critical
    }
    return {
      pastDueCount: 0,
      trialingCount: 0,
      pastDueSubscriptions: [],
      trialingSubscriptions: [],
      truncatedResources: [],
      pagesFetched: {
        pastDueSubscriptions: 0,
        trialingSubscriptions: 0,
      },
    };
  };

  const fetchCharges = async (createdGte: number, createdLte: number): Promise<{
    charges: StripeCharge[];
    pagesFetched: number;
    truncated: boolean;
  }> => {
    const allCharges: StripeCharge[] = [];
    let startingAfter: string | undefined;
    let pagesFetched = 0;
    let truncated = false;

    for (let page = 0; page < maxPages; page++) {
      let chargesUrl = `${baseUrl}/charges?limit=100&created[gte]=${createdGte}&created[lte]=${createdLte}`;
      if (startingAfter) chargesUrl += `&starting_after=${startingAfter}`;

      const chargesRes = await fetchStripe(chargesUrl);
      if (!chargesRes.ok) {
        throw new Error(
          `Stripe charges error (${chargesRes.status}): ${await readStripeErrorMessage(chargesRes)}`
        );
      }
      const chargesData = await safeJson<{ data?: StripeCharge[]; has_more?: boolean }>(chargesRes, "stripe charges");
      const batch = chargesData.data || [];
      allCharges.push(...batch);
      pagesFetched += 1;

      if (!chargesData.has_more || batch.length === 0) break;
      startingAfter = batch[batch.length - 1].id;
      if (!startingAfter) break;
      if (page === maxPages - 1) {
        truncated = true;
        break;
      }
    }
    return { charges: allCharges, pagesFetched, truncated };
  };

  const fetchInvoices = async (createdGte: number, createdLte: number): Promise<{
    invoices: StripeInvoice[];
    pagesFetched: number;
    truncated: boolean;
    available: boolean;
    error: string | null;
  }> => {
    const invoices: StripeInvoice[] = [];
    let startingAfter: string | undefined;
    let pagesFetched = 0;

    try {
      for (let page = 0; page < maxPages; page++) {
        const url = new URL(`${baseUrl}/invoices`);
        url.searchParams.set("limit", "100");
        url.searchParams.set("created[gte]", String(createdGte));
        url.searchParams.set("created[lte]", String(createdLte));
        url.searchParams.append("expand[]", "data.customer");
        url.searchParams.append("expand[]", "data.lines.data.price.product");
        if (startingAfter) url.searchParams.set("starting_after", startingAfter);

        const response = await fetchStripe(url.toString());
        if (!response.ok) {
          return {
            invoices,
            pagesFetched,
            truncated: false,
            available: false,
            error: `Stripe invoices error (${response.status}): ${await readStripeErrorMessage(response)}`,
          };
        }

        const payload = await safeJson<{ data?: StripeInvoice[]; has_more?: boolean }>(
          response,
          "stripe invoices",
        );
        const batch = payload.data ?? [];
        invoices.push(...batch);
        pagesFetched += 1;

        if (!payload.has_more || batch.length === 0) {
          return { invoices, pagesFetched, truncated: false, available: true, error: null };
        }
        startingAfter = batch[batch.length - 1]?.id;
        if (!startingAfter) {
          return { invoices, pagesFetched, truncated: false, available: true, error: null };
        }
        if (page === maxPages - 1) {
          return { invoices, pagesFetched, truncated: true, available: true, error: null };
        }
      }
    } catch (error) {
      return {
        invoices,
        pagesFetched,
        truncated: false,
        available: false,
        error: error instanceof Error ? error.message : "Stripe invoices request failed",
      };
    }

    return { invoices, pagesFetched, truncated: false, available: true, error: null };
  };

  const fetchDisputes = async (createdGte: number, createdLte: number): Promise<{
    disputes: StripeDispute[];
    pagesFetched: number;
    truncated: boolean;
    available: boolean;
    error: string | null;
  }> => {
    const disputes: StripeDispute[] = [];
    let startingAfter: string | undefined;
    let pagesFetched = 0;

    try {
      for (let page = 0; page < maxPages; page++) {
        const url = new URL(`${baseUrl}/disputes`);
        url.searchParams.set("limit", "100");
        url.searchParams.set("created[gte]", String(createdGte));
        url.searchParams.set("created[lte]", String(createdLte));
        url.searchParams.append("expand[]", "data.charge");
        if (startingAfter) url.searchParams.set("starting_after", startingAfter);

        const response = await fetchStripe(url.toString());
        if (!response.ok) {
          return {
            disputes,
            pagesFetched,
            truncated: false,
            available: false,
            error: `Stripe disputes error (${response.status}): ${await readStripeErrorMessage(response)}`,
          };
        }

        const payload = await safeJson<{ data?: StripeDispute[]; has_more?: boolean }>(
          response,
          "stripe disputes",
        );
        const batch = payload.data ?? [];
        disputes.push(...batch);
        pagesFetched += 1;

        if (!payload.has_more || batch.length === 0) {
          return { disputes, pagesFetched, truncated: false, available: true, error: null };
        }
        startingAfter = batch[batch.length - 1]?.id;
        if (!startingAfter) {
          return { disputes, pagesFetched, truncated: false, available: true, error: null };
        }
        if (page === maxPages - 1) {
          return { disputes, pagesFetched, truncated: true, available: true, error: null };
        }
      }
    } catch (error) {
      return {
        disputes,
        pagesFetched,
        truncated: false,
        available: false,
        error: error instanceof Error ? error.message : "Stripe disputes request failed",
      };
    }

    return { disputes, pagesFetched, truncated: false, available: true, error: null };
  };

  const fetchRefunds = async (createdGte: number, createdLte: number): Promise<{
    refunds: StripeRefund[];
    pagesFetched: number;
    truncated: boolean;
    available: boolean;
    error: string | null;
  }> => {
    const refunds: StripeRefund[] = [];
    let startingAfter: string | undefined;
    let pagesFetched = 0;

    try {
      for (let page = 0; page < maxPages; page++) {
        const url = new URL(`${baseUrl}/refunds`);
        url.searchParams.set("limit", "100");
        url.searchParams.set("created[gte]", String(createdGte));
        url.searchParams.set("created[lte]", String(createdLte));
        url.searchParams.append("expand[]", "data.charge");
        url.searchParams.append("expand[]", "data.payment_intent");
        if (startingAfter) url.searchParams.set("starting_after", startingAfter);

        const response = await fetchStripe(url.toString());
        if (!response.ok) {
          return {
            refunds,
            pagesFetched,
            truncated: false,
            available: false,
            error: `Stripe refunds error (${response.status}): ${await readStripeErrorMessage(response)}`,
          };
        }

        const payload = await safeJson<{ data?: StripeRefund[]; has_more?: boolean }>(
          response,
          "stripe refunds",
        );
        const batch = payload.data ?? [];
        refunds.push(...batch);
        pagesFetched += 1;

        if (!payload.has_more || batch.length === 0) {
          return { refunds, pagesFetched, truncated: false, available: true, error: null };
        }
        startingAfter = batch[batch.length - 1]?.id;
        if (!startingAfter) {
          return { refunds, pagesFetched, truncated: false, available: true, error: null };
        }
        if (page === maxPages - 1) {
          return { refunds, pagesFetched, truncated: true, available: true, error: null };
        }
      }
    } catch (error) {
      return {
        refunds,
        pagesFetched,
        truncated: false,
        available: false,
        error: error instanceof Error ? error.message : "Stripe refunds request failed",
      };
    }

    return { refunds, pagesFetched, truncated: false, available: true, error: null };
  };

  const [
    activeSubResult,
    canceledSubResult,
    counts,
    chargesInRangeResult,
    chargesPrevRangeResult,
    invoicesResult,
    disputesResult,
    refundsResult,
  ] = await Promise.all([
    fetchSubscriptionsByStatus("active"),
    fetchSubscriptionsByStatus("canceled"),
    fetchPastDueAndTrialingCounts(),
    fetchCharges(rangeStart, rangeEnd),
    fetchCharges(previousStart, previousEnd),
    fetchInvoices(rangeStart, rangeEnd),
    fetchDisputes(rangeStart, rangeEnd),
    fetchRefunds(rangeStart, rangeEnd),
  ]);
  const activeSubs = activeSubResult.subscriptions;
  const canceledSubs = canceledSubResult.subscriptions;
  const chargesInRange = chargesInRangeResult.charges;
  const chargesPrevRange = chargesPrevRangeResult.charges;

  // ── Calculate MRR — normalize yearly/quarterly subscriptions to monthly ──
  const mrr = activeSubs.reduce((sum: number, s: StripeSub) => {
    return sum + stripeSubscriptionMonthlyAmount(s);
  }, 0);

  const { pastDueCount, trialingCount } = counts;

  // ── Bucket charges by month for trend ──
  const monthBuckets: Record<string, number> = {};

  let revInRange = 0;
  let revPrev = 0;
  let succeeded = 0;
  let failed = 0;
  for (const charge of chargesInRange) {
    const created = readStripeCreatedSeconds(charge.created);
    if (created === null) continue;

    const amt = readStripeAmountCents(charge.amount) / 100;
    const chargeDate = new Date(created * 1000);
    const monthKey = chargeDate.toLocaleDateString("en-US", { month: "short", year: "2-digit" });

    if (charge.status === "succeeded") {
      monthBuckets[monthKey] = (monthBuckets[monthKey] || 0) + amt;
      revInRange += amt;
      succeeded++;
    } else if (charge.status === "failed") {
      failed++;
    }
  }
  for (const charge of chargesPrevRange) {
    const created = readStripeCreatedSeconds(charge.created);
    if (created === null) continue;

    if (charge.status === "succeeded") {
      revPrev += readStripeAmountCents(charge.amount) / 100;
    }
  }

  const revenueGrowth = revPrev > 0 ? ((revInRange - revPrev) / revPrev) * 100 : 0;

  // ── Build revenue trend (last 6 months) ──
  const trend: { month: string; revenue: number }[] = [];
  if (useRange) {
    // Bucket by day for custom ranges.
    const dayBuckets: Record<string, number> = {};
    for (const charge of chargesInRange) {
      if (charge.status !== "succeeded") continue;
      const created = readStripeCreatedSeconds(charge.created);
      if (created === null) continue;
      const dayKey = new Date(created * 1000).toISOString().slice(0, 10);
      dayBuckets[dayKey] = (dayBuckets[dayKey] || 0) + readStripeAmountCents(charge.amount) / 100;
    }
    const keys = Object.keys(dayBuckets).sort();
    for (const key of keys) {
      trend.push({ month: key, revenue: dayBuckets[key] || 0 });
    }
  } else {
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      trend.push({
        month: key,
        revenue: monthBuckets[key] || 0,
      });
    }
  }

  const recentChurn = [...canceledSubs]
    .filter((subscription) => typeof subscription.canceled_at === "number" && subscription.canceled_at > 0)
    .sort((a, b) => (b.canceled_at ?? 0) - (a.canceled_at ?? 0))
    .slice(0, 5)
    .map((subscription: StripeSub) => ({
      customer: stripeSubscriptionCustomerId(subscription.customer),
      canceledAt: new Date((subscription.canceled_at || 0) * 1000).toISOString(),
      amount: stripeSubscriptionMonthlyAmount(subscription),
    }));

  const truncatedResources = [
    ...(activeSubResult.truncated ? ["activeSubscriptions"] : []),
    ...(canceledSubResult.truncated ? ["canceledSubscriptions"] : []),
    ...counts.truncatedResources,
    ...(chargesInRangeResult.truncated ? ["chargesInRange"] : []),
    ...(chargesPrevRangeResult.truncated ? ["chargesPreviousRange"] : []),
    ...(invoicesResult.truncated ? ["invoices"] : []),
    ...(disputesResult.truncated ? ["disputes"] : []),
    ...(refundsResult.truncated ? ["refunds"] : []),
  ];
  const meta = makeMeta();
  meta.truncated = truncatedResources.length > 0;
  meta.truncatedResources = truncatedResources;
  meta.diagnostics = {
    maxPages,
    pagesFetched: {
      activeSubscriptions: activeSubResult.pagesFetched,
      canceledSubscriptions: canceledSubResult.pagesFetched,
      ...counts.pagesFetched,
      chargesInRange: chargesInRangeResult.pagesFetched,
      chargesPreviousRange: chargesPrevRangeResult.pagesFetched,
      invoices: invoicesResult.pagesFetched,
      disputes: disputesResult.pagesFetched,
      refunds: refundsResult.pagesFetched,
    },
    invoicesFetched: invoicesResult.invoices.length,
    invoicesAvailable: invoicesResult.available,
    invoicesError: invoicesResult.error,
    disputesFetched: disputesResult.disputes.length,
    disputesAvailable: disputesResult.available,
    disputesError: disputesResult.error,
    refundsFetched: refundsResult.refunds.length,
    refundsAvailable: refundsResult.available,
    refundsError: refundsResult.error,
  };

  return {
    revenue: {
      mrr: Math.round(mrr * 100) / 100,
      mrrChange: 0,
      totalRevenue30d: revInRange,
      totalRevenuePrev30d: revPrev,
      revenueGrowth,
      avgRevenuePerCustomer: activeSubs.length > 0 ? mrr / activeSubs.length : 0,
    },
    subscriptions: {
      active: activeSubs.length,
      pastDue: pastDueCount,
      canceled: canceledSubs.length,
      trialing: trialingCount,
      churnRate: activeSubs.length + canceledSubs.length > 0
        ? (canceledSubs.length / (activeSubs.length + canceledSubs.length)) * 100 : 0,
      recentChurnEvents: recentChurn,
      activeCustomerRefs: activeSubs.map((subscription) => {
        const customerId = stripeSubscriptionCustomerId(subscription.customer);
        const email = stripeSubscriptionCustomerEmail(subscription.customer);
        return {
          customerId,
          email,
          emailDomain: normalizeEmailDomain(email),
        };
      }),
    },
    payments: {
      succeeded,
      failed,
      successRate: succeeded + failed > 0 ? (succeeded / (succeeded + failed)) * 100 : 0,
    },
    revenueTrend: trend,
    stripeObjects: {
      subscriptions: [
        ...activeSubs,
        ...canceledSubs,
        ...counts.pastDueSubscriptions,
        ...counts.trialingSubscriptions,
      ],
      charges: chargesInRange,
      previousCharges: chargesPrevRange,
      invoices: invoicesResult.invoices,
      disputes: disputesResult.disputes,
      refunds: refundsResult.refunds,
    },
    _meta: meta,
  };
}

type StripeChargeListResponse = {
  data: Array<{
    id: string;
    amount: number | string;
    amount_refunded?: number | string;
    created: number | string | null | undefined;
    currency?: string;
    status?: string;
    paid?: boolean;
  }>;
  has_more?: boolean;
};

export type StripeChargeLite = {
  chargeId: string;
  created: number; // seconds since epoch
  currency: string | null;
  netAmountCents: number;
};

export type StripeChargesByCustomerId = Record<string, StripeChargeLite[]>;

export type StripeCustomerChargeRequest = {
  customerId: string;
  createdGte: Date;
  createdLte: Date;
};

function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const pending = [...items];
  const running = new Set<Promise<void>>();

  const enqueue = async (): Promise<void> => {
    while (pending.length > 0 && running.size < concurrency) {
      const item = pending.shift()!;
      const p = fn(item).finally(() => running.delete(p));
      running.add(p);
    }

    if (running.size === 0) return;
    await Promise.race(running);
    return enqueue();
  };

  await enqueue();
  await Promise.all(running);
}

async function fetchStripeChargesForCustomer(
  apiKey: string,
  request: StripeCustomerChargeRequest
): Promise<StripeChargeLite[]> {
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
  const baseUrl = "https://api.stripe.com/v1";

  const gte = toUnixSeconds(request.createdGte);
  const lte = toUnixSeconds(request.createdLte);

  const all: StripeChargeLite[] = [];
  let startingAfter: string | undefined;

  for (let page = 0; page < 1000; page++) {
    const url = new URL(`${baseUrl}/charges`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("customer", request.customerId);
    url.searchParams.set("created[gte]", String(gte));
    url.searchParams.set("created[lte]", String(lte));
    if (startingAfter) url.searchParams.set("starting_after", startingAfter);

    const res = await fetch(url.toString(), { headers, cache: "no-store" });
    if (!res.ok) {
      const text = await res.text().catch(() => "unknown");
      throw new Error(`Stripe charges error (${res.status}) for customer ${request.customerId}: ${text}`);
    }

    const body = await safeJson<StripeChargeListResponse>(res, "stripe charges list");
    const batch = body.data ?? [];

    for (const charge of batch) {
      if (typeof charge.id !== "string" || charge.id.trim().length === 0) continue;
      if (charge.status !== "succeeded") continue;
      if (charge.paid === false) continue;
      const created = readStripeCreatedSeconds(charge.created);
      if (created === null) continue;

      const amountRefunded = readStripeAmountCents(charge.amount_refunded);
      const net = Math.max(0, readStripeAmountCents(charge.amount) - amountRefunded);

      all.push({
        chargeId: charge.id.trim(),
        created,
        currency: charge.currency ?? null,
        netAmountCents: net,
      });
    }

    if (!body.has_more || batch.length === 0) break;
    startingAfter = batch[batch.length - 1]?.id;
    if (!startingAfter) break;
  }

  return all;
}

export async function fetchStripeChargesByCustomer(
  apiKey: string,
  requests: StripeCustomerChargeRequest[],
  opts?: { concurrency?: number }
): Promise<StripeChargesByCustomerId> {
  const concurrency = Math.max(1, Math.min(opts?.concurrency ?? 5, 25));

  const uniqueRequestsByCustomer = new Map<string, StripeCustomerChargeRequest>();
  for (const request of requests) {
    const existing = uniqueRequestsByCustomer.get(request.customerId);
    if (!existing) {
      uniqueRequestsByCustomer.set(request.customerId, request);
      continue;
    }

    uniqueRequestsByCustomer.set(request.customerId, {
      customerId: request.customerId,
      createdGte: existing.createdGte < request.createdGte ? existing.createdGte : request.createdGte,
      createdLte: existing.createdLte > request.createdLte ? existing.createdLte : request.createdLte,
    });
  }

  const output: StripeChargesByCustomerId = {};
  const requestsToRun = [...uniqueRequestsByCustomer.values()];

  await runWithConcurrency(requestsToRun, concurrency, async (request) => {
    output[request.customerId] = await fetchStripeChargesForCustomer(apiKey, request);
  });

  return output;
}

// ═══════════════════════════════════════════════════════════
// MERCURY FETCHER
// ═══════════════════════════════════════════════════════════

export async function fetchMercuryData(
  apiKey: string,
  options?: { fromDate?: Date; toDate?: Date; maxPages?: number; expenseMappings?: MercuryExpenseMapping[] }
): Promise<MercuryData> {
  type MercuryAccount = {
    id?: string;
    name?: string;
    currentBalance?: number | string;
    availableBalance?: number | string;
    type?: string;
    status?: string;
  };

  type MercuryTransaction = {
    id?: string;
    accountId?: string;
    postedAt?: string;
    createdAt?: string;
    timestamp?: string;
    status?: string;
    amount?: number | string;
    kind?: string | null;
    mercuryCategory?: string | null;
    description?: string | null;
    bankDescription?: string | null;
    note?: string | null;
    counterpartyName?: string | null;
    counterpartyNickname?: string | null;
    merchantName?: string | null;
    externalMemo?: string | null;
    memo?: string | null;
    categoryData?: {
      categoryDataName?: string | null;
    } | null;
    details?: {
      counterpartyName?: string | null;
      merchantName?: string | null;
      description?: string | null;
    } | null;
  };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const baseUrl = "https://api.mercury.com/api/v1";
  const maxPages =
    typeof options?.maxPages === "number" && Number.isFinite(options.maxPages)
      ? Math.max(1, Math.floor(options.maxPages))
      : 1000;
  const readMercuryNumber = (value: unknown): number => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value !== "string") return 0;

    const normalized = value.trim().replace(/[$,\s]/g, "");
    if (!normalized) return 0;

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const emptyExpenseBreakdown = (): Record<ExpenseCategory, number> => ({
    cogs: 0,
    payroll: 0,
    marketing: 0,
    infrastructure: 0,
    ops: 0,
    other: 0,
  });
  const MERCURY_CATEGORY_KEYWORDS: Record<ExpenseCategory, string[]> = {
    cogs: [
      "cost of goods",
      "cogs",
      "hosting",
      "cloud",
      "compute",
      "api usage",
      "payment processing",
      "merchant fee",
      "processing fee",
      "aws",
      "google cloud",
      "gcp",
      "azure",
      "openai",
      "anthropic",
      "twilio",
      "sendgrid",
    ],
    payroll: [
      "payroll",
      "salary",
      "wages",
      "benefits",
      "contractor",
      "gusto",
      "rippling",
      "deel",
      "adp",
      "paychex",
    ],
    marketing: [
      "marketing",
      "advertising",
      "ad spend",
      "paid search",
      "paid social",
      "google ads",
      "meta ads",
      "facebook ads",
      "linkedin ads",
      "reddit ads",
      "hubspot",
      "semrush",
    ],
    infrastructure: [
      "software",
      "saas",
      "tools",
      "monitoring",
      "security",
      "domain",
      "dns",
      "vercel",
      "cloudflare",
      "github",
      "notion",
      "slack",
      "zoom",
      "linear",
      "figma",
      "railway",
    ],
    ops: [
      "operations",
      "office",
      "rent",
      "travel",
      "legal",
      "insurance",
      "tax",
      "bank fee",
      "wire fee",
      "accounting",
      "bookkeeping",
      "admin",
      "general & administrative",
      "g&a",
      "mercury fee",
    ],
    other: [],
  };
  const classifyMercuryExpense = (tx: MercuryTransaction): ExpenseCategory => {
    const haystack = [
      tx.categoryData?.categoryDataName ?? tx.mercuryCategory ?? "",
      tx.counterpartyName ?? tx.details?.counterpartyName ?? "",
      tx.merchantName ?? tx.details?.merchantName ?? "",
      tx.description ?? tx.details?.description ?? "",
      tx.bankDescription ?? "",
      tx.note ?? "",
      tx.externalMemo ?? "",
      tx.memo ?? "",
    ]
      .join(" ")
      .trim()
      .toLowerCase();

    if (!haystack) return "other";

    for (const mapping of options?.expenseMappings ?? []) {
      if (haystack.includes(mapping.match.toLowerCase())) {
        return mapping.category;
      }
    }

    for (const category of ["payroll", "marketing", "cogs", "infrastructure", "ops"] as const) {
      if (MERCURY_CATEGORY_KEYWORDS[category].some((keyword) => haystack.includes(keyword))) {
        return category;
      }
    }

    return "other";
  };
  const transactionDateKey = (tx: MercuryTransaction): string | null => {
    const timestamp = tx.postedAt || tx.createdAt || tx.timestamp || "";
    if (!timestamp) return null;
    const parsed = Date.parse(timestamp);
    if (!Number.isFinite(parsed)) return null;
    return new Date(parsed).toISOString().split("T")[0] ?? null;
  };
  const textSuggestsInternalTransfer = (tx: MercuryTransaction): boolean => {
    const fields = [
      tx.bankDescription,
      tx.counterpartyName,
      tx.counterpartyNickname,
      tx.mercuryCategory,
      tx.description,
      tx.note,
    ]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim().toLowerCase());

    return fields.some((value) =>
      value.includes("internal transfer") ||
      value.includes("between your mercury accounts") ||
      value.includes("between your accounts")
    );
  };
  const filterInternalTransferPairs = (ledgerTransactions: MercuryTransaction[]): MercuryTransaction[] => {
    const grouped = new Map<string, MercuryTransaction[]>();

    for (const tx of ledgerTransactions) {
      const amount = readMercuryNumber(tx.amount);
      const dateKey = transactionDateKey(tx);
      if (!dateKey || !Number.isFinite(amount) || amount === 0) continue;
      const key = `${dateKey}:${Math.abs(amount)}`;
      const bucket = grouped.get(key) ?? [];
      bucket.push(tx);
      grouped.set(key, bucket);
    }

    const excludedIds = new Set<string>();
    const excludedRefs = new Set<MercuryTransaction>();

    for (const bucket of grouped.values()) {
      const negatives = bucket.filter((tx) => readMercuryNumber(tx.amount) < 0);
      const positives = bucket.filter((tx) => readMercuryNumber(tx.amount) > 0);
      if (negatives.length === 0 || positives.length === 0) continue;

      const hinted = bucket.some(textSuggestsInternalTransfer);
      if (!hinted && (negatives.length !== 1 || positives.length !== 1)) continue;

      const availablePositives = [...positives];
      for (const debit of negatives) {
        const matchIndex = availablePositives.findIndex((credit) => credit.accountId !== debit.accountId);
        if (matchIndex === -1) continue;
        const [credit] = availablePositives.splice(matchIndex, 1);
        if (debit.id) excludedIds.add(debit.id);
        else excludedRefs.add(debit);
        if (credit.id) excludedIds.add(credit.id);
        else excludedRefs.add(credit);
      }
    }

    return ledgerTransactions.filter((tx) => {
      if (tx.id && excludedIds.has(tx.id)) return false;
      if (!tx.id && excludedRefs.has(tx)) return false;
      return true;
    });
  };

  const fetchMercuryAccounts = async (): Promise<{
    accounts: MercuryAccount[];
    pagesFetched: number;
    truncated: boolean;
  }> => {
    const allAccounts: MercuryAccount[] = [];
    const limit = 1000;
    let startAfter: string | null = null;
    let pagesFetched = 0;
    let truncated = false;

    for (let page = 0; page < maxPages; page += 1) {
      const params = new URLSearchParams({
        limit: String(limit),
        order: "asc",
      });
      if (startAfter) params.set("start_after", startAfter);

      const accountsRes = await fetch(`${baseUrl}/accounts?${params.toString()}`, {
        headers,
        cache: "no-store",
      });
      if (!accountsRes.ok) {
        throw new Error(`Mercury accounts error ${accountsRes.status}`);
      }

      const accountsData = await safeJson<{ accounts?: MercuryAccount[] }>(accountsRes, "mercury accounts");
      const pageAccounts = accountsData.accounts ?? [];
      allAccounts.push(...pageAccounts);
      pagesFetched += 1;

      if (pageAccounts.length < limit) break;
      const lastId = pageAccounts[pageAccounts.length - 1]?.id;
      if (!lastId || lastId === startAfter) break;
      if (page === maxPages - 1) {
        truncated = true;
        break;
      }
      startAfter = lastId;
    }

    return { accounts: allAccounts, pagesFetched, truncated };
  };

  const accountResult = await fetchMercuryAccounts();
  const accounts = accountResult.accounts.map((account) => ({
    accountId: account.id ?? "",
    accountName: account.name ?? "Unknown account",
    balance: readMercuryNumber(account.currentBalance),
    type: account.type ?? "checking",
  }));

  try {
    const treasuryRes = await fetch(`${baseUrl}/treasury?limit=1000`, {
      headers,
      cache: "no-store",
    });
    if (treasuryRes.ok) {
      const treasuryData = await safeJson<{ accounts?: MercuryAccount[] }>(treasuryRes, "mercury treasury");
      const treasuryAccounts = (treasuryData.accounts ?? [])
        .filter((account) => account.status !== "deleted" && account.status !== "archived")
        .map((account, index) => ({
          accountId: account.id ?? `treasury-${index}`,
          accountName: account.name ?? `Mercury Treasury${index > 0 ? ` ${index + 1}` : ""}`,
          balance: readMercuryNumber(account.currentBalance),
          type: "treasury",
        }));
      accounts.push(...treasuryAccounts);
    }
  } catch {
    // Older Mercury tokens/accounts may not expose Treasury. Keep bank cash available.
  }

  const isTreasuryAccount = (account: { type?: string | null }): boolean =>
    (account.type ?? "").toLowerCase() === "treasury";
  const bankCash = accounts
    .filter((account) => !isTreasuryAccount(account))
    .reduce((sum: number, account: { balance: number }) => sum + account.balance, 0);
  const treasuryCash = accounts
    .filter(isTreasuryAccount)
    .reduce((sum: number, account: { balance: number }) => sum + account.balance, 0);
  const totalCash = bankCash + treasuryCash;
  const totalBalance = totalCash;

  // Fetch recent transactions for cash flow
  const rangeFrom = options?.fromDate ?? null;
  const rangeTo = options?.toDate ?? null;
  const useRange =
    Boolean(rangeFrom && rangeTo) &&
    !Number.isNaN(rangeFrom?.getTime() ?? NaN) &&
    !Number.isNaN(rangeTo?.getTime() ?? NaN) &&
    Boolean(rangeFrom && rangeTo && rangeFrom <= rangeTo);

  const startKey = (useRange ? rangeFrom! : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
    .toISOString()
    .split("T")[0];

  const endKey = (useRange ? rangeTo! : new Date()).toISOString().split("T")[0];
  const observedPeriodDays =
    useRange && rangeFrom && rangeTo
      ? Math.max(1, Math.ceil((rangeTo.getTime() - rangeFrom.getTime() + 1) / (24 * 60 * 60 * 1000)))
      : 30;
  const shouldCountCashFlow = (tx: MercuryTransaction): boolean => {
    if (tx.status !== "sent") return false;
    if (readMercuryNumber(tx.amount) === 0) return false;
    if (useRange && rangeFrom && rangeTo) {
      const postedAt = tx.postedAt || tx.createdAt || tx.timestamp || "";
      if (postedAt) {
        const postedMs = Date.parse(postedAt);
        if (!Number.isFinite(postedMs)) return false;
        if (postedMs < rangeFrom.getTime() || postedMs > rangeTo.getTime()) return false;
      }
    }
    const kind = (tx.kind ?? "").toLowerCase();
    const mercuryCategory = (tx.mercuryCategory ?? "").toLowerCase();
    const description = [
      tx.bankDescription,
      tx.description,
      tx.details?.description,
      tx.externalMemo,
      tx.memo,
      tx.note,
    ]
      .filter((value): value is string => typeof value === "string")
      .join(" ")
      .toLowerCase();
    return !(
      kind === "internaltransfer" ||
      kind === "treasurytransfer" ||
      mercuryCategory === "treasurytransfer" ||
      description.includes("internal transfer between your mercury accounts")
    );
  };
  const toTransactionData = (tx: MercuryTransaction): MercuryTransactionData => ({
    id: tx.id ?? "",
    postedAt: tx.postedAt ?? tx.createdAt ?? tx.timestamp ?? null,
    amount: readMercuryNumber(tx.amount),
    kind: tx.kind ?? null,
    mercuryCategory: tx.mercuryCategory ?? null,
    description:
      tx.description ??
      tx.details?.description ??
      tx.externalMemo ??
      tx.memo ??
      null,
    counterpartyName:
      tx.counterpartyName ??
      tx.merchantName ??
      tx.details?.counterpartyName ??
      tx.details?.merchantName ??
      null,
    bankDescription: tx.bankDescription ?? null,
    note: tx.note ?? null,
  });

  const ledgerTransactions: MercuryTransaction[] = [];

  const addCashFlow = (tx: MercuryTransaction): void => {
    if (!shouldCountCashFlow(tx)) return;
    ledgerTransactions.push(tx);
  };

  let inflows = 0, outflows = 0;
  let usedGlobalTransactions = false;
  let globalTransactionPagesFetched = 0;
  let globalTransactionsTruncated = false;
  let accountTransactionPagesFetched = 0;
  let accountTransactionsTruncated = false;
  try {
    let startAfter: string | null = null;
    for (let page = 0; page < maxPages; page += 1) {
      const params = new URLSearchParams({
        postedStart: startKey,
        postedEnd: endKey,
        status: "sent",
        limit: "1000",
        order: "desc",
      });
      if (startAfter) params.set("start_after", startAfter);
      const txRes = await fetch(`${baseUrl}/transactions?${params.toString()}`, {
        headers,
        cache: "no-store",
      });
      if (!txRes.ok) break;
      usedGlobalTransactions = true;
      const txData = await safeJson<{ transactions?: MercuryTransaction[] }>(txRes, "mercury transactions");
      const txs = txData.transactions ?? [];
      globalTransactionPagesFetched += 1;
      for (const tx of txs) addCashFlow(tx);
      if (txs.length < 1000) break;
      const lastId = txs[txs.length - 1]?.id;
      if (!lastId || lastId === startAfter) break;
      if (page === maxPages - 1) {
        globalTransactionsTruncated = true;
        break;
      }
      startAfter = lastId;
    }
  } catch {
    usedGlobalTransactions = false;
    ledgerTransactions.length = 0;
  }

  const bankAccounts = accounts.filter((account) => !isTreasuryAccount(account));
  if (!usedGlobalTransactions) {
    for (const account of bankAccounts) {
      try {
        const limit = 500;
        for (let page = 0; page < maxPages; page += 1) {
          const params = new URLSearchParams({
            start: startKey,
            end: endKey,
            status: "sent",
            limit: String(limit),
            offset: String(page * limit),
            order: "desc",
          });
          const txRes = await fetch(
            `${baseUrl}/account/${encodeURIComponent(account.accountId)}/transactions?${params.toString()}`,
            {
              headers,
              cache: "no-store",
            }
          );
          if (!txRes.ok) break;
          const txData = await safeJson<{ transactions?: MercuryTransaction[] }>(txRes, "mercury transactions");
          const txs = txData.transactions ?? [];
          accountTransactionPagesFetched += 1;
          for (const tx of txs) addCashFlow(tx);
          if (txs.length < limit) break;
          if (page === maxPages - 1) {
            accountTransactionsTruncated = true;
            break;
          }
        }
      } catch {
        // Skip account on error
      }
    }
  }

  const externalTransactions = filterInternalTransferPairs(ledgerTransactions);
  const observedExpenseBreakdown = emptyExpenseBreakdown();
  const monthlyExpenseBreakdown = emptyExpenseBreakdown();
  const expenseScale = observedPeriodDays > 0 ? 30 / observedPeriodDays : 1;
  const transactions = externalTransactions.map(toTransactionData);

  for (const tx of externalTransactions) {
    const amount = readMercuryNumber(tx.amount);
    const amt = Math.abs(amount);
    if (amount > 0) {
      inflows += amt;
    } else {
      outflows += amt;
      observedExpenseBreakdown[classifyMercuryExpense(tx)] += amt;
    }
  }

  for (const category of Object.keys(monthlyExpenseBreakdown) as ExpenseCategory[]) {
    monthlyExpenseBreakdown[category] = Math.round(observedExpenseBreakdown[category] * expenseScale * 100) / 100;
  }

  const burnRate = Math.max(outflows - inflows, 0);
  const runway = burnRate > 0 ? totalBalance / burnRate : 999;
  const truncatedResources = [
    ...(accountResult.truncated ? ["accounts"] : []),
    ...(globalTransactionsTruncated ? ["globalTransactions"] : []),
    ...(accountTransactionsTruncated ? ["accountTransactions"] : []),
  ];
  const meta = makeMeta();
  meta.truncated = truncatedResources.length > 0;
  meta.truncatedResources = truncatedResources;
  meta.diagnostics = {
    maxPages,
    accountPagesFetched: accountResult.pagesFetched,
    usedGlobalTransactions,
    globalTransactionPagesFetched,
    accountTransactionPagesFetched,
  };

  return {
    accounts,
    cashFlow: {
      totalBalance,
      bankCash,
      treasuryCash,
      totalCash,
      inflows30d: inflows,
      outflows30d: outflows,
      netCashFlow: inflows - outflows,
      runway: Math.round(runway * 10) / 10,
      burnRate,
      observedPeriodDays,
      observedInflowTotal: inflows,
      observedOutflowTotal: outflows,
      observedNetCashFlow: inflows - outflows,
      expenseBreakdown30d: monthlyExpenseBreakdown,
      observedExpenseBreakdown,
    },
    transactions,
    _meta: meta,
  };
}

type HubSpotDeal = NonNullable<HubSpotData["deals"]>[number];

type ChannelMapping = Record<string, ChannelGroup>;

function monthKeyUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function safeDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

function normalizeSourceKey(value: string): string {
  return value.trim().toLowerCase();
}

function classifyChannelGroup(rawSource: string, mapping?: ChannelMapping): ChannelGroup {
  const normalized = normalizeSourceKey(rawSource || "unknown");
  const explicit = mapping?.[normalized];
  if (explicit) return explicit;

  const key = normalized.replaceAll("_", " ").replaceAll("-", " ");

  if (!key || key === "unknown" || key === "unassigned" || key === "(none)") return "Unknown";
  if (key.includes("offline")) return "Outbound";
  if (key.includes("outbound")) return "Outbound";
  if (key.includes("partner")) return "Partner";
  if (key.includes("product")) return "Product-led";
  if (key.includes("plg")) return "Product-led";

  const inboundHints = [
    "organic",
    "paid",
    "search",
    "social",
    "email",
    "referral",
    "direct",
    "campaign",
    "web",
    "content",
  ];
  if (inboundHints.some((hint) => key.includes(hint))) return "Inbound";

  return "Unknown";
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

export function buildSalesPerformancePack(args: {
  from: Date;
  to: Date;
  generatedAt?: Date;
  fromSnapshot?: boolean;
  deals: HubSpotDeal[];
  contacts: HubSpotContactRecord[];
  chargesByCustomerId: StripeChargesByCustomerId;
  cohortWindowDays?: number;
  channelMapping?: ChannelMapping;
  errors?: string[];
}): SalesPerformancePack {
  const from = args.from;
  const to = args.to;
  const generatedAt = args.generatedAt ?? new Date();
  const fromSnapshot = args.fromSnapshot ?? false;
  const cohortWindowDays = args.cohortWindowDays ?? 90;

  const mappingNormalized: ChannelMapping = {};
  for (const [key, value] of Object.entries(args.channelMapping ?? {})) {
    mappingNormalized[normalizeSourceKey(key)] = value;
  }

  const observedSources = new Set<string>();
  for (const deal of args.deals) observedSources.add((deal.source || "Unknown").trim() || "Unknown");

  const channelMappingRows = [...observedSources]
    .sort((a, b) => a.localeCompare(b))
    .map((rawSource) => ({
      rawSource,
      channelGroup: classifyChannelGroup(rawSource, mappingNormalized),
    }));

  const channelGroupBySource = new Map<string, ChannelGroup>();
  for (const row of channelMappingRows) channelGroupBySource.set(row.rawSource, row.channelGroup);

  // ── Stripe realized 30d allocation ──
  const realizedCentsByDealId = new Map<string, number>();
  const dealsByCustomer = new Map<string, HubSpotDeal[]>();

  for (const deal of args.deals) {
    const customerId = deal.stripeCustomerId?.trim() || null;
    if (!customerId) continue;
    const stageId = (deal.stageId || "").toLowerCase();
    const closedAt = safeDate(deal.closedAt ?? null);
    if (stageId !== "closedwon" || !closedAt) continue;

    const bucket = dealsByCustomer.get(customerId);
    if (bucket) bucket.push(deal);
    else dealsByCustomer.set(customerId, [deal]);
  }

  for (const [customerId, customerDeals] of dealsByCustomer.entries()) {
    const charges = args.chargesByCustomerId[customerId] ?? [];
    if (charges.length === 0) continue;

    const sortedDeals = [...customerDeals].sort((a, b) => {
      const aClose = safeDate(a.closedAt ?? null)?.getTime() ?? 0;
      const bClose = safeDate(b.closedAt ?? null)?.getTime() ?? 0;
      return aClose - bClose;
    });

    const windows = sortedDeals.map((deal) => {
      const close = safeDate(deal.closedAt ?? null)!;
      const closeMs = close.getTime();
      const endMs = closeMs + 30 * 24 * 60 * 60 * 1000;
      return { deal, closeMs, endMs };
    });

    for (const charge of charges) {
      if (!Number.isFinite(charge.created)) continue;
      if (!Number.isFinite(charge.netAmountCents) || charge.netAmountCents <= 0) continue;

      const chargeMs = charge.created * 1000;
      if (!Number.isFinite(chargeMs)) continue;

      let matchedIndex = -1;
      for (let i = windows.length - 1; i >= 0; i--) {
        const w = windows[i]!;
        if (chargeMs < w.closeMs) continue;
        if (chargeMs > w.endMs) continue;
        matchedIndex = i;
        break;
      }
      if (matchedIndex === -1) continue;

      const dealId = windows[matchedIndex]!.deal.dealId;
      realizedCentsByDealId.set(dealId, (realizedCentsByDealId.get(dealId) ?? 0) + charge.netAmountCents);
    }
  }

  // ── Leads ──
  const leadsByRepMonth = new Map<string, number>();
  const leadsMissingOwnerByRepMonth = new Map<string, number>();

  for (const contact of args.contacts) {
    const createdAt = safeDate(contact.createdAt);
    if (!createdAt) continue;
    if (createdAt < from || createdAt > to) continue;
    const month = monthKeyUtc(createdAt);
    const repName = contact.repName || "Unassigned";
    const key = `${month}||${repName}`;
    leadsByRepMonth.set(key, (leadsByRepMonth.get(key) ?? 0) + 1);
    if (!contact.ownerId) {
      leadsMissingOwnerByRepMonth.set(key, (leadsMissingOwnerByRepMonth.get(key) ?? 0) + 1);
    }
  }

  // ── Opps + signed + decided + cohort ──
  const oppByRepMonth = new Map<string, number>();
  const oppByRepMonthSource = new Map<string, number>();
  const oppMissingOwnerByRepMonth = new Map<string, number>();

  const signedByRepMonth = new Map<string, HubSpotDeal[]>();
  const signedByRepMonthSource = new Map<string, HubSpotDeal[]>();

  const decidedByRepCloseMonth = new Map<string, { won: number; lost: number }>();
  const decidedByRepCloseMonthSource = new Map<string, { won: number; lost: number }>();

  const cohortCreatedByRepMonth = new Map<string, number>();
  const cohortWon90dByRepMonth = new Map<string, number>();

  for (const deal of args.deals) {
    const repName = deal.repName || "Unassigned";
    const stageId = (deal.stageId || "").toLowerCase();
    const rawSource = (deal.source || "Unknown").trim() || "Unknown";
    const channelGroup = channelGroupBySource.get(rawSource) ?? classifyChannelGroup(rawSource, mappingNormalized);

    const createdAt = safeDate(deal.createdAt);
    if (createdAt && createdAt >= from && createdAt <= to) {
      const createdMonth = monthKeyUtc(createdAt);
      const repMonthKey = `${createdMonth}||${repName}`;
      oppByRepMonth.set(repMonthKey, (oppByRepMonth.get(repMonthKey) ?? 0) + 1);
      const srcKey = `${createdMonth}||${repName}||${channelGroup}||${rawSource}`;
      oppByRepMonthSource.set(srcKey, (oppByRepMonthSource.get(srcKey) ?? 0) + 1);

      if (!deal.ownerId) {
        oppMissingOwnerByRepMonth.set(repMonthKey, (oppMissingOwnerByRepMonth.get(repMonthKey) ?? 0) + 1);
      }

      cohortCreatedByRepMonth.set(repMonthKey, (cohortCreatedByRepMonth.get(repMonthKey) ?? 0) + 1);
      if (stageId === "closedwon") {
        const closedAt = safeDate(deal.closedAt ?? null);
        if (closedAt && closedAt <= to) {
          const windowEnd = new Date(createdAt.getTime() + cohortWindowDays * 24 * 60 * 60 * 1000);
          if (closedAt <= windowEnd) {
            cohortWon90dByRepMonth.set(repMonthKey, (cohortWon90dByRepMonth.get(repMonthKey) ?? 0) + 1);
          }
        }
      }
    }

    const closedAt = safeDate(deal.closedAt ?? null);
    if (closedAt && closedAt >= from && closedAt <= to) {
      const closeMonth = monthKeyUtc(closedAt);
      const decidedKey = `${closeMonth}||${repName}`;
      const decidedSourceKey = `${closeMonth}||${repName}||${channelGroup}||${rawSource}`;

      if (stageId === "closedwon" || stageId === "closedlost") {
        const agg = decidedByRepCloseMonth.get(decidedKey) ?? { won: 0, lost: 0 };
        if (stageId === "closedwon") agg.won += 1;
        else agg.lost += 1;
        decidedByRepCloseMonth.set(decidedKey, agg);

        const aggSrc = decidedByRepCloseMonthSource.get(decidedSourceKey) ?? { won: 0, lost: 0 };
        if (stageId === "closedwon") aggSrc.won += 1;
        else aggSrc.lost += 1;
        decidedByRepCloseMonthSource.set(decidedSourceKey, aggSrc);
      }

      if (stageId === "closedwon") {
        const monthKey = `${closeMonth}||${repName}`;
        const arr = signedByRepMonth.get(monthKey) ?? [];
        arr.push(deal);
        signedByRepMonth.set(monthKey, arr);

        const arrSrc = signedByRepMonthSource.get(decidedSourceKey) ?? [];
        arrSrc.push(deal);
        signedByRepMonthSource.set(decidedSourceKey, arrSrc);
      }
    }
  }

  // ── Deal audit rows ──
  const dealAuditRows: SalesPerformanceDealAuditRow[] = [];
  for (const deal of args.deals) {
    const rawSource = (deal.source || "Unknown").trim() || "Unknown";
    const channelGroup = channelGroupBySource.get(rawSource) ?? classifyChannelGroup(rawSource, mappingNormalized);

    const flags: string[] = [];
    if (!deal.ownerId) flags.push("missing_owner");
    if (!deal.amount || deal.amount === 0) flags.push("amount_zero");
    if (!rawSource || rawSource === "Unknown") flags.push("missing_source");

    const stageId = (deal.stageId || "").toLowerCase();
    if (stageId === "closedwon" && !deal.closedAt) flags.push("missing_close_date");

    const customerId = deal.stripeCustomerId?.trim() || null;
    const stripeLinked = Boolean(customerId);
    const realized30d = (realizedCentsByDealId.get(deal.dealId) ?? 0) / 100;

    dealAuditRows.push({
      hubspotDealId: deal.dealId,
      dealName: deal.dealName,
      ownerId: deal.ownerId,
      repName: deal.repName || "Unassigned",
      createdAt: deal.createdAt ?? null,
      closedAt: deal.closedAt ?? null,
      stageId: deal.stageId,
      stageLabel: deal.stageLabel,
      amount: deal.amount,
      rawSource,
      channelGroup,
      stripeCustomerId: customerId,
      stripeLinked,
      stripeRealized30d: realized30d,
      flags,
    });
  }

  // ── Rep × Month rows ──
  const repMonthKeys = new Set<string>();
  for (const k of leadsByRepMonth.keys()) repMonthKeys.add(k);
  for (const k of oppByRepMonth.keys()) repMonthKeys.add(k);
  for (const k of signedByRepMonth.keys()) repMonthKeys.add(k);
  for (const k of decidedByRepCloseMonth.keys()) repMonthKeys.add(k);
  for (const k of cohortCreatedByRepMonth.keys()) repMonthKeys.add(k);

  const repMonthRows: SalesPerformanceRepMonthRow[] = [];
  for (const key of repMonthKeys) {
    const [month, repName] = key.split("||");
    const leadsCreatedCount = leadsByRepMonth.get(key) ?? 0;
    const opportunitiesCreatedCount = oppByRepMonth.get(key) ?? 0;
    const signedDeals = signedByRepMonth.get(key) ?? [];

    const signedDealsCount = signedDeals.length;
    const signedDealsBookedValue = signedDeals.reduce((s, d) => s + (d.amount || 0), 0);

    const signedAmounts = signedDeals.map((d) => d.amount || 0).filter((v) => Number.isFinite(v));
    const avgSignedDealSizeBooked = mean(signedAmounts);
    const medianSignedDealSizeBooked = median(signedAmounts);

    const signedDealsRealizedValue30d =
      signedDeals.reduce((s, d) => s + (realizedCentsByDealId.get(d.dealId) ?? 0), 0) / 100;
    const bookedToRealizedRatio30d =
      signedDealsBookedValue > 0 ? signedDealsRealizedValue30d / signedDealsBookedValue : null;

    const leadToOpportunityRate = leadsCreatedCount > 0 ? opportunitiesCreatedCount / leadsCreatedCount : null;

    const cohortCreated = cohortCreatedByRepMonth.get(key) ?? 0;
    const cohortWon90d = cohortWon90dByRepMonth.get(key) ?? 0;
    const opportunityToClosedRate90d = cohortCreated > 0 ? cohortWon90d / cohortCreated : null;

    const decided = decidedByRepCloseMonth.get(key) ?? { won: 0, lost: 0 };
    const decidedDenom = decided.won + decided.lost;
    const winRateDecided = decidedDenom > 0 ? decided.won / decidedDenom : null;

    const signedByGroup: Record<ChannelGroup, number> = {
      Inbound: 0,
      Outbound: 0,
      Partner: 0,
      "Product-led": 0,
      Unknown: 0,
    };

    for (const d of signedDeals) {
      const src = (d.source || "Unknown").trim() || "Unknown";
      const group = channelGroupBySource.get(src) ?? classifyChannelGroup(src, mappingNormalized);
      signedByGroup[group] += 1;
    }

    const signedDealsMissingSource = signedDeals.filter((d) => {
      const src = (d.source || "Unknown").trim() || "Unknown";
      return !src || src === "Unknown";
    }).length;

    const signedDealsMissingCloseDate = signedDeals.filter((d) => !d.closedAt).length;
    const signedDealsMissingOwner = signedDeals.filter((d) => !d.ownerId).length;

    const opportunitiesMissingOwner = oppMissingOwnerByRepMonth.get(key) ?? 0;
    const leadsMissingOwner = leadsMissingOwnerByRepMonth.get(key) ?? 0;

    repMonthRows.push({
      month,
      repName,
      leadsCreatedCount,
      opportunitiesCreatedCount,
      leadToOpportunityRate,
      signedDealsCount,
      signedDealsBookedValue,
      avgSignedDealSizeBooked,
      medianSignedDealSizeBooked,
      signedDealsRealizedValue30d,
      bookedToRealizedRatio30d,
      opportunityToClosedRate90d,
      winRateDecided,
      signedInboundShare: pct(signedByGroup["Inbound"], signedDealsCount),
      signedOutboundShare: pct(signedByGroup["Outbound"], signedDealsCount),
      signedPartnerShare: pct(signedByGroup["Partner"], signedDealsCount),
      signedProductLedShare: pct(signedByGroup["Product-led"], signedDealsCount),
      signedUnknownShare: pct(signedByGroup["Unknown"], signedDealsCount),
      dataQuality: {
        signedDealsMissingSourcePct: pct(signedDealsMissingSource, signedDealsCount),
        signedDealsMissingCloseDatePct: pct(signedDealsMissingCloseDate, signedDealsCount),
        signedDealsMissingOwnerPct: pct(signedDealsMissingOwner, signedDealsCount),
        opportunitiesMissingOwnerPct: pct(opportunitiesMissingOwner, opportunitiesCreatedCount),
        leadsMissingOwnerPct: pct(leadsMissingOwner, leadsCreatedCount),
      },
    });
  }

  repMonthRows.sort((a, b) => {
    if (a.month !== b.month) return a.month.localeCompare(b.month);
    return a.repName.localeCompare(b.repName);
  });

  // ── Rep × Month × Channel rows ──
  const repMonthChannelRows: SalesPerformanceRepMonthChannelRow[] = [];
  const repMonthChannelKeys = new Set<string>();
  for (const k of oppByRepMonthSource.keys()) repMonthChannelKeys.add(k);
  for (const k of signedByRepMonthSource.keys()) repMonthChannelKeys.add(k);
  for (const k of decidedByRepCloseMonthSource.keys()) repMonthChannelKeys.add(k);

  for (const key of repMonthChannelKeys) {
    const [month, repName, channelGroup, rawSource] = key.split("||") as [
      string,
      string,
      ChannelGroup,
      string,
    ];

    const opportunitiesCreatedCount = oppByRepMonthSource.get(key) ?? 0;
    const signedDeals = signedByRepMonthSource.get(key) ?? [];
    const signedDealsCount = signedDeals.length;
    const bookedValue = signedDeals.reduce((s, d) => s + (d.amount || 0), 0);
    const avgBookedDealSize = signedDealsCount > 0 ? bookedValue / signedDealsCount : null;
    const realizedValue30d =
      signedDeals.reduce((s, d) => s + (realizedCentsByDealId.get(d.dealId) ?? 0), 0) / 100;

    const decided = decidedByRepCloseMonthSource.get(key) ?? { won: 0, lost: 0 };
    const decidedDenom = decided.won + decided.lost;
    const winRateDecided = decidedDenom > 0 ? decided.won / decidedDenom : null;

    const daysToClose = signedDeals
      .map((d) => {
        const c = safeDate(d.createdAt);
        const cl = safeDate(d.closedAt ?? null);
        if (!c || !cl) return null;
        return (cl.getTime() - c.getTime()) / 86_400_000;
      })
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const avgDaysToClose = mean(daysToClose);

    repMonthChannelRows.push({
      month,
      repName,
      channelGroup,
      rawSource,
      opportunitiesCreatedCount,
      signedDealsCount,
      bookedValue,
      avgBookedDealSize,
      realizedValue30d,
      winRateDecided,
      avgDaysToClose,
    });
  }

  repMonthChannelRows.sort((a, b) => {
    if (a.month !== b.month) return a.month.localeCompare(b.month);
    if (a.repName !== b.repName) return a.repName.localeCompare(b.repName);
    if (a.channelGroup !== b.channelGroup) return a.channelGroup.localeCompare(b.channelGroup);
    return a.rawSource.localeCompare(b.rawSource);
  });

  dealAuditRows.sort((a, b) => {
    const aClosed = a.closedAt ?? "";
    const bClosed = b.closedAt ?? "";
    if (aClosed !== bClosed) return aClosed.localeCompare(bClosed);
    return a.hubspotDealId.localeCompare(b.hubspotDealId);
  });

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    generatedAt: generatedAt.toISOString(),
    fromSnapshot,
    channelMapping: channelMappingRows,
    repMonthRows,
    repMonthChannelRows,
    dealAuditRows,
    errors: args.errors ?? [],
  };
}
