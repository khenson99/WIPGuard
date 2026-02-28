import {
  IntegrationConnectionStatus,
  IntegrationProvider,
  Prisma,
  Priority,
  type IntegrationConnection,
  type IntegrationRule,
  type TaskStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getNextColumnOrder } from "@/lib/task-order";
import { buildOutboxIdempotencyKey, publishDomainEvent } from "@/lib/event-bus";
import { withRetries } from "@/lib/integrations/with-retries";
import { isCircuitClosed, recordSuccess, recordFailure, CircuitOpenError, getCircuitState } from "@/lib/integrations/circuit-breaker";
import { getValidIntegrationAccessToken } from "@/lib/integrations/token-refresh";

export const HUBSPOT_CUSTOMER_SIGNAL_RULE_KEY = "hubspot_customer_signal_followup";
const HUBSPOT_DEALS_ENDPOINT = "https://api.hubapi.com/crm/v3/objects/deals";
const HUBSPOT_OWNERS_ENDPOINT = "https://api.hubapi.com/crm/v3/owners";
const HUBSPOT_CONTACTS_ENDPOINT = "https://api.hubapi.com/crm/v3/objects/contacts";

type SupportedAutoTaskStatus = "QUEUED" | "ACTIVE" | "NOT_DONE";
type HubSpotCustomerSignalVariant = "deal_stage_transition" | "contact_lifecycle_signal";

type HubSpotSignalPriority = "P0" | "P1" | "P2" | "P3";

export interface HubSpotCustomerSignalTemplate {
  label: string;
  dueInDays: number;
  priority: HubSpotSignalPriority;
  recommendedActions: string[];
}

export interface HubSpotCustomerSignalConfig {
  monitoredPipelines: string[];
  maxResults: number;
  maxContactsPerDeal: number;
  stageSignals: Record<string, HubSpotCustomerSignalTemplate>;
  contactLifecycleSignals: Record<string, HubSpotCustomerSignalTemplate>;
}

interface HubSpotCustomerSignalCheckpoint {
  lastDealModifiedAt?: string;
  lastDealId?: string;
  lastContactModifiedAt?: string;
  lastContactId?: string;
}

interface HubSpotDeal {
  id: string;
  properties?: {
    dealname?: string;
    dealstage?: string;
    pipeline?: string;
    hs_lastmodifieddate?: string;
    hubspot_owner_id?: string;
  };
}

interface HubSpotOwnerResponse {
  id?: string;
  email?: string;
}

interface HubSpotAssociation {
  id?: string;
}

interface HubSpotContact {
  id: string;
  properties?: {
    email?: string;
    firstname?: string;
    lastname?: string;
    lifecyclestage?: string;
    lastmodifieddate?: string;
  };
}

interface HubSpotCustomerSignal {
  variant: HubSpotCustomerSignalVariant;
  signalKey: string;
  signalLabel: string;
  reason: string;
  dealId: string;
  dealName: string;
  sourceUrl: string;
  externalObjectId: string;
  observedAt: Date;
  template: HubSpotCustomerSignalTemplate;
  ownerId: string | null;
  stageId: string | null;
  contactId?: string;
  contactEmail?: string | null;
  contactName?: string | null;
  lifecycleStage?: string | null;
}

export interface HubSpotCustomerSignalRuleState {
  id: string;
  key: string;
  enabled: boolean;
  statusOverride: SupportedAutoTaskStatus | null;
  config: HubSpotCustomerSignalConfig;
  checkpoint: HubSpotCustomerSignalCheckpoint;
  lastObservedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface HubSpotCustomerSignalRulePatch {
  enabled?: boolean;
  statusOverride?: SupportedAutoTaskStatus | null;
  config?: Partial<HubSpotCustomerSignalConfig>;
}

export interface HubSpotCustomerSignalTask {
  dealId: string;
  contactId: string | null;
  signalVariant: HubSpotCustomerSignalVariant;
  signalKey: string;
  taskId: string;
  title: string;
  sourceUrl: string;
  operation: "created" | "updated";
}

export interface HubSpotCustomerSignalRunResult {
  ruleId: string;
  enabled: boolean;
  scannedDeals: number;
  scannedContacts: number;
  detectedSignals: number;
  createdTasks: number;
  updatedTasks: number;
  dedupedTasks: number;
  failedTasks: number;
  cursor: HubSpotCustomerSignalCheckpoint;
  tasks: HubSpotCustomerSignalTask[];
  errors: Array<{ externalObjectId: string; signalKey: string; error: string }>;
}

export class HubSpotCustomerSignalAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HubSpotCustomerSignalAuthError";
  }
}

