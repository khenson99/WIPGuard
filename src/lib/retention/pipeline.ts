import {
  CustomerExternalProvider,
  Prisma,
  RetentionTenantStatus as PrismaRetentionTenantStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_RETENTION_LIR_BY_PHASE,
  RETENTION_CANDIDATE_LIRS,
  RETENTION_FEATURE_VERSION,
} from "@/lib/retention/lir-config";
import {
  buildReasonCode,
  classifyRetentionStatus,
  evaluateLir,
  retentionStatusToDb,
} from "@/lib/retention/status";
import type {
  RetentionActor,
} from "@/lib/retention/service";
import type {
  RetentionAnalysisCandidateResult,
  RetentionCoveragePayload,
  RetentionCurrentDetailPayload,
  RetentionFeaturePayload,
  RetentionLifecyclePhase,
  LirDefinition,
  RetentionOutcomePayload,
  RetentionReasonCode,
} from "@/lib/retention/types";
import {
  fetchPylonIssues,
  getPylonIssuePriority,
  getPylonIssueStatus,
  getPylonIssueTags,
} from "@/lib/integrations/pylon-client";
import {
  discoverArdaTenantIdsFromUserDetails,
  extractArdaTenantIdsFromResult,
  normalizeArdaTenantLookupKey,
} from "@/lib/retention/arda-tenant-resolution";
import { normalizeCodaMasterOrderArchiveRow } from "@/lib/retention/coda-normalization";
import { runWithContextAsync } from "@/lib/request-context";

interface SourceSeedRecord {
  source: "ARDA" | "CODA" | "STRIPE" | "HUBSPOT" | "PYLON";
  objectType: string;
  externalId: string;
  tenantKey?: string | null;
  occurredAt?: string | null;
  sourceCreatedAt?: string | null;
  sourceUpdatedAt?: string | null;
  payload: Record<string, unknown>;
}

interface IdentityIndexes {
  externalRefToCustomerId: Map<string, string>;
  dealCompanyByDomain: Map<string, string>;
  customerByName: Map<string, string>;
  customerByDomain: Map<string, string>;
}

interface CustomerIndexSeed {
  id: string;
  name: string;
  dealCompany: {
    domain: string | null;
  } | null;
}

interface CodaApiRow {
  [key: string]: unknown;
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  values?: Record<string, unknown>;
}

interface ArdaTenantConfig {
  tenantId: string;
  configuredTenantId: string;
  tenantName: string;
  companyName: string;
  customerStatus: string | null;
  health: string | null;
  mainCodaDocId: string | null;
  orderArchiveDocumentId: string | null;
  churned: boolean;
  resultTenantIds: string[];
}

interface MaterializedArdaTenantConfig extends ArdaTenantConfig {
  tenantIdResolved: boolean;
}

interface ArdaEntityRecord {
  rId?: string;
  asOf?: Record<string, unknown>;
  createdAt?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

interface ArdaPageResult {
  results?: ArdaEntityRecord[];
  nextPage?: string | null;
}

interface DerivedExternalRefSeed {
  customerRecordId: string;
  provider: CustomerExternalProvider;
  externalObjectType: string;
  externalId: string;
  label: string | null;
  isPrimary: boolean;
  metadata: Record<string, unknown>;
}

interface MonthlyTenantAccumulator {
  customerRecordId: string;
  monthStart: Date;
  monthEnd: Date;
  coverage: RetentionCoveragePayload;
  customerName: string;
  externalIds: Set<string>;
  goLiveDate: string | null;
  subscriptionStartDate: string | null;
  firstOrderDate: string | null;
  implementationStage: string | null;
  ownerName: string | null;
  segment: string | null;
  plan: string | null;
  icp: boolean;
  mrr: number | null;
  arr: number | null;
  daysActive: Set<string>;
  activeWeeks: Set<string>;
  orderCount: number;
  cardTouches: number;
  itemTouches: number;
  activeCardCount: number;
  activeItemCount: number;
  locations: Set<string>;
  workflows: Set<string>;
  ticketsLast30: number;
  unresolvedTickets: number;
  urgentTickets: number;
  bugTickets: number;
  failedPayments: number;
  delinquent: boolean;
  downgraded: boolean;
  contractionDetected: boolean;
  invoiceIrregularities: number;
  crmChurnFlag: boolean;
  dataSignals: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (["true", "yes", "1"].includes(lowered)) return true;
    if (["false", "no", "0"].includes(lowered)) return false;
  }
  return null;
}

