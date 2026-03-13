import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

interface CodaRow {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  values?: Record<string, unknown>;
}

interface Observation {
  customer: string;
  monthStart: string;
  currentOrders: number;
  activeWeeksTrailing8: number;
  uniqueItemsTrailing30: number;
  activeMonthsPrev3: number;
  trendRatio: number | null;
  future8WeekOrders: number;
  future8WeekActive: boolean;
}

interface ArdaObservation extends Observation {
  tenantIds: string[];
  ardaCardTouchesTrailing30: number;
  ardaItemTouchesTrailing30: number;
  ardaOrderTouchesTrailing30: number;
  ardaCombinedTouchesTrailing30: number;
  ardaFacilities: number;
  ardaAnyTouchTrailing30: boolean;
}

interface BucketSummary {
  n: number;
  retentionRate: number | null;
}

interface ArdaRecord {
  rId?: string;
  asOf?: {
    effective?: number;
    recorded?: number;
  };
  createdAt?: {
    effective?: number;
    recorded?: number;
  };
  payload?: Record<string, unknown>;
}

interface ArdaPage {
  results?: ArdaRecord[];
  nextPage?: string | null;
}

interface EnrichedAnalysisResult {
  generatedAt: string;
  source: {
    stage2ArticleUrl: string;
    codaDocId: string;
    summaryTableId: string;
    rawTableId: string;
    ardaBaseUrl: string | null;
  };
  population: {
    baselineObservationCount: number;
    baselineCustomerCount: number;
    matchedObservationCount: number;
    matchedCustomerCount: number;
    matchedBaselineNext8WeekRate: number | null;
  };
  matchedCustomers: Array<{
    customer: string;
    tenantIds: string[];
  }>;
  indicatorChecks: Record<string, BucketSummary>;
  bucketSummaries: {
    combinedTouchesTrailing30: Record<string, BucketSummary>;
    cardTouchesTrailing30: Record<string, BucketSummary>;
    itemTouchesTrailing30: Record<string, BucketSummary>;
    facilities: Record<string, BucketSummary>;
  };
  combinedChecks: Record<string, BucketSummary>;
  customerSnapshots: Array<{
    customer: string;
    tenantIds: string[];
    observations: number;
    retainedObservationRate: number | null;
    maxCardTouchesTrailing30: number;
    maxItemTouchesTrailing30: number;
    maxFacilities: number;
  }>;
  matchedObservations: ArdaObservation[];
  notes: string[];
}

const STAGE2_ARTICLE_URL =
  "https://www.stage2.capital/blog/from-customer-level-to-cohorts-the-lir-journey";
const CODA_DOC_ID = "cgSn33D4N9";
const SUMMARY_TABLE_ID = "grid-2WSbYvHlQY";
const RAW_TABLE_ID = "grid-GPpAfsGmqQ";

const CUSTOMER_ALIASES: Record<string, string> = {
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
};

const EXCLUDED_CUSTOMERS = new Set([
  "",
  "Arda",
  "Arda Template",
  "Arda Merchandising",
  "Group 1",
  "Kyle Towns Services",
]);