export function defaultHubSpotCustomerSignalConfig(): HubSpotCustomerSignalConfig {
  return {
    monitoredPipelines: [],
    maxResults: 100,
    maxContactsPerDeal: 10,
    stageSignals: {
      appointmentscheduled: {
        label: "Meeting Scheduled",
        dueInDays: 1,
        priority: "P2",
        recommendedActions: [
          "Review the latest context before the customer call.",
          "Define one specific commitment to secure in the meeting.",
          "Prepare a follow-up draft with next-step options.",
        ],
      },
      contractsent: {
        label: "Contract Sent",
        dueInDays: 0,
        priority: "P1",
        recommendedActions: [
          "Confirm legal/procurement owner and timeline.",
          "Prepare a redline response plan before the check-in.",
          "Book a follow-up within 24 hours.",
        ],
      },
    },
    contactLifecycleSignals: {
      salesqualifiedlead: {
        label: "SQL Lifecycle Transition",
        dueInDays: 1,
        priority: "P2",
        recommendedActions: [
          "Validate decision process and buying committee.",
          "Align owner outreach to the current priority.",
          "Create a concrete milestone for the next 7 days.",
        ],
      },
      opportunity: {
        label: "Opportunity Lifecycle Transition",
        dueInDays: 0,
        priority: "P1",
        recommendedActions: [
          "Capture success criteria from the contact signal.",
          "Update the deal action plan and owners.",
          "Schedule a same-week progress checkpoint.",
        ],
      },
      customer: {
        label: "Customer Lifecycle Transition",
        dueInDays: 1,
        priority: "P2",
        recommendedActions: [
          "Create onboarding and expansion follow-up tasks.",
          "Document handoff actions and accountable owner.",
          "Set the first value-realization checkpoint.",
        ],
      },
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function toIntegerInRange(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, value));
}

function normalizePriority(value: unknown, fallback: HubSpotSignalPriority): HubSpotSignalPriority {
  if (value === "P0" || value === "P1" || value === "P2" || value === "P3") {
    return value;
  }
  return fallback;
}

function normalizeTemplate(raw: unknown): HubSpotCustomerSignalTemplate | null {
  const input = asRecord(raw);

  const label =
    typeof input.label === "string" && input.label.trim().length > 0 ? input.label.trim() : null;

  const dueInDays =
    typeof input.dueInDays === "number" && Number.isInteger(input.dueInDays)
      ? Math.max(0, Math.min(30, input.dueInDays))
      : null;

  const priority = normalizePriority(input.priority, "P2");

  const recommendedActions = Array.isArray(input.recommendedActions)
    ? input.recommendedActions.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0
      )
    : [];

  if (!label || dueInDays === null || recommendedActions.length === 0) {
    return null;
  }

  return {
    label,
    dueInDays,
    priority,
    recommendedActions,
  };
}

function normalizeTemplateMap(
  raw: unknown,
  fallback: Record<string, HubSpotCustomerSignalTemplate>
): Record<string, HubSpotCustomerSignalTemplate> {
  const input = asRecord(raw);
  const normalized: Record<string, HubSpotCustomerSignalTemplate> = {};

  for (const [key, value] of Object.entries(input)) {
    const template = normalizeTemplate(value);
    if (template) {
      normalized[key] = template;
    }
  }

  if (Object.keys(normalized).length === 0) {
    return fallback;
  }

  return normalized;
}

function normalizeConfig(raw: unknown): HubSpotCustomerSignalConfig {
  const input = asRecord(raw);
  const fallback = defaultHubSpotCustomerSignalConfig();

  const monitoredPipelines = Array.isArray(input.monitoredPipelines)
    ? input.monitoredPipelines.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0
      )
    : fallback.monitoredPipelines;

  const maxResults = toIntegerInRange(input.maxResults, fallback.maxResults, 1, 300);
  const maxContactsPerDeal = toIntegerInRange(
    input.maxContactsPerDeal,
    fallback.maxContactsPerDeal,
    1,
    50
  );

  const stageSignals = normalizeTemplateMap(input.stageSignals, fallback.stageSignals);
  const contactLifecycleSignals = normalizeTemplateMap(
    input.contactLifecycleSignals,
    fallback.contactLifecycleSignals
  );

  return {
    monitoredPipelines,
    maxResults,
    maxContactsPerDeal,
    stageSignals,
    contactLifecycleSignals,
  };
}

