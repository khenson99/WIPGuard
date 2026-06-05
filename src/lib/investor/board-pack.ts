import { prisma } from "@/lib/prisma";

export interface InvestorBoardMetric {
  key: string;
  label: string;
  value: number | string | null;
  priorValue: number | string | null;
  delta: number | null;
  unit: string | null;
  trust: string | null;
  asOf: string | null;
  warnings: string[];
  sourceLineageKeys?: string[];
  sourceLineageCount?: number;
  latestSourceCapturedAt?: string;
}

export interface InvestorHealthyArrGrowthDriver {
  id: string;
  label: string;
  value: number | string | null;
  unit: string | null;
  status: "strong" | "watch" | "missing";
  trust?: string | null;
  warnings?: string[];
  sourceLineageKeys?: string[];
  sourceLineageCount?: number;
  latestSourceCapturedAt?: string;
}

export interface InvestorHealthyArrGrowthSnapshot {
  label: "Healthy ARR Growth";
  status: "strong" | "watch" | "missing";
  currentArr: number | null;
  currentMrr: number | null;
  netNewArr: number | null;
  summary: string;
  drivers: InvestorHealthyArrGrowthDriver[];
}

export interface InvestorBoardPackPayload {
  status: "empty" | "ready";
  emptyState: {
    title: string;
    description: string;
  } | null;
  pack: {
    id: string;
    packSlug: string;
    packName: string;
    generatedAt: string;
    deterministicNotes: string[];
    healthyArrGrowth: InvestorHealthyArrGrowthSnapshot;
    metrics: InvestorBoardMetric[];
    markdown: string;
    csv: string;
    slideJson: unknown;
    boardFinal: {
      approvedAt: string;
      overrideReason: string | null;
    };
  } | null;
}

export interface LoadInvestorBoardPackInput {
  userId: string;
  organizationId: string | null;
}

const EMPTY_INVESTOR_BOARD_PACK: InvestorBoardPackPayload = {
  status: "empty",
  emptyState: {
    title: "No approved investor pack is available yet.",
    description:
      "An Arda admin must approve a board-final monthly pack before investors can view it.",
  },
  pack: null,
};

interface BoardFinalReportRow {
  id: string;
  packSlug: string;
  packName: string;
  generatedAt: Date | string;
  deterministicNotes: string[];
  markdown: string;
  csv: string;
  slideJson: unknown;
  boardFinalAt: Date | string;
  boardFinalOverrideReason: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asMetricWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((warning): warning is string => typeof warning === "string" && warning.trim().length > 0);
}

function primitiveMetricValue(value: unknown): number | string | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value === null) return null;
  return null;
}

function metricValueCandidateKeys(key: string | null, unit: string | null): string[] {
  const keys = new Set<string>();
  const add = (...values: string[]) => {
    for (const value of values) keys.add(value);
  };

  if (unit === "currency") {
    add("amount", "totalRevenue", "total_revenue", "cashBalance", "cash_balance", "netBurn", "net_burn", "qualifiedPipeline", "qualified_pipeline");
  }
  if (unit === "months") add("months", "runwayMonths", "runway_months");
  if (unit === "count") {
    add("count", "activeSubscriptions", "active_subscriptions", "activeCustomers", "active_customers", "customers", "demos", "qualifiedDealCount", "qualified_deal_count", "customerActivity", "customer_activity");
  }
  if (unit === "percent") {
    add("rate", "grossMargin", "gross_margin", "conversionRate", "conversion_rate", "activationRate", "activation_rate", "churnRate", "churn_rate", "retentionRate", "retention_rate");
  }
  if (unit === "ratio") add("ratio", "pipelineEfficiency", "pipeline_efficiency");
  if (unit === "score") {
    add("score", "customerHealth", "customer_health", "retentionRisk", "retention_risk", "riskScore", "risk_score");
  }

  switch (key) {
    case "revenue.mrr":
    case "revenue.arr":
    case "revenue.total_revenue":
    case "revenue.subscription_revenue":
    case "revenue.services_revenue":
    case "finance.cash_balance":
    case "finance.net_burn":
    case "finance.expenses":
    case "sales.qualified_pipeline":
      add("amount");
      break;
    case "finance.cash_runway_months":
      add("months");
      break;
    case "finance.gross_margin":
    case "marketing.conversion_rate":
    case "product.activation_rate":
    case "customer_success.churn_rate":
    case "customer_success.retention_rate":
      add("rate");
      break;
    case "marketing.pipeline_efficiency":
      add("ratio");
      break;
    case "customer_success.customer_health":
    case "customer_success.retention_risk":
      add("score", "riskScore", "risk_score");
      break;
    default:
      break;
  }

  add("value");
  return [...keys];
}