const ARDA_CUSTOMER_TENANTS: Record<string, string[]> = {
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

function round(value: number | null, digits = 4): number | null {
  if (value === null || Number.isNaN(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeCustomerName(name: unknown): string {
  const raw = typeof name === "string" ? name.trim() : "";
  const lowered = raw.toLowerCase().replace(/\s+/g, " ");
  return CUSTOMER_ALIASES[lowered] ?? raw;
}

function parseMonthLabel(label: unknown): Date | null {
  if (typeof label !== "string" || label.trim().length === 0) return null;
  const parsed = new Date(`${label} 1, 00:00:00 UTC`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateValue(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isoWeekKey(date: Date): string {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((copy.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${copy.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function retentionRate<T extends Observation>(rows: T[]): number | null {
  if (rows.length === 0) return null;
  return rows.filter((row) => row.future8WeekActive).length / rows.length;
}

function summarizeRows<T extends Observation>(rows: T[]): BucketSummary {
  return {
    n: rows.length,
    retentionRate: round(retentionRate(rows)),
  };
}

function bucketize<T extends Observation>(
  rows: T[],
  getBucket: (row: T) => string
): Record<string, BucketSummary> {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = getBucket(row);
    const existing = buckets.get(bucket) ?? ([] as T[]);
    existing.push(row);
    buckets.set(bucket, existing);
  }

  return Object.fromEntries(
    [...buckets.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([bucket, bucketRows]) => [bucket, summarizeRows(bucketRows)])
  );
}

async function loadLocalEnv(): Promise<void> {
  const candidateFiles = [".env.local", ".env"];
  for (const candidate of candidateFiles) {
    const filePath = path.join(process.cwd(), candidate);
    try {
      const text = await readFile(filePath, "utf8");
      for (const line of text.split(/\r?\n/)) {
        if (!line || line.trim().startsWith("#")) continue;
        const separator = line.indexOf("=");
        if (separator === -1) continue;
        const key = line.slice(0, separator).trim();
        let value = line.slice(separator + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!(key in process.env)) {
          process.env[key] = value;
        }
      }
    } catch {
      // Ignore missing env files.
    }
  }
}

async function fetchCodaRows(tableId: string): Promise<CodaRow[]> {
  const token = process.env.CODA_API_TOKEN?.trim();
  if (!token) {
    throw new Error("CODA_API_TOKEN is required to analyze retention indicators.");
  }

  const rows: CodaRow[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(
      `https://coda.io/apis/v1/docs/${encodeURIComponent(CODA_DOC_ID)}/tables/${encodeURIComponent(tableId)}/rows`
    );
    url.searchParams.set("limit", "500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Coda request failed for ${tableId}: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as {
      items?: CodaRow[];
      nextPageToken?: string;
    };

    rows.push(...(payload.items ?? []));
    pageToken = payload.nextPageToken;
  } while (pageToken);

  return rows;
}

async function buildCodaObservations(): Promise<Observation[]> {
  const [summaryRows, rawRows] = await Promise.all([
    fetchCodaRows(SUMMARY_TABLE_ID),
    fetchCodaRows(RAW_TABLE_ID),
  ]);

  const monthlyOrders = new Map<string, number>();
  const customers = new Set<string>();

  for (const row of summaryRows) {
    const values = row.values ?? {};
    const customer = normalizeCustomerName(values["c-BkqL35AccO"]);
    if (EXCLUDED_CUSTOMERS.has(customer)) continue;

    const monthStart = parseMonthLabel(values["c-AtPCsKr9sf"]);
    const orders =
      typeof values["c-5WBoSFjy9O"] === "number"
        ? values["c-5WBoSFjy9O"]
        : Number(values["c-5WBoSFjy9O"] ?? 0);
    if (!monthStart || !Number.isFinite(orders) || orders <= 0) continue;

    monthlyOrders.set(`${customer}::${monthKey(monthStart)}`, orders);
    customers.add(customer);
  }

  const rawActivity = new Map<string, Array<{ orderedAt: Date; itemName: string }>>();

  for (const row of rawRows) {
    const values = row.values ?? {};
    const customer = normalizeCustomerName(values["c-8yeOnXGW7r"]);
    if (EXCLUDED_CUSTOMERS.has(customer)) continue;

    const orderedAt = parseDateValue(values["c-3rgpjUaRuA"]);
    if (!orderedAt || orderedAt.getUTCFullYear() !== 2025) continue;

    const events = rawActivity.get(customer) ?? [];
    events.push({
      orderedAt,
      itemName: typeof values["c-UaZ6rmlK-R"] === "string" ? values["c-UaZ6rmlK-R"] : "",
    });
    rawActivity.set(customer, events);
  }

  for (const events of rawActivity.values()) {
    events.sort((left, right) => left.orderedAt.getTime() - right.orderedAt.getTime());
  }

  const observations: Observation[] = [];

  for (const customer of customers) {
    const customerEvents = rawActivity.get(customer) ?? [];

    for (let month = 0; month < 10; month += 1) {
      const monthStart = new Date(Date.UTC(2025, month, 1));
      const currentOrders = monthlyOrders.get(`${customer}::${monthKey(monthStart)}`) ?? 0;
      if (currentOrders <= 0) continue;

      const nextMonthStart = new Date(Date.UTC(2025, month + 1, 1));
      const monthEnd = new Date(nextMonthStart.getTime() - 24 * 60 * 60 * 1000);
      const trailing8Start = new Date(monthEnd.getTime() - 55 * 24 * 60 * 60 * 1000);
      const trailing30Start = new Date(monthEnd.getTime() - 29 * 24 * 60 * 60 * 1000);
      const future8End = new Date(monthEnd.getTime() + 56 * 24 * 60 * 60 * 1000);

      const activeWeeks = new Set<string>();
      const uniqueItems = new Set<string>();
      let future8WeekOrders = 0;

      for (const event of customerEvents) {
        if (event.orderedAt >= trailing8Start && event.orderedAt <= monthEnd) {
          activeWeeks.add(isoWeekKey(event.orderedAt));
        }
        if (event.orderedAt >= trailing30Start && event.orderedAt <= monthEnd && event.itemName.trim()) {
          uniqueItems.add(event.itemName.trim());
        }
        if (event.orderedAt > monthEnd && event.orderedAt <= future8End) {
          future8WeekOrders += 1;
        }
      }

      const previousMonths: number[] = [];
      for (let offset = 1; offset <= 3; offset += 1) {
        const previousMonth = new Date(Date.UTC(2025, month - offset, 1));
        previousMonths.push(monthlyOrders.get(`${customer}::${monthKey(previousMonth)}`) ?? 0);
      }

      const activeMonthsPrev3 = previousMonths.filter((value) => value > 0).length;
      const previousAverage = previousMonths.reduce((sum, value) => sum + value, 0) / previousMonths.length;
      const trendRatio = previousAverage > 0 ? currentOrders / previousAverage : null;

      observations.push({
        customer,
        monthStart: monthKey(monthStart),
        currentOrders,
        activeWeeksTrailing8: activeWeeks.size,
        uniqueItemsTrailing30: uniqueItems.size,
        activeMonthsPrev3,
        trendRatio,
        future8WeekOrders,
        future8WeekActive: future8WeekOrders > 0,
      });
    }
  }

  return observations;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

function asTimestamp(value: unknown): number | null {
  const record = asRecord(value);
  return asNumber(record.recorded) ?? asNumber(record.effective);
}

function facilityName(record: ArdaRecord): string | null {
  const payload = asRecord(record.payload);
  const locator = asRecord(payload.locator);
  return asString(locator.facility);
}

function touchTimestamp(record: ArdaRecord): number | null {
  return asTimestamp(record.asOf) ?? asTimestamp(record.createdAt);
}

function recordKey(record: ArdaRecord): string {
  const payload = asRecord(record.payload);
  return asString(record.rId) ?? asString(payload.eId) ?? JSON.stringify(payload);
}

async function fetchArdaPage<T extends ArdaPage>(
  requestPath: string,
  init: RequestInit,
  headers: Record<string, string>
): Promise<T> {
  const response = await fetch(requestPath, {
    ...init,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    throw new Error(`Arda request failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

async function queryArdaCollection(
  endpoint: string,
  tenantId: string,
  asOfMs: number,
  stopBeforeMs?: number
): Promise<ArdaRecord[]> {
  const baseUrl = process.env.ARDA_API_BASE_URL?.trim();
  const token = process.env.ARDA_API_TOKEN?.trim();
  if (!baseUrl || !token) {
    throw new Error("ARDA_API_BASE_URL and ARDA_API_TOKEN are required for Arda-enriched analysis.");
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Author": "WIPGuard-retention-analysis",
    "X-Tenant-Id": tenantId,
  };

  const allResults: ArdaRecord[] = [];
  const seen = new Set<string>();
  const queryString = `effectiveasof=${asOfMs}&recordedasof=${asOfMs}`;
  const first = await fetchArdaPage<ArdaPage>(
    `${baseUrl}/v1/${endpoint}/query?${queryString}`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
    headers
  );
  for (const record of first.results ?? []) {
    const key = recordKey(record);
    if (seen.has(key)) continue;
    seen.add(key);
    allResults.push(record);
  }

  let nextPage = first.nextPage ?? null;
  let pageCount = 0;
  let consecutiveEmptyPages = (first.results ?? []).length === 0 ? 1 : 0;
  while (nextPage && pageCount < 100) {
    pageCount += 1;
    const page = await fetchArdaPage<ArdaPage>(
      `${baseUrl}/v1/${endpoint}/query/${encodeURIComponent(nextPage)}?${queryString}`,
      {
        method: "GET",
      },
      headers
    );
    const pageResults = page.results ?? [];
    let added = 0;
    let oldestTimestampOnPage: number | null = null;
    for (const record of pageResults) {
      const timestamp = touchTimestamp(record);
      if (timestamp !== null) {
        oldestTimestampOnPage =
          oldestTimestampOnPage === null ? timestamp : Math.min(oldestTimestampOnPage, timestamp);
      }
      const key = recordKey(record);
      if (seen.has(key)) continue;
      seen.add(key);
      allResults.push(record);
      added += 1;
    }
    consecutiveEmptyPages = pageResults.length === 0 ? consecutiveEmptyPages + 1 : 0;
    if (consecutiveEmptyPages >= 3) break;
    if (stopBeforeMs !== undefined && oldestTimestampOnPage !== null && oldestTimestampOnPage < stopBeforeMs) {
      break;
    }
    if (pageResults.length > 0 && added === 0) {
      break;
    }
    nextPage = page.nextPage ?? null;
  }

  return allResults;
}

async function collectArdaMetrics(
  tenantIds: string[],
  monthEndMs: number,
  trailing30StartMs: number
): Promise<Pick<
  ArdaObservation,
  | "ardaCardTouchesTrailing30"
  | "ardaItemTouchesTrailing30"
  | "ardaOrderTouchesTrailing30"
  | "ardaCombinedTouchesTrailing30"
  | "ardaFacilities"
  | "ardaAnyTouchTrailing30"
>> {
  let ardaCardTouchesTrailing30 = 0;
  let ardaItemTouchesTrailing30 = 0;
  let ardaOrderTouchesTrailing30 = 0;
  const facilities = new Set<string>();

  for (const tenantId of tenantIds) {
    const [cards, items, orders] = await Promise.all([
      queryArdaCollection("kanban/kanban-card", tenantId, monthEndMs, trailing30StartMs),
      queryArdaCollection("item/item", tenantId, monthEndMs, trailing30StartMs),
      queryArdaCollection("order/order", tenantId, monthEndMs, trailing30StartMs),
    ]);

    for (const card of cards) {
      const touchedAt = touchTimestamp(card);
      if (touchedAt !== null && touchedAt >= trailing30StartMs) {
        ardaCardTouchesTrailing30 += 1;
      }
    }

    for (const item of items) {
      const touchedAt = touchTimestamp(item);
      if (touchedAt !== null && touchedAt >= trailing30StartMs) {
        ardaItemTouchesTrailing30 += 1;
      }
      const facility = facilityName(item);
      if (facility) facilities.add(facility);
    }

    for (const order of orders) {
      const touchedAt = touchTimestamp(order);
      if (touchedAt !== null && touchedAt >= trailing30StartMs) {
        ardaOrderTouchesTrailing30 += 1;
      }
    }
  }

  const ardaCombinedTouchesTrailing30 =
    ardaCardTouchesTrailing30 + ardaItemTouchesTrailing30 + ardaOrderTouchesTrailing30;

  return {
    ardaCardTouchesTrailing30,
    ardaItemTouchesTrailing30,
    ardaOrderTouchesTrailing30,
    ardaCombinedTouchesTrailing30,
    ardaFacilities: facilities.size,
    ardaAnyTouchTrailing30: ardaCombinedTouchesTrailing30 > 0,
  };
}

async function loadCachedObservations(): Promise<Observation[] | null> {
  const filePath = path.join(process.cwd(), "docs", "retention", "arda-coda-lir-analysis.json");
  try {
    const text = await readFile(filePath, "utf8");
    const payload = JSON.parse(text) as { observations?: Observation[] };
    return Array.isArray(payload.observations) ? payload.observations : null;
  } catch {
    return null;
  }
}

async function buildEnrichedAnalysis(): Promise<EnrichedAnalysisResult> {
  const observations = (await loadCachedObservations()) ?? (await buildCodaObservations());
  const monthFilter = new Set(
    (process.env.ARDA_LIR_MONTH_FILTER ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  const matchedBase = observations.filter((observation) => {
    if (!(observation.customer in ARDA_CUSTOMER_TENANTS)) return false;
    if (monthFilter.size > 0 && !monthFilter.has(observation.monthStart)) return false;
    return true;
  });
  const enriched: ArdaObservation[] = [];

  for (const observation of matchedBase) {
    const tenantIds = ARDA_CUSTOMER_TENANTS[observation.customer];
    const monthStart = new Date(`${observation.monthStart}T00:00:00.000Z`);
    const nextMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
    const monthEnd = new Date(nextMonthStart.getTime() - 1);
    const trailing30Start = new Date(monthEnd.getTime() - 29 * 24 * 60 * 60 * 1000);
    const ardaMetrics = await collectArdaMetrics(
      tenantIds,
      monthEnd.getTime(),
      trailing30Start.getTime()
    );
    console.info(
      `[retention] processed ${observation.customer} at ${observation.monthStart} across ${tenantIds.length} tenant id(s)`
    );
    enriched.push({
      ...observation,
      tenantIds,
      ...ardaMetrics,
    });
  }

  const customerSnapshots = Object.entries(ARDA_CUSTOMER_TENANTS)
    .map(([customer, tenantIds]) => {
      const rows = enriched.filter((observation) => observation.customer === customer);
      return {
        customer,
        tenantIds,
        observations: rows.length,
        retainedObservationRate: round(retentionRate(rows)),
        maxCardTouchesTrailing30: rows.reduce(
          (max, row) => Math.max(max, row.ardaCardTouchesTrailing30),
          0
        ),
        maxItemTouchesTrailing30: rows.reduce(
          (max, row) => Math.max(max, row.ardaItemTouchesTrailing30),
          0
        ),
        maxFacilities: rows.reduce((max, row) => Math.max(max, row.ardaFacilities), 0),
      };
    })
    .filter((snapshot) => snapshot.observations > 0)
    .sort((left, right) => right.maxCardTouchesTrailing30 - left.maxCardTouchesTrailing30);

  return {
    generatedAt: new Date().toISOString(),
    source: {
      stage2ArticleUrl: STAGE2_ARTICLE_URL,
      codaDocId: CODA_DOC_ID,
      summaryTableId: SUMMARY_TABLE_ID,
      rawTableId: RAW_TABLE_ID,
      ardaBaseUrl: process.env.ARDA_API_BASE_URL?.trim() ?? null,
    },
    population: {
      baselineObservationCount: observations.length,
      baselineCustomerCount: new Set(observations.map((observation) => observation.customer)).size,
      matchedObservationCount: enriched.length,
      matchedCustomerCount: new Set(enriched.map((observation) => observation.customer)).size,
      matchedBaselineNext8WeekRate: round(retentionRate(enriched)),
    },
    matchedCustomers: Object.entries(ARDA_CUSTOMER_TENANTS)
      .map(([customer, tenantIds]) => ({ customer, tenantIds }))
      .filter(({ customer }) => enriched.some((observation) => observation.customer === customer))
      .sort((left, right) => left.customer.localeCompare(right.customer)),
    indicatorChecks: {
      activeWeeksGe5: summarizeRows(enriched.filter((observation) => observation.activeWeeksTrailing8 >= 5)),
      anyArdaTouch30: summarizeRows(
        enriched.filter((observation) => observation.ardaAnyTouchTrailing30)
      ),
      ardaCombinedTouchesGe10: summarizeRows(
        enriched.filter((observation) => observation.ardaCombinedTouchesTrailing30 >= 10)
      ),
      ardaCardTouchesGe5: summarizeRows(
        enriched.filter((observation) => observation.ardaCardTouchesTrailing30 >= 5)
      ),
      ardaItemTouchesGe5: summarizeRows(
        enriched.filter((observation) => observation.ardaItemTouchesTrailing30 >= 5)
      ),
    },
    bucketSummaries: {
      combinedTouchesTrailing30: bucketize(enriched, (observation) => {
        if (observation.ardaCombinedTouchesTrailing30 === 0) return "0";
        if (observation.ardaCombinedTouchesTrailing30 <= 4) return "1-4";
        if (observation.ardaCombinedTouchesTrailing30 <= 19) return "5-19";
        return "20+";
      }),
      cardTouchesTrailing30: bucketize(enriched, (observation) => {
        if (observation.ardaCardTouchesTrailing30 === 0) return "0";
        if (observation.ardaCardTouchesTrailing30 <= 4) return "1-4";
        if (observation.ardaCardTouchesTrailing30 <= 19) return "5-19";
        return "20+";
      }),
      itemTouchesTrailing30: bucketize(enriched, (observation) => {
        if (observation.ardaItemTouchesTrailing30 === 0) return "0";
        if (observation.ardaItemTouchesTrailing30 <= 4) return "1-4";
        if (observation.ardaItemTouchesTrailing30 <= 19) return "5-19";
        return "20+";
      }),
      facilities: bucketize(enriched, (observation) => {
        if (observation.ardaFacilities <= 1) return "0-1";
        if (observation.ardaFacilities === 2) return "2";
        return "3+";
      }),
    },
    combinedChecks: {
      strongWeeksWithArdaTouch: summarizeRows(
        enriched.filter(
          (observation) =>
            observation.activeWeeksTrailing8 >= 5 && observation.ardaAnyTouchTrailing30
        )
      ),
      weakWeeksWithArdaTouch: summarizeRows(
        enriched.filter(
          (observation) =>
            observation.activeWeeksTrailing8 <= 4 && observation.ardaAnyTouchTrailing30
        )
      ),
      weakWeeksNoArdaTouch: summarizeRows(
        enriched.filter(
          (observation) =>
            observation.activeWeeksTrailing8 <= 4 && !observation.ardaAnyTouchTrailing30
        )
      ),
      strongWeeksAndCardTouchesGe5: summarizeRows(
        enriched.filter(
          (observation) =>
            observation.activeWeeksTrailing8 >= 5 && observation.ardaCardTouchesTrailing30 >= 5
        )
      ),
    },
    customerSnapshots,
    matchedObservations: enriched,
    notes: [
      "Matched customers were joined to Arda tenants manually from tenant names/domains on 2026-03-13.",
      "Arda metrics are point-in-time monthly snapshots using /query endpoints with effectiveasof and recordedasof at month end.",
      "Trailing-30 touch counts proxy operational engagement by counting records whose asOf or createdAt timestamp falls inside the prior 30 days.",
      "This Arda-enriched subset is smaller than the Coda baseline and should be treated as directional unless sample size is increased with more tenant matches.",
      ...(monthFilter.size > 0
        ? [`Month filter applied: ${[...monthFilter].sort().join(", ")}.`]
        : []),
    ],
  };
}

function renderMarkdown(result: EnrichedAnalysisResult): string {
  const failedObservations = result.matchedObservations
    .filter((observation) => !observation.future8WeekActive)
    .sort((left, right) =>
      left.customer === right.customer
        ? left.monthStart.localeCompare(right.monthStart)
        : left.customer.localeCompare(right.customer)
    );
  const lines: string[] = [
    "# Arda Enriched Retention Analysis",
    "",
    `Generated at: ${result.generatedAt}`,
    "",
    "## Population",
    `- Coda baseline observations: ${result.population.baselineObservationCount}`,
    `- Coda baseline customers: ${result.population.baselineCustomerCount}`,
    `- Arda-matched observations: ${result.population.matchedObservationCount}`,
    `- Arda-matched customers: ${result.population.matchedCustomerCount}`,
    `- Matched next-8-week continuation rate: ${result.population.matchedBaselineNext8WeekRate}`,
    "",
    "## Matched customers",
  ];

  for (const customer of result.matchedCustomers) {
    lines.push(`- ${customer.customer}: ${customer.tenantIds.length} tenant id(s)`);
  }

  lines.push(
    "",
    "## Indicator checks",
    `- Active weeks >= 5: n=${result.indicatorChecks.activeWeeksGe5.n}, retention=${result.indicatorChecks.activeWeeksGe5.retentionRate}`,
    `- Any Arda touch in trailing 30 days: n=${result.indicatorChecks.anyArdaTouch30.n}, retention=${result.indicatorChecks.anyArdaTouch30.retentionRate}`,
    `- Combined Arda touches >= 10: n=${result.indicatorChecks.ardaCombinedTouchesGe10.n}, retention=${result.indicatorChecks.ardaCombinedTouchesGe10.retentionRate}`,
    `- Card touches >= 5: n=${result.indicatorChecks.ardaCardTouchesGe5.n}, retention=${result.indicatorChecks.ardaCardTouchesGe5.retentionRate}`,
    `- Item touches >= 5: n=${result.indicatorChecks.ardaItemTouchesGe5.n}, retention=${result.indicatorChecks.ardaItemTouchesGe5.retentionRate}`,
    "",
    "## Combined checks",
    `- Strong weeks with Arda touch: n=${result.combinedChecks.strongWeeksWithArdaTouch.n}, retention=${result.combinedChecks.strongWeeksWithArdaTouch.retentionRate}`,
    `- Weak weeks with Arda touch: n=${result.combinedChecks.weakWeeksWithArdaTouch.n}, retention=${result.combinedChecks.weakWeeksWithArdaTouch.retentionRate}`,
    `- Weak weeks with no Arda touch: n=${result.combinedChecks.weakWeeksNoArdaTouch.n}, retention=${result.combinedChecks.weakWeeksNoArdaTouch.retentionRate}`,
    `- Strong weeks and 5+ card touches: n=${result.combinedChecks.strongWeeksAndCardTouchesGe5.n}, retention=${result.combinedChecks.strongWeeksAndCardTouchesGe5.retentionRate}`,
    "",
    "## Failed matched observations",
  );

  if (failedObservations.length === 0) {
    lines.push("- None in the current matched slice.");
  } else {
    for (const observation of failedObservations) {
      lines.push(
        `- ${observation.customer} at ${observation.monthStart}: weeks=${observation.activeWeeksTrailing8}, cards30=${observation.ardaCardTouchesTrailing30}, items30=${observation.ardaItemTouchesTrailing30}, orders30=${observation.ardaOrderTouchesTrailing30}`
      );
    }
  }

  lines.push(
    "",
    "## Customer snapshots",
  );

  for (const snapshot of result.customerSnapshots) {
    lines.push(
      `- ${snapshot.customer}: observations=${snapshot.observations}, retained=${snapshot.retainedObservationRate}, maxCardTouches30=${snapshot.maxCardTouchesTrailing30}, maxItemTouches30=${snapshot.maxItemTouchesTrailing30}, maxFacilities=${snapshot.maxFacilities}`
    );
  }

  lines.push("", "## Notes");
  for (const note of result.notes) {
    lines.push(`- ${note}`);
  }

  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  await loadLocalEnv();
  const result = await buildEnrichedAnalysis();
  const outputDir = path.join(process.cwd(), "docs", "retention");
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "arda-enriched-lir-analysis.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(outputDir, "arda-enriched-lir-analysis.md"),
    renderMarkdown(result),
    "utf8"
  );
  console.info(
    `[retention] wrote Arda-enriched LIR analysis for ${result.population.matchedCustomerCount} matched customers and ${result.population.matchedObservationCount} matched observations`
  );
}

main().catch((error) => {
  console.error("[retention] Arda-enriched LIR analysis failed", error);
  process.exitCode = 1;
});