function normalizeCheckpoint(raw: unknown): HubSpotCustomerSignalCheckpoint {
  const input = asRecord(raw);
  const checkpoint: HubSpotCustomerSignalCheckpoint = {};

  if (typeof input.lastDealModifiedAt === "string" && input.lastDealModifiedAt.length > 0) {
    checkpoint.lastDealModifiedAt = input.lastDealModifiedAt;
  }

  if (typeof input.lastDealId === "string" && input.lastDealId.length > 0) {
    checkpoint.lastDealId = input.lastDealId;
  }

  if (typeof input.lastContactModifiedAt === "string" && input.lastContactModifiedAt.length > 0) {
    checkpoint.lastContactModifiedAt = input.lastContactModifiedAt;
  }

  if (typeof input.lastContactId === "string" && input.lastContactId.length > 0) {
    checkpoint.lastContactId = input.lastContactId;
  }

  return checkpoint;
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

function parseDate(value: string | undefined): Date | null {
  if (!value || value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function mapPriority(value: HubSpotSignalPriority): Priority {
  if (value === "P0") return Priority.P0;
  if (value === "P1") return Priority.P1;
  if (value === "P3") return Priority.P3;
  return Priority.P2;
}

function hubspotDealSourceUrl(portalId: string | null, dealId: string): string {
  if (!portalId) {
    return `https://app.hubspot.com/contacts/record/0-3/${dealId}`;
  }
  return `https://app.hubspot.com/contacts/${portalId}/record/0-3/${dealId}`;
}

function hubspotContactSourceUrl(portalId: string | null, contactId: string): string {
  if (!portalId) {
    return `https://app.hubspot.com/contacts/record/0-1/${contactId}`;
  }
  return `https://app.hubspot.com/contacts/${portalId}/record/0-1/${contactId}`;
}

export function buildHubSpotCustomerSignalDedupeKey(input: {
  externalObjectId: string;
  ruleVariant: string;
}): string {
  return ["hubspot", "hubspot_customer_signal", input.externalObjectId, input.ruleVariant].join(":");
}

function buildTaskTitle(input: { dealName: string; signalLabel: string }): string {
  return `[HubSpot Signal] ${input.dealName} - ${input.signalLabel}`;
}

function buildTaskNotes(input: {
  signal: HubSpotCustomerSignal;
  sourceUrl: string;
  ownerEmail: string | null;
}): string {
  const steps = input.signal.template.recommendedActions
    .map((step, index) => `${index + 1}. ${step}`)
    .join("\n");

  const lines = [
    "Created from HubSpot customer signal automation.",
    `Signal: ${input.signal.signalLabel}`,
    `Reason: ${input.signal.reason}`,
    `Deal: ${input.signal.dealName}`,
    input.signal.stageId ? `Stage ID: ${input.signal.stageId}` : null,
    input.signal.contactId ? `Contact ID: ${input.signal.contactId}` : null,
    input.signal.contactName ? `Contact: ${input.signal.contactName}` : null,
    input.signal.contactEmail ? `Contact Email: ${input.signal.contactEmail}` : null,
    input.signal.lifecycleStage ? `Lifecycle Stage: ${input.signal.lifecycleStage}` : null,
    input.signal.ownerId ? `HubSpot Owner ID: ${input.signal.ownerId}` : null,
    input.ownerEmail ? `Mapped Owner Email: ${input.ownerEmail}` : null,
    `Source: ${input.sourceUrl}`,
    "",
    "Recommended next actions:",
    steps,
  ].filter(Boolean);

  return lines.join("\n");
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}


async function markConnectionError(userId: string, message: string): Promise<void> {
  await prisma.integrationConnection.updateMany({
    where: {
      userId,
      provider: IntegrationProvider.HUBSPOT,
    },
    data: {
      status: IntegrationConnectionStatus.ERROR,
      lastError: message,
      lastSyncedAt: null,
    },
  });
}

async function getHubSpotConnection(userId: string): Promise<IntegrationConnection> {
  const connection = await prisma.integrationConnection.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: IntegrationProvider.HUBSPOT,
      },
    },
  });

  if (!connection || connection.status !== IntegrationConnectionStatus.CONNECTED) {
    throw new HubSpotCustomerSignalAuthError("HubSpot is not connected");
  }

  return connection;
}

async function getValidHubSpotAccessToken(
  userId: string
): Promise<{ accessToken: string; portalId: string | null }> {
  const connection = await getHubSpotConnection(userId);
  const token = await getValidIntegrationAccessToken({
    userId,
    provider: IntegrationProvider.HUBSPOT,
  });

  const portalIdRaw = asRecord(connection.metadata).hubId;
  const portalId =
    typeof portalIdRaw === "number"
      ? String(portalIdRaw)
      : typeof portalIdRaw === "string"
        ? portalIdRaw
        : null;

  return { accessToken: token, portalId };
}

async function hubspotFetchJson<T>(accessToken: string, url: URL): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new HubSpotCustomerSignalAuthError("HubSpot access token is invalid or expired");
  }

  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || payload === null) {
    throw new Error(`HubSpot API failed (${response.status})`);
  }

  return payload;
}

async function listDeals(input: {
  accessToken: string;
  config: HubSpotCustomerSignalConfig;
}): Promise<HubSpotDeal[]> {
  const properties = ["dealname", "dealstage", "pipeline", "hs_lastmodifieddate", "hubspot_owner_id"].join(
    ","
  );

  let after: string | undefined;
  const deals: HubSpotDeal[] = [];
  const maxPages = 5;

  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(HUBSPOT_DEALS_ENDPOINT);
    url.searchParams.set("limit", "100");
    url.searchParams.set("properties", properties);
    if (after) {
      url.searchParams.set("after", after);
    }

    const payload = await hubspotFetchJson<{
      results?: HubSpotDeal[];
      paging?: { next?: { after?: string } };
    }>(input.accessToken, url);

    deals.push(...(payload.results ?? []));

    after = payload.paging?.next?.after;
    if (!after) break;
  }

  const filtered = deals.filter((deal) => {
    const pipelineId = deal.properties?.pipeline;

    if (
      input.config.monitoredPipelines.length > 0 &&
      (!pipelineId || !input.config.monitoredPipelines.includes(pipelineId))
    ) {
      return false;
    }

    return true;
  });

  return filtered.slice(0, input.config.maxResults);
}