function isUuid(value: string | null): value is string {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

const ARDA_CUSTOMER_NAME_ALIASES: Record<string, string> = {
  austere: "Austere Manufacturing",
  "austere manufacturing": "Austere Manufacturing",
  "north east precision cnc": "Northeast Precision CNC",
  "norteast precision cnc": "Northeast Precision CNC",
  "northeast precision cnc": "Northeast Precision CNC",
  contoro: "Contoro Robotics",
  "contoro robotics": "Contoro Robotics",
  "arda merch inc.": "Arda Merchandising",
  "arda merch inc": "Arda Merchandising",
  "arda merchendising": "Arda Merchandising",
  "lights out mfg": "Lights Out Manufacturing",
  neff: "Neff Machine",
  lichen: "Lichen Precision",
  blackwell: "Blackwell Engineering",
  reachable: "Reachable Technology LLC",
  bluewater: "Bluewater Sportfishing Boats",
  gimbel: "Gimbel Group",
};

const ARDA_CUSTOMER_TENANT_IDS: Record<string, string[]> = {
  "Austere Manufacturing": ["8d53c9a0-3e9c-4f5a-9dbe-ad06b56bc3e4"],
  "Blackwell Engineering": ["b5ea0be9-ce18-4bf0-81c8-b5981a893189"],
  "Bluewater Sportfishing Boats": ["2d7a820e-f4e4-48bc-8c6d-4307a151b5cc"],
  "Gimbel Group": ["9189acf9-4f89-46cd-9760-0d4933d58c67"],
  "Lichen Precision": ["6d81d80e-7010-468f-a191-f1dab4f4fc79"],
  "Lights Out Manufacturing": ["baa1f883-ecfa-4912-b5be-d5784d8b96a4"],
  "Neff Machine": ["1193d42d-ef80-4bc8-ab11-84e5c8046892"],
  "Reachable Technology LLC": ["9db131b9-da94-4c20-bcab-0f70e079bd0d"],
  "Roam Rig": [
    "a9e3aef7-86aa-4199-bfa7-0e29d05b2774",
    "e7a57a86-bef9-4dcf-b39e-c956da5d15c1",
    "3a1aa0ea-6611-477f-bb30-36058c40eee8",
    "9db77bed-83ee-4b19-afb6-0b670e37cd20",
  ],
  "The Label Factory": ["21ee51b8-2ec8-4adc-879e-8f0cd3dd804a"],
};

function normalizeArdaCustomerName(name: string | null): string | null {
  if (!name) return null;
  const lowered = name.trim().toLowerCase().replace(/\s+/g, " ");
  return ARDA_CUSTOMER_NAME_ALIASES[lowered] ?? name.trim();
}

function asReasonCodes(value: unknown): RetentionReasonCode[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const item = asRecord(entry);
      const code = asString(item.code);
      const label = asString(item.label);
      const detail = asString(item.detail);
      const severity = asString(item.severity);
      const dimension = asString(item.dimension);
      if (!code || !label || !detail || !severity || !dimension) return null;
      return {
        code,
        label,
        detail,
        severity: severity as RetentionReasonCode["severity"],
        dimension: dimension as RetentionReasonCode["dimension"],
      };
    })
    .filter((entry): entry is RetentionReasonCode => entry !== null);
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const raw = asString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isoOrNull(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

function asTimestamp(value: unknown): number | null {
  const record = asRecord(value);
  return asNumber(record.recorded) ?? asNumber(record.effective);
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function weekKey(date: Date): string {
  const copy = new Date(date);
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((copy.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${copy.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function monthBounds(date: Date): { monthStart: Date; monthEnd: Date } {
  const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { monthStart, monthEnd };
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function shiftUtcDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function normalizeDomain(value: string | null): string | null {
  if (!value) return null;
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

function normalizeName(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function timestampToIso(timestamp: number | null): string | null {
  return timestamp ? new Date(timestamp).toISOString() : null;
}

function ardaCreatedTimestamp(record: ArdaEntityRecord): string | null {
  return timestampToIso(asTimestamp(record.createdAt));
}

function ardaObservedTimestamp(record: ArdaEntityRecord): string | null {
  return timestampToIso(asTimestamp(record.asOf));
}

function ardaOccurredAt(record: ArdaEntityRecord): string | null {
  return ardaCreatedTimestamp(record) ?? ardaObservedTimestamp(record);
}

function ardaPayload(record: ArdaEntityRecord): Record<string, unknown> {
  return asRecord(record.payload);
}

function ardaRecordId(record: ArdaEntityRecord): string | null {
  const payload = ardaPayload(record);
  return (
    asString(record.rId) ??
    asString(payload.id) ??
    asString(payload.eid) ??
    asString(payload.entityId)
  );
}

function buildArdaAuthHeaderCandidates(token: string): Array<Record<string, string>> {
  const trimmed = token.trim();
  if (!trimmed) return [];

  const explicitHeader = asString(process.env.ARDA_API_AUTH_HEADER);
  const bearerValue = trimmed.toLowerCase().startsWith("bearer ") ? trimmed : `Bearer ${trimmed}`;
  const candidates: Array<Record<string, string>> = [];
  const seen = new Set<string>();

  const pushCandidate = (headerName: string | null, value: string) => {
    if (!headerName) return;
    const normalizedHeader = headerName.trim();
    if (!normalizedHeader) return;
    const key = `${normalizedHeader.toLowerCase()}::${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ [normalizedHeader]: value });
  };

  if (explicitHeader) {
    pushCandidate(
      explicitHeader,
      explicitHeader.toLowerCase() === "authorization" ? bearerValue : trimmed
    );
  }

  pushCandidate("bearer-token-arda-auth", trimmed);
  pushCandidate("Authorization", bearerValue);

  return candidates;
}

async function fetchCodaApiRows(
  docId: string,
  tableId: string,
  token: string,
  pageLimit = 10,
  useColumnNames = true
): Promise<CodaApiRow[]> {
  const headers = {
    Authorization: `Bearer ${token}`,
  };
  const rows: CodaApiRow[] = [];
  let pageToken: string | null = null;

  for (let page = 0; page < pageLimit; page += 1) {
    const url = new URL(
      `https://coda.io/apis/v1/docs/${encodeURIComponent(docId)}/tables/${encodeURIComponent(tableId)}/rows`
    );
    url.searchParams.set("limit", "500");
    url.searchParams.set("useColumnNames", useColumnNames ? "true" : "false");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { headers, cache: "no-store" });
    if (!response.ok) {
      if (response.status === 404) {
        console.warn(
          `[retention] skipping missing Coda source doc=${docId} table=${tableId} (${response.status} ${response.statusText})`
        );
        return rows;
      }
      throw new Error(
        `Coda request failed for doc ${docId} table ${tableId}: ${response.status} ${response.statusText}`
      );
    }
    const payload = (await response.json()) as { items?: CodaApiRow[]; nextPageToken?: string };
    rows.push(...(Array.isArray(payload.items) ? payload.items : []));
    pageToken = asString(payload.nextPageToken);
    if (!pageToken) break;
  }

  return rows;
}

function normalizeArdaTenantConfigRow(row: CodaApiRow): ArdaTenantConfig | null {
  const values = asRecord(row.values);
  const tenantId = asString(values.tenantId);
  const companyName =
    asString(values.CompanyName) ??
    asString(asRecord(values.Customer).name) ??
    asString(values.Customer);
  if (!tenantId || !companyName) return null;

  const loweredTenantId = tenantId.toLowerCase();
  if (loweredTenantId === "deleted" || loweredTenantId === "not found") return null;

  const customerStatus = asString(values["Customer status"]);
  if ((customerStatus ?? "").toLowerCase().includes("churned")) return null;
  if ((customerStatus ?? "").toLowerCase().includes("potential")) return null;

  return {
    tenantId,
    configuredTenantId: tenantId,
    tenantName: companyName,
    companyName,
    customerStatus,
    health: asString(values.Health),
    mainCodaDocId: asString(values.mainCodaDocId) ?? asString(values["ActiveMainDoc ID"]),
    orderArchiveDocumentId: asString(values.orderArchiveDocumentId),
    churned: Boolean(asBoolean(values.Churned)),
    resultTenantIds: extractArdaTenantIdsFromResult(values.Result),
  };
}

async function discoverArdaTenantIdsByConfig(
  docId: string,
  token: string,
  configs: ArdaTenantConfig[]
): Promise<Map<string, string[]>> {
  const userDetailsTableId =
    process.env.ARDA_USER_DETAILS_TABLE_ID?.trim() ??
    "grid-sync-22507-RowDataObject-dynamic-76fe62dd30b7a8c4df850cd9ee639fcfdf09c9067d2e7472911d2a718e7e2f1f";
  try {
    const rows = await fetchCodaApiRows(docId, userDetailsTableId, token, 5, false);
    return discoverArdaTenantIdsFromUserDetails(
      configs.map((config) => ({
        configuredTenantId: config.configuredTenantId,
        companyName: config.companyName,
      })),
      rows.map((row) => {
        const values = asRecord(row.values);
        return {
          email: asString(values["c-qNAXS3SO0E"]),
          tenantId: asString(values["c-WEBsoGYauT"]),
        };
      })
    );
  } catch (error) {
    console.warn(
      `[retention] Unable to derive Arda tenant UUIDs from User Details: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return new Map();
  }
}

function resolveArdaTenantIds(
  config: ArdaTenantConfig,
  discoveredTenantIdsByConfig: Map<string, string[]>
): string[] {
  if (isUuid(config.tenantId)) return [config.tenantId];
  if (config.resultTenantIds.length > 0) return config.resultTenantIds;

  const normalizedCompanyName =
    normalizeArdaCustomerName(config.companyName) ?? normalizeArdaCustomerName(config.tenantName);
  if (normalizedCompanyName) {
    const manualTenantIds = ARDA_CUSTOMER_TENANT_IDS[normalizedCompanyName];
    if (manualTenantIds?.length) return manualTenantIds;
  }

  return (
    discoveredTenantIdsByConfig.get(
      normalizeArdaTenantLookupKey(config.configuredTenantId)
    ) ??
    []
  );
}

function fallbackArdaTenantExternalId(config: ArdaTenantConfig): string {
  return (
    config.configuredTenantId ||
    normalizeArdaTenantLookupKey(
      normalizeArdaCustomerName(config.companyName) ??
        normalizeArdaCustomerName(config.tenantName) ??
        config.companyName
    ) ||
    crypto.randomUUID()
  );
}

function materializeArdaTenantConfigs(
  configs: ArdaTenantConfig[],
  discoveredTenantIdsByConfig: Map<string, string[]>
): MaterializedArdaTenantConfig[] {
  const materialized: MaterializedArdaTenantConfig[] = [];
  const unresolved: string[] = [];

  for (const config of configs) {
    const tenantIds = resolveArdaTenantIds(config, discoveredTenantIdsByConfig);
    if (tenantIds.length === 0) {
      unresolved.push(config.companyName);
      materialized.push({
        ...config,
        tenantId: fallbackArdaTenantExternalId(config),
        tenantIdResolved: false,
      });
      continue;
    }

    for (const tenantId of tenantIds) {
      materialized.push({
        ...config,
        tenantId,
        tenantIdResolved: true,
      });
    }
  }

  if (unresolved.length > 0) {
    console.warn(
      `[retention] Keeping ${unresolved.length} Arda tenant configs without UUID resolution as metadata-only rows`,
      unresolved.slice(0, 10)
    );
  }

  return materialized;
}

async function loadArdaTenantConfigs(): Promise<MaterializedArdaTenantConfig[]> {
  const token = process.env.CODA_API_TOKEN?.trim();
  const docId = process.env.ARDA_TENANT_CONFIG_CODA_DOC_ID?.trim() || "oRkoolViAM";
  const tableId = process.env.ARDA_TENANT_CONFIG_TABLE_ID?.trim() || "grid-5Kc9QNP-nT";
  if (!token) return [];

  const rows = await fetchCodaApiRows(docId, tableId, token, 5);
  const configs = rows
    .map(normalizeArdaTenantConfigRow)
    .filter((config): config is ArdaTenantConfig => config !== null);
  const discoveredTenantIdsByConfig = await discoverArdaTenantIdsByConfig(
    docId,
    token,
    configs
  );

  if (discoveredTenantIdsByConfig.size > 0) {
    console.info(
      `[retention] Discovered ${discoveredTenantIdsByConfig.size} Arda tenant UUID mappings from User Details`
    );
  }

  return materializeArdaTenantConfigs(configs, discoveredTenantIdsByConfig);
}

async function fetchArdaPage(
  requestPath: string,
  init: RequestInit,
  sharedHeaders: Record<string, string>
): Promise<Response> {
  const token = process.env.ARDA_API_TOKEN?.trim();
  if (!token) {
    throw new Error("ARDA_API_TOKEN is required for Arda retention sync.");
  }

  const authHeaderCandidates = buildArdaAuthHeaderCandidates(token);
  let lastUnauthorized: Response | null = null;

  for (const authHeaders of authHeaderCandidates) {
    const response = await fetch(requestPath, {
      ...init,
      headers: {
        ...sharedHeaders,
        ...authHeaders,
      },
      cache: "no-store",
    });
    if (response.status !== 401) return response;
    lastUnauthorized = response;
  }

  if (lastUnauthorized) return lastUnauthorized;
  throw new Error("Unable to build Arda auth headers for the configured token.");
}

async function queryArdaCollection(
  endpoint: string,
  tenantId: string,
  asOfMs: number
): Promise<ArdaEntityRecord[]> {
  const baseUrl = process.env.ARDA_API_BASE_URL?.trim();
  if (!baseUrl) return [];

  const sharedHeaders = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Author": process.env.ARDA_API_AUTHOR?.trim() || "WIPGuard-retention-sync",
    "X-Tenant-Id": tenantId,
  };

  const allResults: ArdaEntityRecord[] = [];
  const queryString = `effectiveasof=${asOfMs}&recordedasof=${asOfMs}`;

  const first = await fetchArdaPage(
    `${baseUrl.replace(/\/$/, "")}/v1/${endpoint}/query?${queryString}`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
    sharedHeaders
  );
  if (first.status === 401) {
    throw new Error(
      `Arda request unauthorized for tenant ${tenantId} at ${baseUrl}. The token may not belong to this environment.`
    );
  }
  if (!first.ok) {
    throw new Error(`Arda request failed for ${endpoint}: ${first.status} ${first.statusText}`);
  }

  const firstPage = (await first.json()) as ArdaPageResult;
  allResults.push(...(Array.isArray(firstPage.results) ? firstPage.results : []));

  let nextPage = asString(firstPage.nextPage);
  let pageCount = 0;
  while (nextPage && pageCount < 100) {
    pageCount += 1;
    const response = await fetchArdaPage(
      `${baseUrl.replace(/\/$/, "")}/v1/${endpoint}/query/${encodeURIComponent(nextPage)}?${queryString}`,
      {
        method: "GET",
      },
      sharedHeaders
    );
    if (!response.ok) {
      throw new Error(`Arda pagination failed for ${endpoint}: ${response.status} ${response.statusText}`);
    }
    const page = (await response.json()) as ArdaPageResult;
    allResults.push(...(Array.isArray(page.results) ? page.results : []));
    nextPage = asString(page.nextPage);
  }

  return allResults;
}

function recordDate(seed: SourceSeedRecord): Date | null {
  return parseDate(seed.occurredAt) ?? parseDate(seed.sourceUpdatedAt) ?? parseDate(seed.sourceCreatedAt);
}

async function tableExists(tableName: string): Promise<boolean> {
  const result = await prisma.$queryRaw<Array<{ exists: string | null }>>(
    Prisma.sql`SELECT to_regclass(${`public."${tableName}"`})::text AS exists`
  );
  return Boolean(result[0]?.exists);
}

async function loadCustomerIndexSeeds(organizationId: string): Promise<CustomerIndexSeed[]> {
  try {
    const customers = await prisma.customerRecord.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        dealCompany: {
          select: {
            domain: true,
          },
        },
      },
    });
    return customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      dealCompany: customer.dealCompany ? { domain: customer.dealCompany.domain ?? null } : null,
    }));
  } catch (error) {
    const missingDealCompany =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021";
    if (!missingDealCompany) throw error;
  }

  const customers = await prisma.customerRecord.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
    },
  });

  return customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    dealCompany: null,
  }));
}

async function buildIdentityIndexes(organizationId: string): Promise<IdentityIndexes> {
  const [refs, customers] = await Promise.all([
    prisma.customerRecordExternalRef.findMany({
      where: { organizationId },
      select: {
        provider: true,
        externalId: true,
        customerRecordId: true,
      },
    }),
    loadCustomerIndexSeeds(organizationId),
  ]);

  const externalRefToCustomerId = new Map<string, string>();
  for (const ref of refs) {
    externalRefToCustomerId.set(`${ref.provider}:${ref.externalId}`, ref.customerRecordId);
  }

  const dealCompanyByDomain = new Map<string, string>();
  const customerByName = new Map<string, string>();
  const customerByDomain = new Map<string, string>();
  for (const customer of customers) {
    const normalizedName = normalizeName(customer.name);
    if (normalizedName) customerByName.set(normalizedName, customer.id);
    const domain = normalizeDomain(customer.dealCompany?.domain ?? null);
    if (domain) {
      dealCompanyByDomain.set(domain, customer.id);
      customerByDomain.set(domain, customer.id);
    }
  }

  return {
    externalRefToCustomerId,
    dealCompanyByDomain,
    customerByName,
    customerByDomain,
  };
}

function resolveCustomerRecordId(seed: SourceSeedRecord, indexes: IdentityIndexes): string | null {
  const providerKey = `${seed.source}:${seed.externalId}`;
  const direct = indexes.externalRefToCustomerId.get(providerKey);
  if (direct) return direct;

  const payload = seed.payload;
  const possibleRefs = [
    seed.tenantKey,
    asString(payload.customerRecordId),
    asString(payload.customerId),
    asString(payload.hubspotCompanyId),
    asString(payload.hubspotDealId),
    asString(payload.stripeCustomerId),
    asString(payload.pylonCompanyId),
    asString(payload.ardaTenantId),
  ].filter((value): value is string => Boolean(value));

  for (const ref of possibleRefs) {
    const hit =
      indexes.externalRefToCustomerId.get(`${seed.source}:${ref}`) ??
      indexes.externalRefToCustomerId.get(`HUBSPOT:${ref}`) ??
      indexes.externalRefToCustomerId.get(`STRIPE:${ref}`) ??
      indexes.externalRefToCustomerId.get(`PYLON:${ref}`) ??
      indexes.externalRefToCustomerId.get(`CODA:${ref}`) ??
      indexes.externalRefToCustomerId.get(`INTERNAL:${ref}`);
    if (hit) return hit;
  }

  const domain = normalizeDomain(
    asString(payload.domain) ??
      asString(payload.companyDomain) ??
      asString(payload.emailDomain) ??
      asString(payload.workspaceDomain)
  );
  if (domain) {
    const domainHit = indexes.customerByDomain.get(domain) ?? indexes.dealCompanyByDomain.get(domain);
    if (domainHit) return domainHit;
  }

  const name = normalizeName(
    asString(payload.tenantName) ??
      asString(payload.customerName) ??
      asString(payload.companyName) ??
      asString(payload.accountName)
  );
  if (name) {
    return indexes.customerByName.get(name) ?? null;
  }

  return null;
}

async function createSyncRun(
  actor: RetentionActor,
  source: SourceSeedRecord["source"]
): Promise<string> {
  const run = await prisma.retentionSyncRun.create({
    data: {
      organizationId: actor.organizationId,
      source,
      status: "SUCCESS",
    },
    select: { id: true },
  });
  return run.id;
}

async function finalizeSyncRun(input: {
  runId: string;
  status: "SUCCESS" | "PARTIAL" | "ERROR";
  recordCount: number;
  mappedCount: number;
  errorCount: number;
  lastError?: string | null;
  windowStart?: Date | null;
  windowEnd?: Date | null;
  notes?: Record<string, unknown>;
}): Promise<void> {
  await prisma.retentionSyncRun.update({
    where: { id: input.runId },
    data: {
      status: input.status,
      completedAt: new Date(),
      recordCount: input.recordCount,
      mappedCount: input.mappedCount,
      errorCount: input.errorCount,
      lastError: input.lastError ?? null,
      windowStart: input.windowStart ?? null,
      windowEnd: input.windowEnd ?? null,
      notes: input.notes as Prisma.InputJsonValue | undefined,
    },
  });
}

async function upsertSourceRecords(
  actor: RetentionActor,
  runId: string,
  rows: SourceSeedRecord[],
  indexes: IdentityIndexes
): Promise<{ mappedCount: number; windowStart: Date | null; windowEnd: Date | null }> {
  let mappedCount = 0;
  let windowStart: Date | null = null;
  let windowEnd: Date | null = null;

  for (const row of rows) {
    const occurred = recordDate(row);
    if (occurred && (!windowStart || occurred < windowStart)) windowStart = occurred;
    if (occurred && (!windowEnd || occurred > windowEnd)) windowEnd = occurred;

    const customerRecordId = resolveCustomerRecordId(row, indexes);
    if (customerRecordId) mappedCount += 1;

    await prisma.retentionSourceRecord.upsert({
      where: {
        source_objectType_externalId: {
          source: row.source,
          objectType: row.objectType,
          externalId: row.externalId,
        },
      },
      create: {
        syncRunId: runId,
        source: row.source,
        objectType: row.objectType,
        externalId: row.externalId,
        tenantKey: row.tenantKey ?? null,
        occurredAt: occurred,
        sourceCreatedAt: parseDate(row.sourceCreatedAt),
        sourceUpdatedAt: parseDate(row.sourceUpdatedAt),
        payload: row.payload as Prisma.InputJsonValue,
        customerRecordId,
        organizationId: actor.organizationId,
      },
      update: {
        syncRunId: runId,
        tenantKey: row.tenantKey ?? null,
        occurredAt: occurred,
        sourceCreatedAt: parseDate(row.sourceCreatedAt),
        sourceUpdatedAt: parseDate(row.sourceUpdatedAt),
        payload: row.payload as Prisma.InputJsonValue,
        customerRecordId,
        organizationId: actor.organizationId,
      },
    });
  }

  return { mappedCount, windowStart, windowEnd };
}

function buildDerivedCodaExternalRefsFromSourceRecords(
  records: Array<{
    customerRecordId: string;
    source: string;
    objectType: string;
    payload: Record<string, unknown>;
  }>
): DerivedExternalRefSeed[] {
  const latestArdaTenantByCustomer = new Map<string, Record<string, unknown>>();
  for (const record of records) {
    if (record.source !== "ARDA" || record.objectType !== "tenant") continue;
    if (!latestArdaTenantByCustomer.has(record.customerRecordId)) {
      latestArdaTenantByCustomer.set(record.customerRecordId, record.payload);
    }
  }

  const refs = new Map<string, DerivedExternalRefSeed>();
  for (const [customerRecordId, payload] of latestArdaTenantByCustomer.entries()) {
    const mainDocId = asString(payload.mainCodaDocId);
    if (mainDocId) {
      refs.set(`${customerRecordId}:CODA:doc:${mainDocId}`, {
        customerRecordId,
        provider: CustomerExternalProvider.CODA,
        externalObjectType: "doc",
        externalId: mainDocId,
        label: "Customer Success and Implementation",
        isPrimary: true,
        metadata: {
          docUrl: `https://coda.io/d/_d${encodeURIComponent(mainDocId)}`,
          source: "retention_arda_tenant",
        },
      });
    }

    const orderArchiveDocumentId = asString(payload.orderArchiveDocumentId);
    if (orderArchiveDocumentId) {
      refs.set(`${customerRecordId}:CODA:order_archive_doc:${orderArchiveDocumentId}`, {
        customerRecordId,
        provider: CustomerExternalProvider.CODA,
        externalObjectType: "order_archive_doc",
        externalId: orderArchiveDocumentId,
        label: "Master Order Archive",
        isPrimary: !mainDocId,
        metadata: {
          docUrl: `https://coda.io/d/_d${encodeURIComponent(orderArchiveDocumentId)}`,
          source: "retention_arda_tenant",
        },
      });
    }
  }

  return [...refs.values()];
}

async function syncDerivedCustomerExternalRefs(actor: RetentionActor): Promise<void> {
  const sourceRecords = await prisma.retentionSourceRecord.findMany({
    where: {
      organizationId: actor.organizationId,
      customerRecordId: { not: null },
      source: "ARDA",
      objectType: "tenant",
    },
    orderBy: [{ sourceUpdatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      customerRecordId: true,
      source: true,
      objectType: true,
      payload: true,
    },
  });

  const derivedRefs = buildDerivedCodaExternalRefsFromSourceRecords(
    sourceRecords.map((record) => ({
      customerRecordId: record.customerRecordId!,
      source: record.source,
      objectType: record.objectType,
      payload: asRecord(record.payload),
    }))
  );

  for (const ref of derivedRefs) {
    await prisma.customerRecordExternalRef.upsert({
      where: {
        customerRecordId_provider_externalObjectType_externalId: {
          customerRecordId: ref.customerRecordId,
          provider: ref.provider,
          externalObjectType: ref.externalObjectType,
          externalId: ref.externalId,
        },
      },
      create: {
        customerRecordId: ref.customerRecordId,
        organizationId: actor.organizationId,
        provider: ref.provider,
        externalObjectType: ref.externalObjectType,
        externalId: ref.externalId,
        label: ref.label,
        isPrimary: ref.isPrimary,
        metadata: ref.metadata as Prisma.InputJsonValue,
      },
      update: {
        organizationId: actor.organizationId,
        label: ref.label,
        isPrimary: ref.isPrimary,
        metadata: ref.metadata as Prisma.InputJsonValue,
      },
    });
  }
}

async function loadHubSpotSourceRecords(actor: RetentionActor): Promise<SourceSeedRecord[]> {
  const [hasDealCompany, hasDeal] = await Promise.all([tableExists("DealCompany"), tableExists("Deal")]);

  const customers = await prisma.customerRecord.findMany({
    where: { organizationId: actor.organizationId },
    include: {
      owner: { select: { name: true } },
      ...(hasDealCompany
        ? { dealCompany: { select: { name: true, domain: true, industry: true, hubspotCompanyId: true } } }
        : {}),
      ...(hasDeal
        ? {
            primaryDeal: {
              select: { id: true, amount: true, stage: true, hubspotDealId: true, expectedCloseDate: true, createdAt: true },
            },
          }
        : {}),
      externalRefs: {
        where: { provider: "HUBSPOT" },
        select: { externalId: true, externalObjectType: true, metadata: true },
      },
    },
  });

  return customers.flatMap((customer) => {
    const payload: Record<string, unknown> = {
      customerRecordId: customer.id,
      customerName: customer.name,
      companyName: customer.dealCompany?.name ?? customer.name,
      domain: customer.dealCompany?.domain ?? null,
      industry: customer.dealCompany?.industry ?? null,
      hubspotCompanyId:
        customer.dealCompany?.hubspotCompanyId ??
        customer.externalRefs.find((ref) => ref.externalObjectType === "company")?.externalId ??
        null,
      hubspotDealId:
        customer.primaryDeal?.hubspotDealId ??
        customer.externalRefs.find((ref) => ref.externalObjectType === "deal")?.externalId ??
        null,
      amount: customer.primaryDeal?.amount ?? null,
      ownerName: customer.owner?.name ?? null,
      lifecycleStage: customer.lifecycleStage,
      segment: customer.segment,
      tier: customer.tier,
      expectedCloseDate: isoOrNull(customer.primaryDeal?.expectedCloseDate ?? null),
      createdAt: isoOrNull(customer.primaryDeal?.createdAt ?? customer.createdAt),
    };
    return [
      {
        source: "HUBSPOT",
        objectType: "account",
        externalId:
          asString(payload.hubspotCompanyId) ??
          asString(payload.hubspotDealId) ??
          customer.id,
        tenantKey: customer.id,
        occurredAt: asString(payload.createdAt),
        sourceCreatedAt: asString(payload.createdAt),
        sourceUpdatedAt: isoOrNull(customer.updatedAt),
        payload,
      },
    ] satisfies SourceSeedRecord[];
  });
}

async function loadStripeSourceRecords(): Promise<SourceSeedRecord[]> {
  const apiKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!apiKey) return [];

  const headers = {
    Authorization: `Bearer ${apiKey}`,
  };
  const records: SourceSeedRecord[] = [];
  let startingAfter: string | null = null;

  for (let page = 0; page < 5; page += 1) {
    const url = new URL("https://api.stripe.com/v1/subscriptions");
    url.searchParams.set("limit", "100");
    url.searchParams.set("status", "all");
    url.searchParams.set("expand[]", "data.customer");
    if (startingAfter) url.searchParams.set("starting_after", startingAfter);

    const response = await fetch(url, { headers, cache: "no-store" });
    if (!response.ok) break;
    const payload = (await response.json()) as {
      data?: Array<Record<string, unknown>>;
      has_more?: boolean;
    };
    const data = Array.isArray(payload.data) ? payload.data : [];
    for (const subscription of data) {
      const customer = asRecord(subscription.customer);
      const subscriptionId = asString(subscription.id);
      if (!subscriptionId) continue;
      const items = asArray<Record<string, unknown>>(asRecord(subscription.items).data);
      const firstItem = asRecord(items[0]);
      const price = asRecord(firstItem.price);
      const priceId = asString(price.id);
      const unitAmount = asNumber(price.unit_amount);

      records.push({
        source: "STRIPE",
        objectType: "subscription",
        externalId: subscriptionId,
        tenantKey: asString(customer.id),
        occurredAt: asString(subscription.created ? new Date(Number(subscription.created) * 1000).toISOString() : null),
        sourceCreatedAt: asString(subscription.created ? new Date(Number(subscription.created) * 1000).toISOString() : null),
        sourceUpdatedAt: asString((subscription as Record<string, unknown>).current_period_end ? new Date(Number((subscription as Record<string, unknown>).current_period_end) * 1000).toISOString() : null),
        payload: {
          stripeCustomerId: asString(customer.id),
          customerName: asString(customer.name),
          email: asString(customer.email),
          domain: normalizeDomain(asString(customer.email)?.split("@")[1] ?? null),
          status: asString(subscription.status),
          plan: priceId,
          mrr: unitAmount !== null ? Number(unitAmount) / 100 : null,
          createdAt: subscription.created ? new Date(Number(subscription.created) * 1000).toISOString() : null,
          currentPeriodEnd:
            (subscription as Record<string, unknown>).current_period_end
              ? new Date(Number((subscription as Record<string, unknown>).current_period_end) * 1000).toISOString()
              : null,
          cancelAt:
            (subscription as Record<string, unknown>).cancel_at
              ? new Date(Number((subscription as Record<string, unknown>).cancel_at) * 1000).toISOString()
              : null,
        },
      });
    }
    if (!payload.has_more || data.length === 0) break;
    startingAfter = asString(data[data.length - 1]?.id);
    if (!startingAfter) break;
  }

  return records;
}

async function loadCodaSourceRecords(): Promise<SourceSeedRecord[]> {
  const token = process.env.CODA_API_TOKEN?.trim();
  const docId =
    process.env.CODA_RETENTION_DOC_ID?.trim() ??
    process.env.CODA_DOC_ID?.trim() ??
    "cgSn33D4N9";
  const tableId =
    process.env.CODA_MASTER_ORDER_ARCHIVE_TABLE_ID?.trim() ??
    "grid-GPpAfsGmqQ";
  if (!token || !docId || !tableId) return [];

  const sourceRows = await fetchCodaApiRows(docId, tableId, token, 10);
  const rows: SourceSeedRecord[] = [];
  for (const row of sourceRows) {
    const normalizedRow = normalizeCodaMasterOrderArchiveRow(row);
    if (!normalizedRow) continue;
    rows.push({
      source: "CODA",
      objectType: "master_order_archive",
      externalId: normalizedRow.externalId,
      tenantKey: normalizedRow.tenantKey,
      occurredAt: normalizedRow.occurredAt,
      sourceCreatedAt: normalizedRow.sourceCreatedAt,
      sourceUpdatedAt: normalizedRow.sourceUpdatedAt,
      payload: normalizedRow.payload,
    });
  }

  return rows;
}

async function loadPylonSourceRecords(): Promise<SourceSeedRecord[]> {
  const apiKey = process.env.PYLON_API_KEY?.trim();
  if (!apiKey) return [];
  const now = new Date();
  const from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const issues = await fetchPylonIssues({
    apiKey,
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
    baseUrl: process.env.PYLON_API_BASE_URL?.trim() || undefined,
    limit: 500,
    timeoutMs: 10_000,
  });

  return issues.map((issue) => {
    const record = issue as Record<string, unknown>;
    const company = asRecord(record.company);
    const companyName = asString(company.name) ?? asString(record.accountName);
    const emailDomain = normalizeDomain(asString(company.domain) ?? asString(record.emailDomain));
    return {
      source: "PYLON",
      objectType: "issue",
      externalId: asString(record.id) ?? crypto.randomUUID(),
      tenantKey: asString(company.id) ?? companyName,
      occurredAt: asString(record.createdAt) ?? asString(record.created_at),
      sourceCreatedAt: asString(record.createdAt) ?? asString(record.created_at),
      sourceUpdatedAt: asString(record.updatedAt) ?? asString(record.updated_at),
      payload: {
        pylonCompanyId: asString(company.id),
        companyName,
        domain: emailDomain,
        status: getPylonIssueStatus(issue),
        priority: getPylonIssuePriority(issue),
        tags: getPylonIssueTags(issue),
        category: asString(record.category),
        createdAt: asString(record.createdAt) ?? asString(record.created_at),
        updatedAt: asString(record.updatedAt) ?? asString(record.updated_at),
      },
    };
  });
}

async function loadArdaSourceRecords(): Promise<SourceSeedRecord[]> {
  const baseUrl = process.env.ARDA_API_BASE_URL?.trim();
  const token = process.env.ARDA_API_TOKEN?.trim();
  if (!baseUrl || !token) return [];

  const tenantConfigs = await loadArdaTenantConfigs();
  if (tenantConfigs.length === 0) return [];

  const asOfMs = Date.now();
  const rows: SourceSeedRecord[] = [];

  for (const config of tenantConfigs) {
    const hasResolvedTenantId = isUuid(config.tenantId) && config.tenantIdResolved;
    rows.push({
      source: "ARDA",
      objectType: "tenant",
      externalId: config.tenantId,
      tenantKey: config.tenantId,
      occurredAt: null,
      sourceCreatedAt: null,
      sourceUpdatedAt: null,
      payload: {
        ardaTenantId: config.tenantId,
        configuredTenantId: config.configuredTenantId,
        tenantName: config.tenantName,
        companyName: config.companyName,
        customerStatus: config.customerStatus,
        health: config.health,
        tenantIdResolved: hasResolvedTenantId,
        mainCodaDocId: config.mainCodaDocId,
        orderArchiveDocumentId: config.orderArchiveDocumentId,
        implementationStage:
          config.customerStatus && config.customerStatus.toLowerCase().includes("freemium")
            ? "TRIAL"
            : "LIVE",
      },
    });

    if (!hasResolvedTenantId) {
      continue;
    }

    const [orders, cards, items] = await Promise.all([
      queryArdaCollection("order/order", config.tenantId, asOfMs),
      queryArdaCollection("kanban/kanban-card", config.tenantId, asOfMs),
      queryArdaCollection("item/item", config.tenantId, asOfMs),
    ]);

    for (const record of orders) {
      const payload = ardaPayload(record);
      rows.push({
        source: "ARDA",
        objectType: "order",
        externalId: ardaRecordId(record) ?? crypto.randomUUID(),
        tenantKey: config.tenantId,
        occurredAt: ardaOccurredAt(record),
        sourceCreatedAt: ardaCreatedTimestamp(record) ?? ardaOccurredAt(record),
        sourceUpdatedAt: ardaObservedTimestamp(record) ?? ardaOccurredAt(record),
        payload: {
          ...payload,
          ardaTenantId: config.tenantId,
          configuredTenantId: config.configuredTenantId,
          tenantName: config.tenantName,
          companyName: config.companyName,
          orderId: ardaRecordId(record),
          locationId: asString(payload.locationId),
          workflowId: asString(payload.workflowId),
          quantity: asNumber(payload.quantity),
          createdAt: ardaCreatedTimestamp(record) ?? ardaOccurredAt(record),
        },
      });
    }

    for (const record of cards) {
      const payload = ardaPayload(record);
      rows.push({
        source: "ARDA",
        objectType: "card",
        externalId: ardaRecordId(record) ?? crypto.randomUUID(),
        tenantKey: config.tenantId,
        occurredAt: ardaOccurredAt(record),
        sourceCreatedAt: ardaCreatedTimestamp(record) ?? ardaOccurredAt(record),
        sourceUpdatedAt: ardaObservedTimestamp(record) ?? ardaOccurredAt(record),
        payload: {
          ...payload,
          ardaTenantId: config.tenantId,
          configuredTenantId: config.configuredTenantId,
          tenantName: config.tenantName,
          companyName: config.companyName,
          cardId: ardaRecordId(record),
          active: asBoolean(payload.active),
          locationId:
            asString(payload.locationId) ?? asString(asRecord(payload.locator).facility),
        },
      });
    }

    for (const record of items) {
      const payload = ardaPayload(record);
      rows.push({
        source: "ARDA",
        objectType: "item",
        externalId: ardaRecordId(record) ?? crypto.randomUUID(),
        tenantKey: config.tenantId,
        occurredAt: ardaOccurredAt(record),
        sourceCreatedAt: ardaCreatedTimestamp(record) ?? ardaOccurredAt(record),
        sourceUpdatedAt: ardaObservedTimestamp(record) ?? ardaOccurredAt(record),
        payload: {
          ...payload,
          ardaTenantId: config.tenantId,
          configuredTenantId: config.configuredTenantId,
          tenantName: config.tenantName,
          companyName: config.companyName,
          itemId: ardaRecordId(record),
          active: asBoolean(payload.active),
          locationId:
            asString(payload.locationId) ?? asString(asRecord(payload.locator).facility),
        },
      });
    }
  }

  return rows;
}

async function syncSource(
  actor: RetentionActor,
  source: SourceSeedRecord["source"],
  loader: () => Promise<SourceSeedRecord[]>
): Promise<void> {
  const runId = await createSyncRun(actor, source);
  try {
    const indexes = await buildIdentityIndexes(actor.organizationId);
    const rows = await loader();
    const persisted = await upsertSourceRecords(actor, runId, rows, indexes);
    await finalizeSyncRun({
      runId,
      status: rows.length > 0 && persisted.mappedCount === 0 ? "PARTIAL" : "SUCCESS",
      recordCount: rows.length,
      mappedCount: persisted.mappedCount,
      errorCount: 0,
      windowStart: persisted.windowStart,
      windowEnd: persisted.windowEnd,
    });
  } catch (error) {
    await finalizeSyncRun({
      runId,
      status: "ERROR",
      recordCount: 0,
      mappedCount: 0,
      errorCount: 1,
      lastError: error instanceof Error ? error.message : "Unknown retention sync error",
    });
    throw error;
  }
}

export async function syncRetentionSources(actor: RetentionActor): Promise<void> {
  return runWithContextAsync({ organizationId: actor.organizationId, userId: actor.id }, async () => {
    const sources: Array<[SourceSeedRecord["source"], () => Promise<SourceSeedRecord[]>]> = [
      ["HUBSPOT", () => loadHubSpotSourceRecords(actor)],
      ["STRIPE", loadStripeSourceRecords],
      ["PYLON", loadPylonSourceRecords],
      ["CODA", loadCodaSourceRecords],
      ["ARDA", loadArdaSourceRecords],
    ];
    const failures: string[] = [];

    for (const [source, loader] of sources) {
      try {
        await syncSource(actor, source, loader);
      } catch (error) {
        failures.push(`${source}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    try {
      await syncDerivedCustomerExternalRefs(actor);
    } catch (error) {
      failures.push(`DERIVED_EXTERNAL_REFS: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (failures.length > 0) {
      console.warn(`[retention] continuing after partial source sync failures: ${failures.join("; ")}`);
    }
  });
}

function initAccumulator(customerRecordId: string, monthStart: Date, monthEnd: Date, customerName: string): MonthlyTenantAccumulator {
  return {
    customerRecordId,
    monthStart,
    monthEnd,
    coverage: {
      arda: false,
      coda: false,
      stripe: false,
      hubspot: false,
      pylon: false,
      missingSources: [],
    },
    customerName,
    externalIds: new Set<string>(),
    goLiveDate: null,
    subscriptionStartDate: null,
    firstOrderDate: null,
    implementationStage: null,
    ownerName: null,
    segment: null,
    plan: null,
    icp: false,
    mrr: null,
    arr: null,
    daysActive: new Set<string>(),
    activeWeeks: new Set<string>(),
    orderCount: 0,
    cardTouches: 0,
    itemTouches: 0,
    activeCardCount: 0,
    activeItemCount: 0,
    locations: new Set<string>(),
    workflows: new Set<string>(),
    ticketsLast30: 0,
    unresolvedTickets: 0,
    urgentTickets: 0,
    bugTickets: 0,
    failedPayments: 0,
    delinquent: false,
    downgraded: false,
    contractionDetected: false,
    invoiceIrregularities: 0,
    crmChurnFlag: false,
    dataSignals: [],
  };
}

function addActivity(acc: MonthlyTenantAccumulator, occurredAt: Date | null): void {
  if (!occurredAt) return;
  acc.daysActive.add(dayKey(occurredAt));
  acc.activeWeeks.add(weekKey(occurredAt));
}

function mergeSourceRecord(acc: MonthlyTenantAccumulator, record: { source: string; objectType: string; occurredAt: Date | null; payload: Record<string, unknown> }): void {
  const payload = record.payload;
  addActivity(acc, record.occurredAt);

  if (record.source === "HUBSPOT") {
    acc.coverage.hubspot = true;
    acc.segment = asString(payload.segment) ?? acc.segment;
    acc.ownerName = asString(payload.ownerName) ?? acc.ownerName;
    acc.goLiveDate = asString(payload.expectedCloseDate) ?? acc.goLiveDate;
    acc.crmChurnFlag = acc.crmChurnFlag || asString(payload.lifecycleStage) === "CHURNED";
    acc.icp = acc.icp || Boolean(asBoolean(payload.icp) ?? false);
  }

  if (record.source === "STRIPE") {
    acc.coverage.stripe = true;
    acc.plan = asString(payload.plan) ?? acc.plan;
    acc.subscriptionStartDate = asString(payload.createdAt) ?? acc.subscriptionStartDate;
    acc.mrr = asNumber(payload.mrr) ?? acc.mrr;
    acc.arr = acc.mrr !== null ? acc.mrr * 12 : acc.arr;
    const status = asString(payload.status)?.toLowerCase() ?? "";
    acc.delinquent = acc.delinquent || status === "past_due" || status === "unpaid";
    acc.contractionDetected = acc.contractionDetected || status === "canceled";
  }

  if (record.source === "CODA") {
    acc.coverage.coda = true;
    acc.orderCount += 1;
    acc.plan = acc.plan ?? asString(payload.plan);
    const orderDate = parseDate(payload.orderDate);
    if (orderDate && (!acc.firstOrderDate || orderDate < new Date(acc.firstOrderDate))) {
      acc.firstOrderDate = orderDate.toISOString();
    }
    const locationId = asString(payload.locationId);
    if (locationId) acc.locations.add(locationId);
    const workflowId = asString(payload.workflowId);
    if (workflowId) acc.workflows.add(workflowId);
  }

  if (record.source === "PYLON") {
    acc.coverage.pylon = true;
    acc.ticketsLast30 += 1;
    const status = (asString(payload.status) ?? "").toLowerCase();
    const priority = (asString(payload.priority) ?? "").toLowerCase();
    const category = (asString(payload.category) ?? "").toLowerCase();
    const tags = asArray<string>(payload.tags).map((tag) => tag.toLowerCase());
    if (!status.includes("resolved") && !status.includes("closed")) acc.unresolvedTickets += 1;
    if (priority === "urgent" || priority === "high") acc.urgentTickets += 1;
    if (category.includes("bug") || tags.includes("bug")) acc.bugTickets += 1;
  }

  if (record.source === "ARDA") {
    acc.coverage.arda = true;
    if (record.objectType === "tenant") {
      acc.goLiveDate = asString(payload.goLiveDate) ?? acc.goLiveDate;
      acc.implementationStage = asString(payload.implementationStage) ?? acc.implementationStage;
      if (asNumber(payload.locationsCount)) {
        for (let i = 0; i < Number(payload.locationsCount); i += 1) acc.locations.add(`loc-${i + 1}`);
      }
      if (asNumber(payload.workflowCount)) {
        for (let i = 0; i < Number(payload.workflowCount); i += 1) acc.workflows.add(`wf-${i + 1}`);
      }
    }
    if (record.objectType === "order") {
      acc.orderCount += 1;
      const locationId = asString(payload.locationId);
      if (locationId) acc.locations.add(locationId);
      const workflowId = asString(payload.workflowId);
      if (workflowId) acc.workflows.add(workflowId);
      const orderDate = parseDate(payload.createdAt);
      if (orderDate && (!acc.firstOrderDate || orderDate < new Date(acc.firstOrderDate))) {
        acc.firstOrderDate = orderDate.toISOString();
      }
    }
    if (record.objectType === "card") {
      acc.cardTouches += 1;
      if (asBoolean(payload.active)) acc.activeCardCount += 1;
      const locationId = asString(payload.locationId);
      if (locationId) acc.locations.add(locationId);
    }
    if (record.objectType === "item") {
      acc.itemTouches += 1;
      if (asBoolean(payload.active)) acc.activeItemCount += 1;
      const locationId = asString(payload.locationId);
      if (locationId) acc.locations.add(locationId);
    }
  }
}

async function loadSourceRecordsForDataset(actor: RetentionActor): Promise<Array<{
  customerRecordId: string;
  customerName: string;
  source: string;
  objectType: string;
  occurredAt: Date | null;
  payload: Record<string, unknown>;
}>> {
  const records = await prisma.retentionSourceRecord.findMany({
    where: {
      organizationId: actor.organizationId,
      customerRecordId: { not: null },
    },
    include: {
      customerRecord: {
        select: { name: true },
      },
    },
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
  });

  return records.map((record) => ({
    customerRecordId: record.customerRecordId!,
    customerName: record.customerRecord?.name ?? "Unknown Tenant",
    source: record.source,
    objectType: record.objectType,
    occurredAt: record.occurredAt,
    payload: asRecord(record.payload),
  }));
}

function dedupeTrailingMonths(months: MonthlyTenantAccumulator[], count: number): MonthlyTenantAccumulator[] {
  return months.slice(Math.max(0, months.length - count));
}

function determineLifecyclePhase(acc: MonthlyTenantAccumulator): RetentionLifecyclePhase {
  if (!acc.goLiveDate) return "ONBOARDING";
  const goLive = new Date(acc.goLiveDate);
  const ageDays = Math.round((acc.monthEnd.getTime() - goLive.getTime()) / (24 * 60 * 60 * 1000));
  return ageDays <= 90 ? "ONBOARDING" : "MATURE";
}

function deriveLifecycleStartDate(
  current: MonthlyTenantAccumulator,
  history: MonthlyTenantAccumulator[]
): string | null {
  const candidates = [current, ...history]
    .flatMap((month) => [month.goLiveDate, month.subscriptionStartDate])
    .map((value) => parseDate(value))
    .filter((value): value is Date => value !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  if (candidates.length > 0) {
    return candidates[0].toISOString();
  }

  return null;
}

function deriveOnboardingStartDate(
  current: MonthlyTenantAccumulator,
  history: MonthlyTenantAccumulator[]
): string | null {
  const candidates = [current, ...history]
    .flatMap((month) => [month.goLiveDate, month.subscriptionStartDate])
    .map((value) => parseDate(value))
    .filter((value): value is Date => value !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  return candidates[0]?.toISOString() ?? null;
}

function computeActiveWeeksTrailing8(
  current: MonthlyTenantAccumulator,
  history: MonthlyTenantAccumulator[]
): number {
  const allowedWeeks = new Set<string>();
  let cursor = new Date(current.monthEnd);
  for (let index = 0; index < 8; index += 1) {
    allowedWeeks.add(weekKey(cursor));
    cursor = shiftUtcDays(cursor, -7);
  }

  const seenWeeks = new Set<string>();
  for (const month of [current, ...history]) {
    for (const activeWeek of month.activeWeeks) {
      if (allowedWeeks.has(activeWeek)) {
        seenWeeks.add(activeWeek);
      }
    }
  }

  return seenWeeks.size;
}

function buildFeaturePayload(
  acc: MonthlyTenantAccumulator,
  trailing: MonthlyTenantAccumulator[],
  lifecycleStartDate: string | null,
  onboardingStartDate: string | null
): RetentionFeaturePayload {
  const trailingOrders = trailing.map((month) => month.orderCount);
  const historicalBaseline =
    trailingOrders.length > 0
      ? trailingOrders.reduce((sum, value) => sum + value, 0) / trailingOrders.length
      : 0;
  const recentBaselineRatio = historicalBaseline > 0 ? acc.orderCount / historicalBaseline : null;
  const timeToFirstOrderDays =
    onboardingStartDate && acc.firstOrderDate
      ? Math.round((new Date(acc.firstOrderDate).getTime() - new Date(onboardingStartDate).getTime()) / (24 * 60 * 60 * 1000))
      : null;
  const activeWeeksTrailing8 = computeActiveWeeksTrailing8(acc, trailing);

  return {
    commercial: {
      subscriptionStartDate: acc.subscriptionStartDate,
      mrr: acc.mrr,
      arr: acc.arr,
      plan: acc.plan,
      ownerName: acc.ownerName,
      segment: acc.segment,
    },
    usage: {
      ordersPerMonth: acc.orderCount,
      cardTouchesLast30: acc.cardTouches,
      itemTouchesLast30: acc.itemTouches,
      currentMonthActivity: acc.orderCount + acc.cardTouches + acc.itemTouches,
      daysActiveLast30: acc.daysActive.size,
      firstOrderDate: acc.firstOrderDate,
    },
    adoption: {
      activeCardCount: acc.activeCardCount,
      activeItemCount: acc.activeItemCount,
      locationCount: acc.locations.size,
      workflowCount: acc.workflows.size,
      breadthScore: acc.locations.size + acc.workflows.size + (acc.activeCardCount > 0 ? 1 : 0) + (acc.activeItemCount > 0 ? 1 : 0),
    },
    support: {
      ticketsLast30: acc.ticketsLast30,
      unresolvedTickets: acc.unresolvedTickets,
      urgentTickets: acc.urgentTickets,
      bugTickets: acc.bugTickets,
    },
    billing: {
      failedPayments: acc.failedPayments,
      delinquent: acc.delinquent,
      downgraded: acc.downgraded,
      contractionDetected: acc.contractionDetected,
      invoiceIrregularities: acc.invoiceIrregularities,
    },
    overlays: {
      goLiveDate: lifecycleStartDate,
      implementationStage: acc.implementationStage,
      icp: acc.icp,
    },
    candidateMetrics: {
      activeWeeksTrailing8,
      recentBaselineRatio,
      ordersPerMonth: acc.orderCount,
      daysActiveLast30: acc.daysActive.size,
      timeToFirstOrderDays,
    },
  };
}

function buildCoverage(acc: MonthlyTenantAccumulator): RetentionCoveragePayload {
  const missingSources = [];
  if (!acc.coverage.arda) missingSources.push("arda");
  if (!acc.coverage.coda) missingSources.push("coda");
  if (!acc.coverage.stripe) missingSources.push("stripe");
  if (!acc.coverage.hubspot) missingSources.push("hubspot");
  if (!acc.coverage.pylon) missingSources.push("pylon");
  return {
    ...acc.coverage,
    missingSources,
  };
}

function buildOutcomePayload(
  current: MonthlyTenantAccumulator,
  futureMonths: MonthlyTenantAccumulator[],
  featurePayload: RetentionFeaturePayload
): RetentionOutcomePayload {
  const future90 = futureMonths.slice(0, 3);
  const future180 = futureMonths.slice(0, 6);
  const anyFutureOrders90 = future90.some((month) => month.orderCount > 0);
  const anyFutureOrders180 = future180.some((month) => month.orderCount > 0);
  const billing = asRecord(featurePayload.billing);
  const support = asRecord(featurePayload.support);
  const candidateMetrics = asRecord(featurePayload.candidateMetrics);

  return {
    churnWithin90d: current.crmChurnFlag || Boolean(asBoolean(billing.delinquent)) && !anyFutureOrders90,
    churnWithin180d: current.crmChurnFlag || Boolean(asBoolean(billing.delinquent)) && !anyFutureOrders180,
    activeAfter180d: future180.length > 0 ? anyFutureOrders180 : null,
    contractionWithin90d:
      current.contractionDetected ||
      future90.some((month) => month.contractionDetected || (current.mrr !== null && month.mrr !== null && month.mrr < current.mrr)),
    supportDistress:
      (asNumber(support.urgentTickets) ?? 0) >= 3 ||
      (asNumber(support.unresolvedTickets) ?? 0) >= 5,
    usageCollapse:
      (asNumber(candidateMetrics.recentBaselineRatio) ?? 1) <= 0.5 ||
      (asNumber(featurePayload.usage.currentMonthActivity) ?? 0) <= 2,
  };
}

function selectLirDefinition(
  lifecyclePhase: RetentionLifecyclePhase,
  candidateMetrics: Record<string, unknown>
): LirDefinition {
  const candidates = RETENTION_CANDIDATE_LIRS.filter((candidate) => candidate.lifecyclePhase === lifecyclePhase);
  for (const candidate of candidates) {
    if (candidate.metricKey in candidateMetrics) return candidate;
  }
  return DEFAULT_RETENTION_LIR_BY_PHASE[lifecyclePhase];
}

function buildReasonCodes(
  acc: MonthlyTenantAccumulator,
  featurePayload: RetentionFeaturePayload,
  outcomePayload: RetentionOutcomePayload,
  primaryDefinition: LirDefinition,
  primaryValue: number | null
): RetentionReasonCode[] {
  const reasons: RetentionReasonCode[] = [];
  if (!evaluateLir(primaryDefinition, primaryValue)) {
    reasons.push(
      buildReasonCode({
        code: "primary_lir_failed",
        label: `${primaryDefinition.label} below threshold`,
        detail: `${primaryDefinition.label} is ${primaryValue ?? "missing"} against threshold ${primaryDefinition.threshold}.`,
        severity: "critical",
        dimension: "usage",
      })
    );
  }
  if (outcomePayload.usageCollapse) {
    reasons.push(
      buildReasonCode({
        code: "usage_collapse",
        label: "Current-month usage collapse",
        detail: "Recent activity is materially below the historical baseline.",
        severity: "critical",
        dimension: "usage",
      })
    );
  }
  if ((asNumber(asRecord(featurePayload.support).urgentTickets) ?? 0) > 0) {
    reasons.push(
      buildReasonCode({
        code: "support_spike",
        label: "Urgent support load",
        detail: "Urgent or high-priority support issues are elevated this month.",
        severity: "warning",
        dimension: "support",
      })
    );
  }
  if (acc.delinquent || acc.failedPayments > 0) {
    reasons.push(
      buildReasonCode({
        code: "billing_distress",
        label: "Billing distress",
        detail: "Delinquency, failed payments, or other billing instability is present.",
        severity: "critical",
        dimension: "billing",
      })
    );
  }
  if (acc.implementationStage && acc.implementationStage.toLowerCase().includes("blocked")) {
    reasons.push(
      buildReasonCode({
        code: "implementation_blocked",
        label: "Implementation blocked",
        detail: "Implementation stage indicates the tenant is not fully live.",
        severity: "warning",
        dimension: "onboarding",
      })
    );
  }
  if (buildCoverage(acc).missingSources.length > 0) {
    reasons.push(
      buildReasonCode({
        code: "partial_coverage",
        label: "Partial source coverage",
        detail: `Missing sources: ${buildCoverage(acc).missingSources.join(", ")}.`,
        severity: "info",
        dimension: "data",
      })
    );
  }
  return reasons;
}

function buildCurrentDetailPayload(
  featurePayload: RetentionFeaturePayload,
  coverage: RetentionCoveragePayload,
  rowStatus: string,
  reasons: RetentionReasonCode[]
): RetentionCurrentDetailPayload {
  const overlays = asRecord(featurePayload.overlays);
  const commercial = asRecord(featurePayload.commercial);
  const usage = asRecord(featurePayload.usage);
  const explanationBase = rowStatus.replace(/_/g, " ").toLowerCase();
  const reasonSummary = reasons.map((reason) => reason.label).join(", ");

  return {
    goLiveDate: asString(overlays.goLiveDate),
    subscriptionStartDate: asString(commercial.subscriptionStartDate),
    firstOrderDate: asString(usage.firstOrderDate),
    implementationStage: asString(overlays.implementationStage),
    commercial,
    supportSummary: asRecord(featurePayload.support),
    billingSummary: asRecord(featurePayload.billing),
    usageSummary: usage,
    adoptionSummary: asRecord(featurePayload.adoption),
    coverage,
    explanation: reasonSummary
      ? `${explanationBase} because ${reasonSummary}.`
      : `${explanationBase} based on the latest retention snapshot.`,
  };
}

export async function buildRetentionDataset(actor: RetentionActor): Promise<void> {
  return runWithContextAsync({ organizationId: actor.organizationId, userId: actor.id }, async () => {
    const rows = await loadSourceRecordsForDataset(actor);
    const accumulators = new Map<string, MonthlyTenantAccumulator>();

    for (const row of rows) {
      const occurredAt = row.occurredAt;
      if (!occurredAt) continue;
      const { monthStart, monthEnd } = monthBounds(occurredAt);
      const key = `${row.customerRecordId}:${monthKey(monthStart)}`;
      const current = accumulators.get(key) ?? initAccumulator(row.customerRecordId, monthStart, monthEnd, row.customerName);
      mergeSourceRecord(current, {
        source: row.source,
        objectType: row.objectType,
        occurredAt,
        payload: row.payload,
      });
      accumulators.set(key, current);
    }

    const groupedByCustomer = new Map<string, MonthlyTenantAccumulator[]>();
    for (const acc of accumulators.values()) {
      const list = groupedByCustomer.get(acc.customerRecordId) ?? [];
      list.push(acc);
      groupedByCustomer.set(acc.customerRecordId, list);
    }

    await prisma.retentionTenantMonth.deleteMany({
      where: { organizationId: actor.organizationId },
    });

    for (const [customerRecordId, months] of groupedByCustomer.entries()) {
      months.sort((a, b) => a.monthStart.getTime() - b.monthStart.getTime());
      for (let index = 0; index < months.length; index += 1) {
        const current = months[index];
        const trailing = dedupeTrailingMonths(months.slice(0, index), 3);
        const history = months.slice(0, index);
        const lifecycleStartDate = deriveLifecycleStartDate(current, history);
        const onboardingStartDate = deriveOnboardingStartDate(current, history);
        const future = months.slice(index + 1);
        const featurePayload = buildFeaturePayload(current, trailing, lifecycleStartDate, onboardingStartDate);
        const outcomePayload = buildOutcomePayload(current, future, featurePayload);
        const coveragePayload = buildCoverage(current);
        const lifecyclePhase = determineLifecyclePhase({
          ...current,
          goLiveDate: lifecycleStartDate,
        });
        const candidateMetrics = asRecord(featurePayload.candidateMetrics);
        const primaryDefinition = selectLirDefinition(lifecyclePhase, candidateMetrics);
        const primaryValue = asNumber(candidateMetrics[primaryDefinition.metricKey]);
        const reasons = buildReasonCodes(current, featurePayload, outcomePayload, primaryDefinition, primaryValue);
        const status = classifyRetentionStatus({
          lifecyclePhase,
          primaryLirDefinition: primaryDefinition,
          primaryLirValue: primaryValue,
          supportRisk: outcomePayload.supportDistress,
          billingRisk: current.delinquent || current.failedPayments > 0,
          onboardingRisk:
            lifecyclePhase === "ONBOARDING" &&
            (!current.firstOrderDate || (asNumber(candidateMetrics.timeToFirstOrderDays) ?? 999) > 21),
          usageCollapse: outcomePayload.usageCollapse,
          reasonCodes: reasons,
        });

        await prisma.retentionTenantMonth.create({
          data: {
            organizationId: actor.organizationId,
            customerRecordId,
            monthStart: current.monthStart,
            monthEnd: current.monthEnd,
            lifecyclePhase,
            status: retentionStatusToDb(status) as PrismaRetentionTenantStatus,
            featureVersion: RETENTION_FEATURE_VERSION,
            primaryLirPassed: evaluateLir(primaryDefinition, primaryValue),
            primaryLirLabel: primaryDefinition.label,
            primaryLirValue: primaryValue,
            primaryLirThreshold: primaryDefinition.threshold,
            primaryLirScore:
              primaryValue !== null && primaryDefinition.threshold > 0
                ? Number((primaryValue / primaryDefinition.threshold).toFixed(3))
                : null,
            reasonCodes: reasons as unknown as Prisma.InputJsonValue,
            featureData: featurePayload as unknown as Prisma.InputJsonValue,
            outcomeData: {
              ...outcomePayload,
              primaryLirPassed: evaluateLir(primaryDefinition, primaryValue),
            } as unknown as Prisma.InputJsonValue,
            coverageData: coveragePayload as unknown as Prisma.InputJsonValue,
          },
        });
      }
    }
  });
}

function candidateScore(candidate: RetentionAnalysisCandidateResult): number {
  return candidate.lift * 0.45 + candidate.coverage * 0.25 + (100 - candidate.segmentSpread) * 0.15 + candidate.interpretabilityScore * 0.15;
}

export async function runRetentionAnalysis(actor: RetentionActor): Promise<RetentionAnalysisCandidateResult[]> {
  const months = await prisma.retentionTenantMonth.findMany({
    where: { organizationId: actor.organizationId },
    orderBy: [{ monthStart: "asc" }],
  });

  const results: RetentionAnalysisCandidateResult[] = [];
  for (const definition of RETENTION_CANDIDATE_LIRS) {
    const scoped = months.filter((month) => month.lifecyclePhase === definition.lifecyclePhase);
    if (scoped.length === 0) continue;
    let covered = 0;
    let positiveOutcome = 0;
    let positiveWhenPass = 0;
    let passCount = 0;
    const segmentRates = new Map<string, { total: number; pass: number }>();

    for (const month of scoped) {
      const features = asRecord(month.featureData);
      const candidateMetrics = asRecord(features.candidateMetrics);
      const outcomes = asRecord(month.outcomeData);
      const value = asNumber(candidateMetrics[definition.metricKey]);
      if (value === null) continue;
      covered += 1;
      const passed = evaluateLir(definition, value);
      if (passed) passCount += 1;
      const positive = Boolean(asBoolean(outcomes.activeAfter180d)) || !Boolean(asBoolean(outcomes.churnWithin180d));
      if (positive) positiveOutcome += 1;
      if (positive && passed) positiveWhenPass += 1;
      const segment = asString(asRecord(features.commercial).segment) ?? "Unknown";
      const bucket = segmentRates.get(segment) ?? { total: 0, pass: 0 };
      bucket.total += 1;
      if (passed) bucket.pass += 1;
      segmentRates.set(segment, bucket);
    }

    const coverage = scoped.length > 0 ? (covered / scoped.length) * 100 : 0;
    const overallPositiveRate = covered > 0 ? positiveOutcome / covered : 0;
    const passPositiveRate = passCount > 0 ? positiveWhenPass / passCount : 0;
    const lift = overallPositiveRate > 0 ? (passPositiveRate / overallPositiveRate) * 100 : 0;
    const rates = [...segmentRates.values()]
      .filter((bucket) => bucket.total > 0)
      .map((bucket) => (bucket.pass / bucket.total) * 100);
    const segmentSpread = rates.length > 0 ? Math.max(...rates) - Math.min(...rates) : 0;
    const interpretabilityScore = definition.id.includes("baseline") ? 75 : 90;
    const candidate: RetentionAnalysisCandidateResult = {
      definition,
      coverage: Number(coverage.toFixed(1)),
      lift: Number(lift.toFixed(1)),
      segmentSpread: Number(segmentSpread.toFixed(1)),
      interpretabilityScore,
      score: 0,
      label: `${definition.label} (${definition.lifecyclePhase.toLowerCase()})`,
    };
    candidate.score = Number(candidateScore(candidate).toFixed(1));
    results.push(candidate);
  }

  return results.sort((a, b) => b.score - a.score);
}

export async function materializeRetentionCurrent(actor: RetentionActor): Promise<void> {
  return runWithContextAsync({ organizationId: actor.organizationId, userId: actor.id }, async () => {
    const months = await prisma.retentionTenantMonth.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: [{ customerRecordId: "asc" }, { monthStart: "desc" }],
    });

    const latestByCustomer = new Map<string, typeof months[number]>();
    for (const month of months) {
      if (!latestByCustomer.has(month.customerRecordId)) {
        latestByCustomer.set(month.customerRecordId, month);
      }
    }

    await prisma.retentionTenantCurrent.deleteMany({
      where: { organizationId: actor.organizationId },
    });

    for (const month of latestByCustomer.values()) {
      const customer = await prisma.customerRecord.findUnique({
        where: { id: month.customerRecordId },
        select: { name: true },
      });
      const features = asRecord(month.featureData);
      const usage = asRecord(features.usage);
      const commercial = asRecord(features.commercial);
      const support = asRecord(features.support);
      const billing = asRecord(features.billing);
      const coverage = asRecord(month.coverageData) as unknown as RetentionCoveragePayload;
      const reasons = asReasonCodes(month.reasonCodes);
      const detailPayload = buildCurrentDetailPayload(
        features as unknown as RetentionFeaturePayload,
        coverage,
        month.status ?? "WATCH",
        reasons
      );

      const candidateMetrics = asRecord(features.candidateMetrics);
      const lifecyclePhase = month.lifecyclePhase as RetentionLifecyclePhase;
      const primaryDefinition = selectLirDefinition(lifecyclePhase, candidateMetrics);
      const ageDays =
        detailPayload.goLiveDate
          ? Math.round((month.monthEnd.getTime() - new Date(detailPayload.goLiveDate).getTime()) / (24 * 60 * 60 * 1000))
          : null;

      await prisma.retentionTenantCurrent.create({
        data: {
          organizationId: actor.organizationId,
          customerRecordId: month.customerRecordId,
          monthFactId: month.id,
          lifecyclePhase,
          status: (month.status ?? PrismaRetentionTenantStatus.WATCH) as PrismaRetentionTenantStatus,
          primaryLirPassed: month.primaryLirPassed,
          primaryLirLabel: month.primaryLirLabel ?? primaryDefinition.label,
          primaryLirValue: month.primaryLirValue,
          primaryLirThreshold: month.primaryLirThreshold,
          currentMonthActivity: asNumber(usage.currentMonthActivity),
          activityTrendPct: asNumber(candidateMetrics.recentBaselineRatio) !== null ? Number((((asNumber(candidateMetrics.recentBaselineRatio) ?? 1) - 1) * 100).toFixed(1)) : null,
          supportRisk: (asNumber(support.urgentTickets) ?? 0) > 0 || (asNumber(support.unresolvedTickets) ?? 0) >= 5,
          billingRisk: Boolean(asBoolean(billing.delinquent)) || (asNumber(billing.failedPayments) ?? 0) > 0,
          onboardingRisk: lifecyclePhase === "ONBOARDING" && !month.primaryLirPassed,
          icp: Boolean(asBoolean(asRecord(features.overlays).icp)),
          ownerName: asString(commercial.ownerName),
          segment: asString(commercial.segment),
          plan: asString(commercial.plan),
          ageBucket: ageDays === null ? null : ageDays <= 30 ? "0-30d" : ageDays <= 90 ? "31-90d" : ageDays <= 180 ? "91-180d" : "180d+",
          summaryData: {
            customerName: customer?.name ?? "Unknown Tenant",
          } as Prisma.InputJsonValue,
          detailData: detailPayload as unknown as Prisma.InputJsonValue,
          reasonCodes: reasons as unknown as Prisma.InputJsonValue,
          lastMaterializedAt: new Date(),
        },
      });
    }
  });
}

export const __test__ = {
  ardaCreatedTimestamp,
  ardaObservedTimestamp,
  ardaOccurredAt,
  buildDerivedCodaExternalRefsFromSourceRecords,
  fallbackArdaTenantExternalId,
  materializeArdaTenantConfigs,
  deriveLifecycleStartDate,
  deriveOnboardingStartDate,
  computeActiveWeeksTrailing8,
  fetchCodaApiRows,
};