function metricScalarValue(metric: Record<string, unknown>, field: "value" | "priorValue"): number | string | null {
  const direct = primitiveMetricValue(metric[field]);
  if (direct !== null || metric[field] === null) return direct;

  const source = asRecord(metric[field]);
  const data = asRecord(source.data);
  const sources = [
    source,
    asRecord(source.value),
    asRecord(source.metricValue),
    asRecord(source.metric_value),
    data,
    asRecord(data.attributes),
    asRecord(source.properties),
    asRecord(source.summary),
    asRecord(source.metrics),
    asRecord(source.values),
    asRecord(source.fields),
  ].filter((candidate) => Object.keys(candidate).length > 0);

  const key = asString(metric.key);
  const unit = asString(metric.unit);
  for (const candidateKey of metricValueCandidateKeys(key, unit)) {
    for (const candidate of sources) {
      const value = primitiveMetricValue(candidate[candidateKey]);
      if (value !== null) return value;
    }
  }

  return null;
}

function asMetricSourceLineageKeys(metric: Record<string, unknown>): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const addKey = (value: unknown) => {
    const key = asString(value);
    if (!key || seen.has(key)) return;
    seen.add(key);
    keys.push(key);
  };

  if (Array.isArray(metric.sourceLineageKeys)) {
    for (const key of metric.sourceLineageKeys) addKey(key);
  }

  if (Array.isArray(metric.sourceLineage)) {
    for (const lineage of metric.sourceLineage) {
      addKey(asRecord(lineage).sourceKey);
    }
  }

  return keys;
}