async function listDealContactIds(input: {
  accessToken: string;
  dealId: string;
  maxContactsPerDeal: number;
}): Promise<string[]> {
  let after: string | undefined;
  const contactIds: string[] = [];
  const maxPages = 4;

  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(
      `${HUBSPOT_DEALS_ENDPOINT}/${encodeURIComponent(input.dealId)}/associations/contacts`
    );
    url.searchParams.set("limit", String(Math.min(100, input.maxContactsPerDeal)));
    if (after) {
      url.searchParams.set("after", after);
    }

    const payload = await hubspotFetchJson<{
      results?: HubSpotAssociation[];
      paging?: { next?: { after?: string } };
    }>(input.accessToken, url);

    for (const association of payload.results ?? []) {
      if (typeof association.id === "string" && association.id.trim().length > 0) {
        contactIds.push(association.id);
      }
    }

    if (contactIds.length >= input.maxContactsPerDeal) {
      break;
    }

    after = payload.paging?.next?.after;
    if (!after) {
      break;
    }
  }

  return Array.from(new Set(contactIds)).slice(0, input.maxContactsPerDeal);
}

async function fetchContact(accessToken: string, contactId: string): Promise<HubSpotContact> {
  const properties = ["email", "firstname", "lastname", "lifecyclestage", "lastmodifieddate"].join(",");
  const url = new URL(`${HUBSPOT_CONTACTS_ENDPOINT}/${encodeURIComponent(contactId)}`);
  url.searchParams.set("properties", properties);

  return hubspotFetchJson<HubSpotContact>(accessToken, url);
}

async function fetchOwnerEmail(
  accessToken: string,
  ownerId: string,
  cache: Map<string, string | null>
): Promise<string | null> {
  if (cache.has(ownerId)) {
    return cache.get(ownerId) ?? null;
  }

  const url = new URL(`${HUBSPOT_OWNERS_ENDPOINT}/${encodeURIComponent(ownerId)}`);
  url.searchParams.set("idProperty", "id");

  const payload = await hubspotFetchJson<HubSpotOwnerResponse>(accessToken, url);
  const email = typeof payload.email === "string" && payload.email.length > 0 ? payload.email : null;

  cache.set(ownerId, email);
  return email;
}

async function findAssigneeByEmail(fallbackUserId: string, email: string | null): Promise<string> {
  if (!email) {
    return fallbackUserId;
  }

  const matched = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  return matched?.id ?? fallbackUserId;
}

async function resolveAssignee(input: {
  fallbackUserId: string;
  ownerId: string | null;
  accessToken: string;
  ownerCache: Map<string, string | null>;
}): Promise<{ assigneeId: string; ownerEmail: string | null }> {
  if (!input.ownerId) {
    return { assigneeId: input.fallbackUserId, ownerEmail: null };
  }

  const ownerEmail = await withRetries(() =>
    fetchOwnerEmail(input.accessToken, input.ownerId!, input.ownerCache)
  );

  const assigneeId = await findAssigneeByEmail(input.fallbackUserId, ownerEmail);

  return {
    assigneeId,
    ownerEmail,
  };
}

function buildContactName(contact: HubSpotContact): string | null {
  const first = typeof contact.properties?.firstname === "string" ? contact.properties.firstname.trim() : "";
  const last = typeof contact.properties?.lastname === "string" ? contact.properties.lastname.trim() : "";
  const fullName = [first, last].filter(Boolean).join(" ");
  return fullName.length > 0 ? fullName : null;
}

function buildStageSignal(input: {
  deal: HubSpotDeal;
  stageId: string;
  template: HubSpotCustomerSignalTemplate;
  portalId: string | null;
  modifiedAt: Date;
}): HubSpotCustomerSignal {
  const dealName = input.deal.properties?.dealname?.trim() || `Deal ${input.deal.id}`;

  return {
    variant: "deal_stage_transition",
    signalKey: `deal-stage-${input.stageId}`,
    signalLabel: input.template.label,
    reason: `Deal entered/updated in monitored stage ${input.stageId}.`,
    dealId: input.deal.id,
    dealName,
    sourceUrl: hubspotDealSourceUrl(input.portalId, input.deal.id),
    externalObjectId: `${input.deal.id}:stage:${input.stageId}`,
    observedAt: input.modifiedAt,
    template: input.template,
    ownerId: input.deal.properties?.hubspot_owner_id ?? null,
    stageId: input.stageId,
  };
}

