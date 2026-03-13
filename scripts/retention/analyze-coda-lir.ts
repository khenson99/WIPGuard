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

interface BucketSummary {
  n: number;
  retentionRate: number | null;
}

interface AnalysisResult {
  generatedAt: string;
  source: {
    stage2ArticleUrl: string;
    codaDocId: string;
    summaryTableId: string;
    rawTableId: string;
  };
  population: {
    observationCount: number;
    customerCount: number;
    baselineNext8WeekRate: number | null;
    baselineNext8WeekRateExRossmonster: number | null;
  };
  bucketSummaries: {
    activeWeeksTrailing8: Record<string, BucketSummary>;
    activeMonthsPrev3: Record<string, BucketSummary>;
    uniqueItemsTrailing30: Record<string, BucketSummary>;
    trendRatio: Record<string, BucketSummary>;
  };
  indicatorChecks: Record<
    string,
    {
      all: BucketSummary;
      exRossmonster: BucketSummary;
    }
  >;
  combinedChecks: Record<string, BucketSummary>;
  topCustomers2025Orders: Array<{ customer: string; orders2025: number }>;
  observations: Observation[];
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

function retentionRate(rows: Observation[]): number | null {
  if (rows.length === 0) return null;
  return rows.filter((row) => row.future8WeekActive).length / rows.length;
}

function summarizeRows(rows: Observation[]): BucketSummary {
  return {
    n: rows.length,
    retentionRate: round(retentionRate(rows)),
  };
}

function bucketize(
  rows: Observation[],
  getBucket: (row: Observation) => string
): Record<string, BucketSummary> {
  const buckets = new Map<string, Observation[]>();
  for (const row of rows) {
    const bucket = getBucket(row);
    const existing = buckets.get(bucket) ?? [];
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
    throw new Error("CODA_API_TOKEN is required to analyze Coda retention indicators.");
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

async function buildAnalysis(): Promise<AnalysisResult> {
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
    if (!monthStart) continue;

    const orders = Number(values["c-5WBoSFjy9O"] ?? 0);
    monthlyOrders.set(`${customer}::${monthKey(monthStart)}`, Number.isFinite(orders) ? orders : 0);
    customers.add(customer);
  }

  const rawActivity = new Map<string, Array<{ orderedAt: Date; itemName: string }>>();
  for (const row of rawRows) {
    const values = row.values ?? {};
    const customer = normalizeCustomerName(values["c-8yeOnXGW7r"]);
    if (EXCLUDED_CUSTOMERS.has(customer)) continue;

    const orderedAt = parseDateValue(values["c-3rgpjUaRuA"]);
    if (!orderedAt) continue;

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

  const exRossmonster = observations.filter((observation) => observation.customer !== "Rossmonster");

  const analysis: AnalysisResult = {
    generatedAt: new Date().toISOString(),
    source: {
      stage2ArticleUrl: STAGE2_ARTICLE_URL,
      codaDocId: CODA_DOC_ID,
      summaryTableId: SUMMARY_TABLE_ID,
      rawTableId: RAW_TABLE_ID,
    },
    population: {
      observationCount: observations.length,
      customerCount: new Set(observations.map((observation) => observation.customer)).size,
      baselineNext8WeekRate: round(retentionRate(observations)),
      baselineNext8WeekRateExRossmonster: round(retentionRate(exRossmonster)),
    },
    bucketSummaries: {
      activeWeeksTrailing8: bucketize(observations, (observation) => {
        if (observation.activeWeeksTrailing8 <= 2) return "0-2";
        if (observation.activeWeeksTrailing8 <= 4) return "3-4";
        if (observation.activeWeeksTrailing8 <= 6) return "5-6";
        return "7-8";
      }),
      activeMonthsPrev3: bucketize(observations, (observation) => String(observation.activeMonthsPrev3)),
      uniqueItemsTrailing30: bucketize(observations, (observation) => {
        if (observation.uniqueItemsTrailing30 <= 1) return "1";
        if (observation.uniqueItemsTrailing30 <= 4) return "2-4";
        if (observation.uniqueItemsTrailing30 <= 9) return "5-9";
        return "10+";
      }),
      trendRatio: bucketize(
        observations.filter((observation) => observation.trendRatio !== null),
        (observation) => {
          const ratio = observation.trendRatio ?? 0;
          if (ratio < 0.5) return "<0.5x";
          if (ratio < 0.9) return "0.5-0.9x";
          if (ratio <= 1.2) return "0.9-1.2x";
          return ">1.2x";
        }
      ),
    },
    indicatorChecks: {
      activeWeeksGe5: {
        all: summarizeRows(observations.filter((observation) => observation.activeWeeksTrailing8 >= 5)),
        exRossmonster: summarizeRows(exRossmonster.filter((observation) => observation.activeWeeksTrailing8 >= 5)),
      },
      activeMonthsPrev3Ge2: {
        all: summarizeRows(observations.filter((observation) => observation.activeMonthsPrev3 >= 2)),
        exRossmonster: summarizeRows(exRossmonster.filter((observation) => observation.activeMonthsPrev3 >= 2)),
      },
      uniqueItemsGe5: {
        all: summarizeRows(observations.filter((observation) => observation.uniqueItemsTrailing30 >= 5)),
        exRossmonster: summarizeRows(exRossmonster.filter((observation) => observation.uniqueItemsTrailing30 >= 5)),
      },
      trendBelowHalf: {
        all: summarizeRows(
          observations.filter(
            (observation) => observation.trendRatio !== null && observation.trendRatio < 0.5
          )
        ),
        exRossmonster: summarizeRows(
          exRossmonster.filter(
            (observation) => observation.trendRatio !== null && observation.trendRatio < 0.5
          )
        ),
      },
    },
    combinedChecks: {
      lowWeeksAndNoHistory: summarizeRows(
        observations.filter(
          (observation) =>
            observation.activeWeeksTrailing8 <= 2 && observation.activeMonthsPrev3 === 0
        )
      ),
      lowWeeksOnly: summarizeRows(
        observations.filter((observation) => observation.activeWeeksTrailing8 <= 2)
      ),
      lowWeeksAndDrop: summarizeRows(
        observations.filter(
          (observation) =>
            observation.activeWeeksTrailing8 <= 2 &&
            observation.trendRatio !== null &&
            observation.trendRatio < 0.5
        )
      ),
      strongWeeksAndHistory: summarizeRows(
        exRossmonster.filter(
          (observation) =>
            observation.activeWeeksTrailing8 >= 5 && observation.activeMonthsPrev3 >= 2
        )
      ),
    },
    topCustomers2025Orders: [...customers]
      .map((customer) => ({
        customer,
        orders2025: Array.from({ length: 12 }, (_, month) =>
          monthlyOrders.get(`${customer}::${monthKey(new Date(Date.UTC(2025, month, 1)))}`) ?? 0
        ).reduce((sum, value) => sum + value, 0),
      }))
      .sort((left, right) => right.orders2025 - left.orders2025)
      .slice(0, 12),
    observations,
    notes: [
      "Outcome metric is any order activity in the next 8 weeks.",
      "Observation window covers active customer-months from January 2025 through October 2025 so each row has a forward-looking retention window.",
      "Internal/testing entities were excluded, and known customer-name variants were normalized before scoring.",
      "This analysis measures order cadence and item breadth from Coda only; it does not yet incorporate Arda cards/items APIs, support tickets, or billing health.",
    ],
  };

  return analysis;
}

function renderMarkdown(result: AnalysisResult): string {
  const lines: string[] = [
    "# Arda Coda LIR Analysis",
    "",
    `Generated at: ${result.generatedAt}`,
    "",
    "## Source framing",
    `- Stage 2 LIR article: ${result.source.stage2ArticleUrl}`,
    `- Coda doc: Master Order Archive 2025 (${result.source.codaDocId})`,
    `- Summary table: ${result.source.summaryTableId}`,
    `- Raw order table: ${result.source.rawTableId}`,
    "",
    "## Population",
    `- Observation count: ${result.population.observationCount}`,
    `- Customer count: ${result.population.customerCount}`,
    `- Baseline next-8-week continuation rate: ${result.population.baselineNext8WeekRate}`,
    `- Baseline next-8-week continuation rate excluding Rossmonster: ${result.population.baselineNext8WeekRateExRossmonster}`,
    "",
    "## Primary conclusion",
    "- The strongest measured leading indicator is recurring weekly operational activity, not raw monthly order volume.",
    `- Customers with 5+ active weeks in the trailing 8 weeks retained at ${result.indicatorChecks.activeWeeksGe5.exRossmonster.retentionRate} excluding Rossmonster.`,
    `- Customers with only 0-2 active weeks retained at ${result.combinedChecks.lowWeeksOnly.retentionRate}.`,
    `- The strongest combined condition was 5+ active trailing weeks plus activity in 2+ of the prior 3 months, with a retention rate of ${result.combinedChecks.strongWeeksAndHistory.retentionRate}.`,
    "",
    "## Indicator checks",
    `- Active weeks >= 5: n=${result.indicatorChecks.activeWeeksGe5.exRossmonster.n}, retention=${result.indicatorChecks.activeWeeksGe5.exRossmonster.retentionRate} excluding Rossmonster`,
    `- Active prior 3 months >= 2: n=${result.indicatorChecks.activeMonthsPrev3Ge2.exRossmonster.n}, retention=${result.indicatorChecks.activeMonthsPrev3Ge2.exRossmonster.retentionRate} excluding Rossmonster`,
    `- Unique items in trailing 30 days >= 5: n=${result.indicatorChecks.uniqueItemsGe5.exRossmonster.n}, retention=${result.indicatorChecks.uniqueItemsGe5.exRossmonster.retentionRate} excluding Rossmonster`,
    `- Trend ratio below 0.5x: n=${result.indicatorChecks.trendBelowHalf.exRossmonster.n}, retention=${result.indicatorChecks.trendBelowHalf.exRossmonster.retentionRate} excluding Rossmonster`,
    "",
    "## Combined conditions",
    `- Low weeks and no history: n=${result.combinedChecks.lowWeeksAndNoHistory.n}, retention=${result.combinedChecks.lowWeeksAndNoHistory.retentionRate}`,
    `- Low weeks only: n=${result.combinedChecks.lowWeeksOnly.n}, retention=${result.combinedChecks.lowWeeksOnly.retentionRate}`,
    `- Low weeks and drop: n=${result.combinedChecks.lowWeeksAndDrop.n}, retention=${result.combinedChecks.lowWeeksAndDrop.retentionRate}`,
    `- Strong weeks and history: n=${result.combinedChecks.strongWeeksAndHistory.n}, retention=${result.combinedChecks.strongWeeksAndHistory.retentionRate}`,
    "",
    "## Recommended Arda LIR",
    "- Mature customers: active in 5 or more of the last 8 weeks.",
    "- Supporting indicators: activity in 2 or more of the prior 3 months, breadth of ordered items, support distress, and billing distress.",
    "- Onboarding customers: still needs direct Arda go-live and first-value instrumentation to validate time-to-first-order or card/item touch thresholds.",
    "",
    "## Top 2025 customers by order count",
  ];

  for (const row of result.topCustomers2025Orders) {
    lines.push(`- ${row.customer}: ${row.orders2025}`);
  }

  lines.push("", "## Notes");
  for (const note of result.notes) {
    lines.push(`- ${note}`);
  }

  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  await loadLocalEnv();
  const result = await buildAnalysis();
  const outputDir = path.join(process.cwd(), "docs", "retention");
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "arda-coda-lir-analysis.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(outputDir, "arda-coda-lir-analysis.md"),
    renderMarkdown(result),
    "utf8"
  );
  console.info(
    `[retention] wrote Coda LIR analysis for ${result.population.customerCount} customers and ${result.population.observationCount} observations`
  );
}

main().catch((error) => {
  console.error("[retention] Coda LIR analysis failed", error);
  process.exitCode = 1;
});