function asIsoTimestamp(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const timestamp = new Date(raw);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function latestMetricLineageCapturedAt(metric: Record<string, unknown>): string | null {
  const timestamps: string[] = [];
  const existingLatest = asIsoTimestamp(metric.latestSourceCapturedAt);
  if (existingLatest) timestamps.push(existingLatest);

  if (Array.isArray(metric.sourceLineage)) {
    for (const lineage of metric.sourceLineage) {
      const capturedAt = asIsoTimestamp(asRecord(lineage).capturedAt);
      if (capturedAt) timestamps.push(capturedAt);
    }
  }

  return timestamps.sort().at(-1) ?? null;
}

function metricSourceLineageField(
  metric: Record<string, unknown>,
): Pick<InvestorBoardMetric, "sourceLineageKeys" | "sourceLineageCount" | "latestSourceCapturedAt"> {
  const sourceLineageKeys = asMetricSourceLineageKeys(metric);
  const sourceLineageCount =
    Array.isArray(metric.sourceLineage) && metric.sourceLineage.length > 0
      ? metric.sourceLineage.length
      : asNumber(metric.sourceLineageCount);
  const latestSourceCapturedAt = latestMetricLineageCapturedAt(metric);

  return {
    ...(sourceLineageKeys.length > 0 ? { sourceLineageKeys } : {}),
    ...(sourceLineageCount !== null && sourceLineageCount > 0 ? { sourceLineageCount } : {}),
    ...(latestSourceCapturedAt ? { latestSourceCapturedAt } : {}),
  };
}

function extractInvestorMetrics(slideJson: unknown): InvestorBoardMetric[] {
  const sections = asRecord(slideJson).sections;
  if (!Array.isArray(sections)) return [];

  const metrics: InvestorBoardMetric[] = [];
  for (const section of sections) {
    const sectionMetrics = asRecord(section).metrics;
    if (!Array.isArray(sectionMetrics)) continue;
    for (const metricValue of sectionMetrics) {
      const metric = asRecord(metricValue);
      const key = asString(metric.key);
      const label = asString(metric.label);
      if (!key || !label) continue;
      metrics.push({
        key,
        label,
        value: metricScalarValue(metric, "value"),
        priorValue: metricScalarValue(metric, "priorValue"),
        delta: asNumber(metric.delta),
        unit: asString(metric.unit),
        trust: asString(metric.trust),
        asOf: asString(metric.asOf),
        warnings: asMetricWarnings(metric.warnings),
        ...metricSourceLineageField(metric),
      });
    }
  }

  return metrics;
}

function sanitizeSlideJson(slideJson: unknown): unknown {
  const source = asRecord(slideJson);
  const sections = Array.isArray(source.sections)
    ? source.sections.map((section) => {
        const sectionRecord = asRecord(section);
        const metrics = Array.isArray(sectionRecord.metrics)
          ? sectionRecord.metrics
              .map((metricValue) => {
                const metric = asRecord(metricValue);
                const key = asString(metric.key);
                const label = asString(metric.label);
                if (!key || !label) return null;
                return {
                  key,
                  label,
                  value: metricScalarValue(metric, "value"),
                  priorValue: metricScalarValue(metric, "priorValue"),
                  delta: asNumber(metric.delta),
                  unit: asString(metric.unit),
                  trust: asString(metric.trust),
                  asOf: asString(metric.asOf),
                  warnings: asMetricWarnings(metric.warnings),
                  ...metricSourceLineageField(metric),
                };
              })
              .filter(Boolean)
          : [];
        return {
          title: asString(sectionRecord.title) ?? "Metrics",
          metrics,
        };
      })
    : [];

  return {
    title: asString(source.title) ?? "Investor Update",
    generatedAt: asString(source.generatedAt),
    readiness: asRecord(source.readiness),
    sections,
    notes: Array.isArray(source.notes)
      ? source.notes.filter((note): note is string => typeof note === "string" && note.trim().length > 0)
      : [],
  };
}

function metricByKey(metrics: InvestorBoardMetric[], keys: string[]): InvestorBoardMetric | null {
  return keys.map((key) => metrics.find((metric) => metric.key === key) ?? null).find(Boolean) ?? null;
}

function metricNumber(metrics: InvestorBoardMetric[], keys: string[]): number | null {
  const metric = metricByKey(metrics, keys);
  return asNumber(metric?.value);
}

function statusForMetric(metric: InvestorBoardMetric | null): InvestorHealthyArrGrowthDriver["status"] {
  if (!metric || metric.value === null || metric.value === undefined || metric.value === "") return "missing";
  return metric.trust === "fresh" ? "strong" : "watch";
}

interface HealthyArrGrowthDriverSpec {
  id: string;
  label: string;
  keys: string[];
  unit: string;
}

const HEALTHY_ARR_GROWTH_DRIVER_SPECS: HealthyArrGrowthDriverSpec[] = [
  { id: "runway", label: "Runway", keys: ["finance.cash_runway_months"], unit: "months" },
  { id: "cash_balance", label: "Cash Balance", keys: ["finance.cash_balance"], unit: "currency" },
  { id: "net_burn", label: "Net Burn", keys: ["finance.net_burn"], unit: "currency" },
  { id: "expenses", label: "Expenses", keys: ["finance.expenses"], unit: "currency" },
  { id: "gross_margin", label: "Gross Margin", keys: ["finance.gross_margin"], unit: "percent" },
  {
    id: "subscription_revenue",
    label: "Subscription Revenue",
    keys: ["revenue.subscription_revenue"],
    unit: "currency",
  },
  { id: "services_revenue", label: "Services Revenue", keys: ["revenue.services_revenue"], unit: "currency" },
  {
    id: "active_subscriptions",
    label: "Active Subscriptions",
    keys: ["revenue.active_subscriptions"],
    unit: "count",
  },
  { id: "customer_count", label: "Customers", keys: ["revenue.customer_count"], unit: "count" },
  { id: "pipeline", label: "Pipeline", keys: ["sales.qualified_pipeline"], unit: "currency" },
  { id: "demos", label: "Demos", keys: ["sales.demos"], unit: "count" },
  { id: "website_traffic", label: "Website Traffic", keys: ["marketing.website_traffic"], unit: "count" },
  { id: "conversion_rate", label: "Conversion Rate", keys: ["marketing.conversion_rate"], unit: "percent" },
  {
    id: "pipeline_efficiency",
    label: "Pipeline Efficiency",
    keys: ["marketing.pipeline_efficiency"],
    unit: "ratio",
  },
  { id: "activation", label: "Activation", keys: ["product.activation_rate"], unit: "percent" },
  {
    id: "customer_health",
    label: "Customer Health",
    keys: ["customer_success.customer_health"],
    unit: "score",
  },
  {
    id: "customer_activity",
    label: "Customer Activity",
    keys: ["customer_success.customer_activity"],
    unit: "count",
  },
  { id: "churn_rate", label: "Churn Rate", keys: ["customer_success.churn_rate"], unit: "percent" },
  { id: "retention_rate", label: "Retention Rate", keys: ["customer_success.retention_rate"], unit: "percent" },
  {
    id: "retention_risk",
    label: "Retention Risk",
    keys: ["customer_success.retention_risk"],
    unit: "score",
  },
];

function buildHealthyArrGrowthDriver(
  metrics: InvestorBoardMetric[],
  spec: HealthyArrGrowthDriverSpec,
): InvestorHealthyArrGrowthDriver {
  const metric = metricByKey(metrics, spec.keys);
  return {
    id: spec.id,
    label: spec.label,
    value: metric?.value ?? null,
    unit: metric?.unit ?? spec.unit,
    status: statusForMetric(metric),
    ...(metric?.trust ? { trust: metric.trust } : {}),
    ...(metric?.warnings && metric.warnings.length > 0 ? { warnings: metric.warnings } : {}),
    ...(metric?.sourceLineageKeys ? { sourceLineageKeys: metric.sourceLineageKeys } : {}),
    ...(metric?.sourceLineageCount ? { sourceLineageCount: metric.sourceLineageCount } : {}),
    ...(metric?.latestSourceCapturedAt ? { latestSourceCapturedAt: metric.latestSourceCapturedAt } : {}),
  };
}

function buildHealthyArrGrowthSnapshot(metrics: InvestorBoardMetric[]): InvestorHealthyArrGrowthSnapshot {
  const mrr = metricNumber(metrics, ["revenue.mrr", "finance.mrr"]);
  const arr = metricNumber(metrics, ["revenue.arr"]) ?? (mrr === null ? null : mrr * 12);
  const arrMetric = metricByKey(metrics, ["revenue.arr"]);
  const mrrMetric = metricByKey(metrics, ["revenue.mrr", "finance.mrr"]);
  const netNewArr = asNumber(arrMetric?.delta) ?? (asNumber(mrrMetric?.delta) === null ? null : asNumber(mrrMetric?.delta)! * 12);
  const drivers = HEALTHY_ARR_GROWTH_DRIVER_SPECS.map((spec) => buildHealthyArrGrowthDriver(metrics, spec));
  const status =
    arr === null && mrr === null
      ? "missing"
      : drivers.some((driver) => driver.status === "watch" || driver.status === "missing")
        ? "watch"
        : "strong";

  return {
    label: "Healthy ARR Growth",
    status,
    currentArr: arr,
    currentMrr: mrr,
    netNewArr,
    summary:
      "Approved ARR/MRR growth interpreted through runway, burn, margin, revenue mix, acquisition, activation, retention, and trust labels.",
    drivers,
  };
}

export async function loadInvestorBoardPack(
  input: LoadInvestorBoardPackInput,
): Promise<InvestorBoardPackPayload> {
  type BoardFinalReportRunDelegate = {
    findFirst(args: {
      where: {
        packSlug: "investor-update";
        boardFinalAt: { not: null };
        organizationId?: string;
      };
      orderBy: Array<{ boardFinalAt: "desc" } | { generatedAt: "desc" }>;
      select: Record<keyof BoardFinalReportRow, true>;
    }): Promise<BoardFinalReportRow | null>;
  };

  const where: {
    packSlug: "investor-update";
    boardFinalAt: { not: null };
    organizationId?: string;
  } = {
    packSlug: "investor-update",
    boardFinalAt: { not: null },
  };
  if (input.organizationId) {
    where.organizationId = input.organizationId;
  }

  const row = await (prisma.ceoReportRun as unknown as BoardFinalReportRunDelegate).findFirst({
    where,
    orderBy: [{ boardFinalAt: "desc" }, { generatedAt: "desc" }],
    select: {
      id: true,
      packSlug: true,
      packName: true,
      generatedAt: true,
      deterministicNotes: true,
      markdown: true,
      csv: true,
      slideJson: true,
      boardFinalAt: true,
      boardFinalOverrideReason: true,
    },
  });

  if (!row) return EMPTY_INVESTOR_BOARD_PACK;

  const metrics = extractInvestorMetrics(row.slideJson);
  const slideJson = sanitizeSlideJson(row.slideJson);

  return {
    status: "ready",
    emptyState: null,
    pack: {
      id: row.id,
      packSlug: row.packSlug,
      packName: row.packName,
      generatedAt: new Date(row.generatedAt).toISOString(),
      deterministicNotes: row.deterministicNotes,
      healthyArrGrowth: buildHealthyArrGrowthSnapshot(metrics),
      metrics,
      markdown: row.markdown,
      csv: row.csv,
      slideJson,
      boardFinal: {
        approvedAt: new Date(row.boardFinalAt).toISOString(),
        overrideReason: row.boardFinalOverrideReason ?? null,
      },
    },
  };
}