function buildContactSignal(input: {
  deal: HubSpotDeal;
  contact: HubSpotContact;
  lifecycleStage: string;
  template: HubSpotCustomerSignalTemplate;
  portalId: string | null;
  modifiedAt: Date;
}): HubSpotCustomerSignal {
  const dealName = input.deal.properties?.dealname?.trim() || `Deal ${input.deal.id}`;
  const contactName = buildContactName(input.contact);
  const contactEmail =
    typeof input.contact.properties?.email === "string" && input.contact.properties.email.trim().length > 0
      ? input.contact.properties.email.trim()
      : null;

  return {
    variant: "contact_lifecycle_signal",
    signalKey: `contact-lifecycle-${input.lifecycleStage}`,
    signalLabel: input.template.label,
    reason: `Associated contact lifecycle stage changed to ${input.lifecycleStage}.`,
    dealId: input.deal.id,
    dealName,
    sourceUrl: hubspotContactSourceUrl(input.portalId, input.contact.id),
    externalObjectId: `${input.deal.id}:contact:${input.contact.id}:lifecycle:${input.lifecycleStage}`,
    observedAt: input.modifiedAt,
    template: input.template,
    ownerId: input.deal.properties?.hubspot_owner_id ?? null,
    stageId: input.deal.properties?.dealstage ?? null,
    contactId: input.contact.id,
    contactEmail,
    contactName,
    lifecycleStage: input.lifecycleStage,
  };
}

async function recordDeadLetterFailure(input: {
  ruleId: string;
  externalObjectId: string;
  signalKey: string;
  error: string;
}): Promise<void> {
  await prisma.outboxEvent.create({
    data: {
      eventType: "integration.hubspot.customer_signal.failed",
      aggregateType: "integration_rule",
      aggregateId: input.ruleId,
      schemaVersion: 1,
      payload: {
        externalObjectId: input.externalObjectId,
        signalKey: input.signalKey,
        error: input.error,
      },
      idempotencyKey: `dead-letter:hubspot-customer-signal:${input.ruleId}:${input.externalObjectId}:${input.signalKey}:${Date.now()}`,
      status: "DEAD_LETTER",
      retryCount: 0,
      nextAttemptAt: new Date(),
      failedAt: new Date(),
      error: input.error,
      lastAttemptAt: new Date(),
    },
  });
}

export async function getOrCreateHubSpotCustomerSignalRule(userId: string): Promise<IntegrationRule> {
  return prisma.integrationRule.upsert({
    where: {
      userId_provider_key: {
        userId,
        provider: IntegrationProvider.HUBSPOT,
        key: HUBSPOT_CUSTOMER_SIGNAL_RULE_KEY,
      },
    },
    update: {},
    create: {
      userId,
      provider: IntegrationProvider.HUBSPOT,
      key: HUBSPOT_CUSTOMER_SIGNAL_RULE_KEY,
      enabled: true,
      statusOverride: null,
      config: defaultHubSpotCustomerSignalConfig() as unknown as Prisma.InputJsonValue,
      checkpoint: {} as unknown as Prisma.InputJsonValue,
    },
  });
}

export function serializeHubSpotCustomerSignalRule(
  rule: IntegrationRule
): HubSpotCustomerSignalRuleState {
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

export async function patchHubSpotCustomerSignalRule(
  userId: string,
  patch: HubSpotCustomerSignalRulePatch
): Promise<HubSpotCustomerSignalRuleState> {
  const existing = await getOrCreateHubSpotCustomerSignalRule(userId);
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

  return serializeHubSpotCustomerSignalRule(updated);
}

export async function runHubSpotCustomerSignalAutomation(input: {
  userId: string;
  dryRun?: boolean;
}): Promise<HubSpotCustomerSignalRunResult> {
  const rule = await getOrCreateHubSpotCustomerSignalRule(input.userId);
  const config = normalizeConfig(rule.config);
  const checkpoint = normalizeCheckpoint(rule.checkpoint);

  if (!rule.enabled) {
    return {
      ruleId: rule.id,
      enabled: false,
      scannedDeals: 0,
      scannedContacts: 0,
      detectedSignals: 0,
      createdTasks: 0,
      updatedTasks: 0,
      dedupedTasks: 0,
      failedTasks: 0,
      cursor: checkpoint,
      tasks: [],
      errors: [],
    };
  }

  const CB_PROVIDER = "hubspot";
  if (!(await isCircuitClosed(CB_PROVIDER, input.userId))) {
    throw new CircuitOpenError(CB_PROVIDER, input.userId, getCircuitState(CB_PROVIDER, input.userId));
  }
  let _cbSuccess = false;
  try {

  let accessToken: string;
  let portalId: string | null;

  try {
    const authData = await getValidHubSpotAccessToken(input.userId);
    accessToken = authData.accessToken;
    portalId = authData.portalId;
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

  const deals = await withRetries(() => listDeals({ accessToken, config }));
  const checkpointDealMs = checkpoint.lastDealModifiedAt ? Date.parse(checkpoint.lastDealModifiedAt) : Number.NaN;
  const checkpointContactMs = checkpoint.lastContactModifiedAt
    ? Date.parse(checkpoint.lastContactModifiedAt)
    : Number.NaN;

  const defaultStatus = toSupportedStatus(rule.statusOverride);

  let scannedContacts = 0;
  let detectedSignals = 0;
  let createdTasks = 0;
  let updatedTasks = 0;
  let dedupedTasks = 0;
  let failedTasks = 0;

  const tasks: HubSpotCustomerSignalTask[] = [];
  const errors: Array<{ externalObjectId: string; signalKey: string; error: string }> = [];

  let newestDealModifiedAtMs = Number.isFinite(checkpointDealMs) ? checkpointDealMs : Number.NaN;
  let newestDealId = checkpoint.lastDealId;
  let newestContactModifiedAtMs = Number.isFinite(checkpointContactMs)
    ? checkpointContactMs
    : Number.NaN;
  let newestContactId = checkpoint.lastContactId;

  const ownerCache = new Map<string, string | null>();

  for (const deal of deals) {
    const stageId = deal.properties?.dealstage ?? null;
    const dealModifiedAt = parseDate(deal.properties?.hs_lastmodifieddate);
    if (
      dealModifiedAt &&
      (!Number.isFinite(newestDealModifiedAtMs) || dealModifiedAt.getTime() > newestDealModifiedAtMs)
    ) {
      newestDealModifiedAtMs = dealModifiedAt.getTime();
      newestDealId = deal.id;
    }

    const signals: HubSpotCustomerSignal[] = [];

    if (stageId) {
      const template = config.stageSignals[stageId];
      if (
        template &&
        dealModifiedAt &&
        (!Number.isFinite(checkpointDealMs) || dealModifiedAt.getTime() > checkpointDealMs)
      ) {
        signals.push(
          buildStageSignal({
            deal,
            stageId,
            template,
            portalId,
            modifiedAt: dealModifiedAt,
          })
        );
      }
    }

    if (Object.keys(config.contactLifecycleSignals).length > 0) {
      const contactIds = await withRetries(() =>
        listDealContactIds({
          accessToken,
          dealId: deal.id,
          maxContactsPerDeal: config.maxContactsPerDeal,
        })
      );

      for (const contactId of contactIds) {
        scannedContacts += 1;

        let contact: HubSpotContact;
        try {
          contact = await withRetries(() => fetchContact(accessToken, contactId));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push({
            externalObjectId: `${deal.id}:contact:${contactId}`,
            signalKey: "contact-fetch",
            error: message,
          });
          continue;
        }

        const lifecycleStageRaw = contact.properties?.lifecyclestage;
        const lifecycleStage =
          typeof lifecycleStageRaw === "string" && lifecycleStageRaw.trim().length > 0
            ? lifecycleStageRaw.trim()
            : null;
        const contactModifiedAt = parseDate(contact.properties?.lastmodifieddate);

        if (
          contactModifiedAt &&
          (!Number.isFinite(newestContactModifiedAtMs) ||
            contactModifiedAt.getTime() > newestContactModifiedAtMs)
        ) {
          newestContactModifiedAtMs = contactModifiedAt.getTime();
          newestContactId = contact.id;
        }

        if (!lifecycleStage || !contactModifiedAt) {
          continue;
        }

        const template = config.contactLifecycleSignals[lifecycleStage];
        if (!template) {
          continue;
        }

        if (Number.isFinite(checkpointContactMs) && contactModifiedAt.getTime() <= checkpointContactMs) {
          continue;
        }

        signals.push(
          buildContactSignal({
            deal,
            contact,
            lifecycleStage,
            template,
            portalId,
            modifiedAt: contactModifiedAt,
          })
        );
      }
    }

    detectedSignals += signals.length;

    for (const signal of signals) {
      const dedupeKey = buildHubSpotCustomerSignalDedupeKey({
        externalObjectId: signal.externalObjectId,
        ruleVariant: signal.signalKey,
      });

      const dueDate = addDays(new Date(), signal.template.dueInDays);
      const priority = mapPriority(signal.template.priority);

      if (input.dryRun) {
        tasks.push({
          dealId: signal.dealId,
          contactId: signal.contactId ?? null,
          signalVariant: signal.variant,
          signalKey: signal.signalKey,
          taskId: "dry-run",
          title: buildTaskTitle({ dealName: signal.dealName, signalLabel: signal.signalLabel }),
          sourceUrl: signal.sourceUrl,
          operation: "created",
        });
        continue;
      }

      try {
        const { assigneeId, ownerEmail } = await resolveAssignee({
          fallbackUserId: input.userId,
          ownerId: signal.ownerId,
          accessToken,
          ownerCache,
        });

        const title = buildTaskTitle({ dealName: signal.dealName, signalLabel: signal.signalLabel });
        const notes = buildTaskNotes({
          signal,
          sourceUrl: signal.sourceUrl,
          ownerEmail,
        });

        const upsert = await withRetries(() =>
          prisma.$transaction(async (transaction) => {
            const existingReceipt = await transaction.integrationReceipt.findUnique({
              where: { dedupeKey },
              select: { id: true, taskId: true },
            });

            if (existingReceipt?.taskId) {
              const existingTask = await transaction.task.findUnique({
                where: { id: existingReceipt.taskId },
                select: { id: true, title: true, status: true },
              });

              if (existingTask) {
                const nextStatus = existingTask.status === "DONE" ? defaultStatus : existingTask.status;
                const nextColumnOrder =
                  existingTask.status === "DONE"
                    ? await getNextColumnOrder(transaction as unknown as typeof prisma, nextStatus)
                    : undefined;

                const updatedTask = await transaction.task.update({
                  where: { id: existingTask.id },
                  data: {
                    title,
                    notes,
                    priority,
                    dueDate,
                    status: nextStatus,
                    assignedOn: new Date(),
                    columnOrder: nextColumnOrder,
                    metadata: {
                      integration: {
                        provider: "hubspot",
                        externalId: signal.externalObjectId,
                        externalObjectType: "hubspot_customer_signal",
                        ruleId: rule.id,
                        sourceUrl: signal.sourceUrl,
                        lastObservedAt: signal.observedAt.toISOString(),
                        dedupeKey,
                      },
                      customerSignal: {
                        variant: signal.variant,
                        signalKey: signal.signalKey,
                        label: signal.signalLabel,
                        reason: signal.reason,
                        stageId: signal.stageId,
                        contactId: signal.contactId,
                        lifecycleStage: signal.lifecycleStage,
                      },
                    },
                    responsible: {
                      set: [{ id: assigneeId }],
                    },
                    statusHistory:
                      existingTask.status === "DONE"
                        ? {
                            create: {
                              fromStatus: "DONE",
                              toStatus: nextStatus,
                              changedBy: input.userId,
                            },
                          }
                        : undefined,
                  },
                  select: {
                    id: true,
                    title: true,
                  },
                });

                await transaction.integrationReceipt.update({
                  where: { id: existingReceipt.id },
                  data: {
                    sourceUrl: signal.sourceUrl,
                    lastObservedAt: signal.observedAt,
                    metadata: {
                      signalKey: signal.signalKey,
                      variant: signal.variant,
                      label: signal.signalLabel,
                      reason: signal.reason,
                      stageId: signal.stageId,
                      contactId: signal.contactId,
                      lifecycleStage: signal.lifecycleStage,
                    },
                  },
                });

                await publishDomainEvent(
                  {
                    eventType: "integration.hubspot.customer_signal_task_updated",
                    aggregateType: "integration_rule",
                    aggregateId: rule.id,
                    payload: {
                      ruleId: rule.id,
                      taskId: updatedTask.id,
                      externalObjectId: signal.externalObjectId,
                      signalKey: signal.signalKey,
                      sourceUrl: signal.sourceUrl,
                    },
                    idempotencyKey: buildOutboxIdempotencyKey({
                      aggregateType: "integration_rule",
                      aggregateId: rule.id,
                      eventType: `hubspot_customer_signal_updated_${signal.externalObjectId}`,
                    }),
                  },
                  transaction
                );

                return {
                  operation: "updated" as const,
                  taskId: updatedTask.id,
                  title: updatedTask.title,
                };
              }
            }

            const receipt = await transaction.integrationReceipt.create({
              data: {
                ruleId: rule.id,
                dedupeKey,
                externalObjectType: "hubspot_customer_signal",
                externalObjectId: signal.externalObjectId,
                sourceUrl: signal.sourceUrl,
                lastObservedAt: signal.observedAt,
                metadata: {
                  signalKey: signal.signalKey,
                  variant: signal.variant,
                  label: signal.signalLabel,
                  reason: signal.reason,
                  stageId: signal.stageId,
                  contactId: signal.contactId,
                  lifecycleStage: signal.lifecycleStage,
                },
              },
            });

            const nextColumnOrder = await getNextColumnOrder(
              transaction as unknown as typeof prisma,
              defaultStatus
            );

            const task = await transaction.task.create({
              data: {
                title,
                notes,
                status: defaultStatus,
                priority,
                dueDate,
                assignedOn: new Date(),
                columnOrder: nextColumnOrder,
                metadata: {
                  integration: {
                    provider: "hubspot",
                    externalId: signal.externalObjectId,
                    externalObjectType: "hubspot_customer_signal",
                    ruleId: rule.id,
                    sourceUrl: signal.sourceUrl,
                    lastObservedAt: signal.observedAt.toISOString(),
                    dedupeKey,
                  },
                  customerSignal: {
                    variant: signal.variant,
                    signalKey: signal.signalKey,
                    label: signal.signalLabel,
                    reason: signal.reason,
                    stageId: signal.stageId,
                    contactId: signal.contactId,
                    lifecycleStage: signal.lifecycleStage,
                  },
                },
                responsible: {
                  connect: [{ id: assigneeId }],
                },
                statusHistory: {
                  create: {
                    fromStatus: null,
                    toStatus: defaultStatus,
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
              data: {
                taskId: task.id,
              },
            });

            await publishDomainEvent(
              {
                eventType: "integration.hubspot.customer_signal_task_created",
                aggregateType: "integration_rule",
                aggregateId: rule.id,
                payload: {
                  ruleId: rule.id,
                  taskId: task.id,
                  externalObjectId: signal.externalObjectId,
                  signalKey: signal.signalKey,
                  sourceUrl: signal.sourceUrl,
                },
                idempotencyKey: buildOutboxIdempotencyKey({
                  aggregateType: "integration_rule",
                  aggregateId: rule.id,
                  eventType: `hubspot_customer_signal_created_${signal.externalObjectId}`,
                }),
              },
              transaction
            );

            return {
              operation: "created" as const,
              taskId: task.id,
              title: task.title,
            };
          })
        );

        if (upsert.operation === "created") {
          createdTasks += 1;
        } else {
          updatedTasks += 1;
        }

        tasks.push({
          dealId: signal.dealId,
          contactId: signal.contactId ?? null,
          signalVariant: signal.variant,
          signalKey: signal.signalKey,
          taskId: upsert.taskId,
          title: upsert.title,
          sourceUrl: signal.sourceUrl,
          operation: upsert.operation,
        });

        console.info("integration.hubspot.customer_signal.upserted", {
          provider: "hubspot",
          ruleId: rule.id,
          externalId: signal.externalObjectId,
          signalKey: signal.signalKey,
          operation: upsert.operation,
          taskId: upsert.taskId,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          dedupedTasks += 1;
          console.info("integration.hubspot.customer_signal.deduped", {
            provider: "hubspot",
            ruleId: rule.id,
            externalId: signal.externalObjectId,
            signalKey: signal.signalKey,
            dedupeKey,
          });
          continue;
        }

        failedTasks += 1;
        const message = error instanceof Error ? error.message : String(error);
        errors.push({
          externalObjectId: signal.externalObjectId,
          signalKey: signal.signalKey,
          error: message,
        });

        await recordDeadLetterFailure({
          ruleId: rule.id,
          externalObjectId: signal.externalObjectId,
          signalKey: signal.signalKey,
          error: message,
        });

        console.error("integration.hubspot.customer_signal.failed", {
          provider: "hubspot",
          ruleId: rule.id,
          externalId: signal.externalObjectId,
          signalKey: signal.signalKey,
          error: message,
        });
      }
    }
  }

  const checkpointOut: HubSpotCustomerSignalCheckpoint = {
    lastDealModifiedAt: Number.isFinite(newestDealModifiedAtMs)
      ? new Date(newestDealModifiedAtMs).toISOString()
      : checkpoint.lastDealModifiedAt,
    lastDealId: newestDealId,
    lastContactModifiedAt: Number.isFinite(newestContactModifiedAtMs)
      ? new Date(newestContactModifiedAtMs).toISOString()
      : checkpoint.lastContactModifiedAt,
    lastContactId: newestContactId,
  };

  const observedCandidates = [
    checkpointOut.lastDealModifiedAt ? Date.parse(checkpointOut.lastDealModifiedAt) : Number.NaN,
    checkpointOut.lastContactModifiedAt ? Date.parse(checkpointOut.lastContactModifiedAt) : Number.NaN,
  ].filter(Number.isFinite);

  const lastObservedAt =
    observedCandidates.length > 0
      ? new Date(Math.max(...(observedCandidates as number[])))
      : rule.lastObservedAt;

  await prisma.integrationRule.update({
    where: { id: rule.id },
    data: {
      checkpoint: checkpointOut as unknown as Prisma.InputJsonValue,
      lastObservedAt,
      lastRunAt: new Date(),
      lastError: errors.length > 0 ? `${errors.length} customer signal task(s) failed` : null,
    },
  });

  await prisma.integrationConnection.updateMany({
    where: {
      userId: input.userId,
      provider: IntegrationProvider.HUBSPOT,
    },
    data: {
      status: IntegrationConnectionStatus.CONNECTED,
      lastError: errors.length > 0 ? `${errors.length} customer signal task(s) failed` : null,
      lastSyncedAt: new Date(),
    },
  });

  _cbSuccess = true;
  return {
    ruleId: rule.id,
    enabled: true,
    scannedDeals: deals.length,
    scannedContacts,
    detectedSignals,
    createdTasks,
    updatedTasks,
    dedupedTasks,
    failedTasks,
    cursor: checkpointOut,
    tasks,
    errors,
  };
  } finally {
    if (_cbSuccess) recordSuccess(CB_PROVIDER, input.userId);
    else recordFailure(CB_PROVIDER, input.userId);
  }
}
