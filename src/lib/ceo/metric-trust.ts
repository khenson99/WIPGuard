import {
  ANALYTICS_PRIMARY_SECTIONS,
  ANALYTICS_SUB_SECTIONS,
  type AnalyticsPrimarySectionId,
  type AnalyticsSubSection,
} from "@/lib/analytics/section-registry";

export type CeoMetricDomain = AnalyticsPrimarySectionId | "ceo";

export type CeoMetricUnit =
  | "count"
  | "currency"
  | "days"
  | "percent"
  | "ratio"
  | "score"
  | "text";

export type CeoMetricTrustStatus =
  | "fresh"
  | "stale"
  | "partial"
  | "missing"
  | "error"
  | "conflicted";

export interface CeoMetricDefinition {
  key: string;
  label: string;
  domain: CeoMetricDomain;
  ownerAudience: "CEO" | "BOARD" | "TEAM" | "INVESTOR";
  unit: CeoMetricUnit;
  calculationVersion: string;
  sourceDependencies: string[];
  optionalSourceDependencies?: string[];
  freshnessSlaHours: number;
  boardEligible: boolean;
  weeklyEligible: boolean;
  description: string;
}

export interface CeoSourceSample {
  sourceKey: string;
  sourceId?: string | null;
  status: "SUCCESS" | "ERROR" | "MISSING" | "PARTIAL";
  capturedAt?: string | Date | null;
  expiresAt?: string | Date | null;
  lastError?: string | null;
}

export interface CeoMetricSourceState {
  sourceKey: string;
  sourceId: string | null;
  status: CeoSourceSample["status"];
  capturedAt: string | null;
  expiresAt: string | null;
  ageHours: number | null;
  fresh: boolean;
  lastError: string | null;
}

export interface CeoMetricTrust {
  status: CeoMetricTrustStatus;
  confidence: number;
  warnings: string[];
  sourceStates: CeoMetricSourceState[];
}

export interface CeoMetricValue {
  definition: CeoMetricDefinition;
  value: number | string | null;
  priorValue: number | string | null;
  delta: number | null;
  details?: Array<{
    key: string;
    label: string;
    value: number | string | null;
    unit?: CeoMetricUnit;
  }>;
  periodStart: string;
  periodEnd: string;
  asOf: string;
  computedAt: string;
  trust: CeoMetricTrust;
  lineage: Array<{
    sourceKey: string;
    sourceId: string | null;
    capturedAt: string | null;
  }>;
}

export interface CeoReadinessGate {
  metricKey: string;
  label: string;
  reason: string;
}

export interface CeoReadiness {
  status: "board_ready" | "not_board_final";
  ready: boolean;
  summary: string;
  failingGates: CeoReadinessGate[];
}

export interface CeoReportPackSection {
  title: string;
  metricKeys: string[];
}

export interface CeoReportPack {
  slug: string;
  name: string;
  description: string;
  cadence: "weekly" | "monthly" | "quarterly" | "ad_hoc";
  audience: "CEO" | "BOARD" | "TEAM" | "INVESTOR";
  metricKeys: string[];
  sections: CeoReportPackSection[];
}

export interface CeoReportRun {
  packSlug: string;
  packName: string;
  generatedAt: string;
  metrics: CeoMetricValue[];
  deterministicNotes: string[];
  markdown: string;
  csv: string;
  slideJson: {
    title: string;
    generatedAt: string;
    readiness: CeoReadiness;
    sections: Array<{
      title: string;
      metrics: Array<{
        key: string;
        label: string;
        value: number | string | null;
        priorValue: number | string | null;
        delta: number | null;
        unit: CeoMetricUnit;
        trust: CeoMetricTrustStatus;
        asOf: string;
        warnings: string[];
        details?: CeoMetricValue["details"];
      }>;
    }>;
    notes: string[];
  };
}

const CALCULATION_VERSION = "ceo-metric-trust-v1";
const BOARD_GRADE_CORE_KEYS = new Set<string>([
  "ceo.flow_reliability_score",
  "ceo.throughput_30d",
  "ceo.overdue_open_tasks",
  "finance.cash_balance",
  "finance.mrr",
  "sales.open_pipeline_value",
  "retention.at_risk_accounts",
  "customer_success.support_load",
  "website.sessions",
  "social.paid_spend",
]);

const CORE_METRICS: CeoMetricDefinition[] = [
  {
    key: "ceo.flow_reliability_score",
    label: "Internal Execution Reliability",
    domain: "ceo",
    ownerAudience: "CEO",
    unit: "score",
    calculationVersion: CALCULATION_VERSION,
    sourceDependencies: ["wipguard"],
    freshnessSlaHours: 1,
    boardEligible: true,
    weeklyEligible: true,
    description: "Composite legacy internal execution reliability score from overdue, stale, blocker, throughput, and work-in-progress signals.",
  },
  {
    key: "ceo.throughput_30d",
    label: "Internal Execution Throughput 30d",
    domain: "ceo",
    ownerAudience: "TEAM",
    unit: "count",
    calculationVersion: CALCULATION_VERSION,
    sourceDependencies: ["wipguard"],
    freshnessSlaHours: 1,
    boardEligible: true,
    weeklyEligible: true,
    description: "Completed legacy internal execution items over the trailing 30 days.",
  },
  {
    key: "ceo.overdue_open_tasks",
    label: "Legacy Open Execution Items",
    domain: "ceo",
    ownerAudience: "TEAM",
    unit: "count",
    calculationVersion: CALCULATION_VERSION,
    sourceDependencies: ["wipguard"],
    freshnessSlaHours: 1,
    boardEligible: true,
    weeklyEligible: true,
    description: "Open legacy internal execution items past their expected date.",
  },
  {
    key: "finance.cash_balance",
    label: "Cash Balance",
    domain: "finance",
    ownerAudience: "BOARD",
    unit: "currency",
    calculationVersion: CALCULATION_VERSION,
    sourceDependencies: ["mercury"],
    freshnessSlaHours: 24,
    boardEligible: true,
    weeklyEligible: true,
    description: "Latest cash balance from financial source systems.",
  },
  {
    key: "finance.mrr",
    label: "MRR",
    domain: "finance",
    ownerAudience: "BOARD",
    unit: "currency",
    calculationVersion: CALCULATION_VERSION,
    sourceDependencies: ["stripe", "hubspot"],
    freshnessSlaHours: 24,
    boardEligible: true,
    weeklyEligible: true,
    description: "Current monthly recurring revenue from Stripe plus unmatched HubSpot subscription deals.",
  },
  {
    key: "sales.open_pipeline_value",
    label: "Open Pipeline Value",
    domain: "sales-pipeline",
    ownerAudience: "BOARD",
    unit: "currency",
    calculationVersion: CALCULATION_VERSION,
    sourceDependencies: ["hubspot"],
    freshnessSlaHours: 6,
    boardEligible: true,
    weeklyEligible: true,
    description: "Total value of open sales pipeline.",
  },
  {
    key: "retention.at_risk_accounts",
    label: "At-Risk Accounts",
    domain: "retention",
    ownerAudience: "CEO",
    unit: "count",
    calculationVersion: CALCULATION_VERSION,
    sourceDependencies: ["retention"],
    freshnessSlaHours: 24,
    boardEligible: true,
    weeklyEligible: true,
    description: "Current accounts classified as retention risk.",
  },
  {
    key: "customer_success.support_load",
    label: "Support Load",
    domain: "customer-success",
    ownerAudience: "TEAM",
    unit: "count",
    calculationVersion: CALCULATION_VERSION,
    sourceDependencies: ["pylon"],
    freshnessSlaHours: 6,
    boardEligible: true,
    weeklyEligible: true,
    description: "Open customer-support workload from customer-success systems.",
  },
  {
    key: "website.sessions",
    label: "Website Sessions",
    domain: "website-traffic",
    ownerAudience: "CEO",
    unit: "count",
    calculationVersion: CALCULATION_VERSION,
    sourceDependencies: ["googleAnalytics", "webflow"],
    freshnessSlaHours: 24,
    boardEligible: true,
    weeklyEligible: true,
    description: "Top-of-funnel website traffic from analytics and site systems.",
  },
  {
    key: "social.paid_spend",
    label: "Paid Media Spend",
    domain: "social-media",
    ownerAudience: "CEO",
    unit: "currency",
    calculationVersion: CALCULATION_VERSION,
    sourceDependencies: ["googleAds", "metaAds"],
    optionalSourceDependencies: ["redditAds"],
    freshnessSlaHours: 24,
    boardEligible: true,
    weeklyEligible: true,
    description: "Paid acquisition spend across connected ad platforms.",
  },
];

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function hoursBetween(fromIso: string | null, to: Date): number | null {
  if (!fromIso) return null;
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return null;
  return Math.max(0, (to.getTime() - from.getTime()) / (60 * 60 * 1000));
}

function sourceKeyForPrimary(primaryId: AnalyticsPrimarySectionId): string[] {
  const boardGradeSources: Partial<Record<AnalyticsPrimarySectionId, string[]>> = {
    "website-traffic": ["googleAnalytics", "webflow"],
    "social-media": ["googleAds", "metaAds"],
    finance: ["mercury", "stripe", "hubspot"],
    "sales-pipeline": ["hubspot"],
    retention: ["retention"],
    "customer-success": ["pylon", "googleWorkspace", "slack"],
    "customer-journey": ["customerJourney"],
    "demo-analytics": ["demoAnalytics"],
    "process-analytics": ["processAnalytics"],
  };
  if (boardGradeSources[primaryId]) {
    return boardGradeSources[primaryId];
  }

  const keys = ANALYTICS_SUB_SECTIONS.filter((section) => section.parentId === primaryId).map(
    (section) => section.dataDomain
  );
  return Array.from(new Set(keys.length > 0 ? keys : [primaryId]));
}

function optionalSourceKeyForPrimary(primaryId: AnalyticsPrimarySectionId): string[] {
  if (primaryId === "social-media") return ["redditAds"];
  return [];
}

function sourceKeysForSubSection(section: AnalyticsSubSection): string[] {
  const financeDerivedSources: Partial<Record<AnalyticsSubSection["dataDomain"], string[]>> = {
    financePlanning: ["stripe", "mercury", "hubspot"],
    financeForecast: ["stripe", "mercury"],
    financePnl: ["stripe", "mercury"],
    financeUnitEconomics: ["stripe", "mercury", "hubspot"],
    financeMonthlyHistory: ["stripe", "mercury", "hubspot"],
    financeAiBrief: ["stripe", "mercury", "hubspot"],
  };

  return financeDerivedSources[section.dataDomain] ?? [section.dataDomain];
}

export function getDefaultCeoMetricDefinitions(): CeoMetricDefinition[] {
  const domainDefinitions = ANALYTICS_PRIMARY_SECTIONS.map((section) => {
    const optionalSourceDependencies = optionalSourceKeyForPrimary(section.id);
    return {
      key: `domain.${section.id}.health`,
      label: `${section.label} Health`,
      domain: section.id,
      ownerAudience: "CEO" as const,
      unit: "score" as const,
      calculationVersion: CALCULATION_VERSION,
      sourceDependencies: sourceKeyForPrimary(section.id),
      ...(optionalSourceDependencies.length > 0 ? { optionalSourceDependencies } : {}),
      freshnessSlaHours: section.id === "process-analytics" ? 1 : 24,
      boardEligible: true,
      weeklyEligible: true,
      description: `Trust-weighted health metric for ${section.description.toLowerCase()}`,
    };
  });

  const subSectionDefinitions = ANALYTICS_SUB_SECTIONS.map((section) => ({
    key: `source.${section.id}.health`,
    label: `${section.label} Source Health`,
    domain: section.parentId,
    ownerAudience: "CEO" as const,
    unit: "score" as const,
    calculationVersion: CALCULATION_VERSION,
    sourceDependencies: sourceKeysForSubSection(section),
    freshnessSlaHours: section.parentId === "process-analytics" ? 1 : 24,
    boardEligible: false,
    weeklyEligible: false,
    description: `Trust state for the ${section.label} source used by CEO reports.`,
  }));

  return [...CORE_METRICS, ...domainDefinitions, ...subSectionDefinitions].sort((a, b) =>
    a.key.localeCompare(b.key)
  );
}

export function getDefaultBoardGradeMetricKeys(
  definitions = getDefaultCeoMetricDefinitions()
): Set<string> {
  return new Set(
    definitions
      .filter((definition) => BOARD_GRADE_CORE_KEYS.has(definition.key) || definition.key.startsWith("domain."))
      .map((definition) => definition.key)
  );
}

export function evaluateMetricTrust(input: {
  asOf: Date;
  freshnessSlaHours: number;
  requiredSourceKeys: string[];
  optionalSourceKeys?: string[];
  sources: CeoSourceSample[];
}): CeoMetricTrust {
  const required = Array.from(new Set(input.requiredSourceKeys));
  const optional = Array.from(new Set(input.optionalSourceKeys ?? [])).filter(
    (key) => !required.includes(key)
  );
  const warnings: string[] = [];
  const sourceStates: CeoMetricSourceState[] = [];

  for (const key of [...required, ...optional]) {
    const candidates = input.sources
      .filter((source) => source.sourceKey === key)
      .sort((a, b) => {
        const aTime = toIso(a.capturedAt) ? new Date(toIso(a.capturedAt)!).getTime() : 0;
        const bTime = toIso(b.capturedAt) ? new Date(toIso(b.capturedAt)!).getTime() : 0;
        return bTime - aTime;
      });
    const latest = candidates[0] ?? null;
    const capturedAt = toIso(latest?.capturedAt);
    const expiresAt = toIso(latest?.expiresAt);
    const ageHours = hoursBetween(capturedAt, input.asOf);
    const fresh =
      latest?.status === "SUCCESS" &&
      ageHours !== null &&
      ageHours <= input.freshnessSlaHours &&
      (!expiresAt || new Date(expiresAt).getTime() >= input.asOf.getTime());

    sourceStates.push({
      sourceKey: key,
      sourceId: latest?.sourceId ?? null,
      status: latest?.status ?? "MISSING",
      capturedAt,
      expiresAt,
      ageHours,
      fresh,
      lastError: latest?.lastError ?? null,
    });
  }

  const requiredStates = sourceStates.filter((state) => required.includes(state.sourceKey));
  const optionalStates = sourceStates.filter((state) => optional.includes(state.sourceKey));
  const missing = requiredStates.filter((state) => state.status === "MISSING");
  const errored = requiredStates.filter((state) => state.status === "ERROR");
  const partial = requiredStates.filter((state) => state.status === "PARTIAL");
  const successful = requiredStates.filter((state) => state.status === "SUCCESS");
  const stale = successful.filter((state) => !state.fresh);
  const optionalMissing = optionalStates.filter((state) => state.status === "MISSING");
  const optionalErrored = optionalStates.filter((state) => state.status === "ERROR");
  const optionalPartial = optionalStates.filter((state) => state.status === "PARTIAL");
  const optionalStale = optionalStates.filter((state) => state.status === "SUCCESS" && !state.fresh);

  for (const state of missing) {
    warnings.push(`Required source ${state.sourceKey} is missing.`);
  }
  for (const state of errored) {
    warnings.push(
      `Required source ${state.sourceKey} errored${state.lastError ? `: ${state.lastError}` : "."}`
    );
  }
  for (const state of partial) {
    warnings.push(`Required source ${state.sourceKey} is partial.`);
  }
  for (const state of stale) {
    warnings.push(`Required source ${state.sourceKey} is stale.`);
  }
  for (const state of optionalMissing) {
    warnings.push(`Optional source ${state.sourceKey} is missing.`);
  }
  for (const state of optionalErrored) {
    warnings.push(
      `Optional source ${state.sourceKey} errored${state.lastError ? `: ${state.lastError}` : "."}`
    );
  }
  for (const state of optionalPartial) {
    warnings.push(`Optional source ${state.sourceKey} is partial.`);
  }
  for (const state of optionalStale) {
    warnings.push(`Optional source ${state.sourceKey} is stale.`);
  }

  let status: CeoMetricTrustStatus = "fresh";
  if (successful.length === 0 && errored.length > 0) {
    status = "error";
  } else if (successful.length === 0) {
    status = "missing";
  } else if (missing.length > 0 || errored.length > 0 || partial.length > 0) {
    status = "partial";
  } else if (stale.length > 0) {
    status = "stale";
  }

  const confidenceByStatus: Record<CeoMetricTrustStatus, number> = {
    fresh: 1,
    stale: 0.7,
    partial: 0.55,
    missing: 0,
    error: 0,
    conflicted: 0.35,
  };

  return {
    status,
    confidence: confidenceByStatus[status],
    warnings,
    sourceStates,
  };
}

export function buildDefaultCeoReportPacks(definitions = getDefaultCeoMetricDefinitions()): CeoReportPack[] {
  const available = new Set(definitions.map((definition) => definition.key));
  const boardGradeKeys = getDefaultBoardGradeMetricKeys(definitions);
  const pick = (keys: string[]) => keys.filter((key) => available.has(key));

  const weeklyKeys = pick([
    "ceo.flow_reliability_score",
    "ceo.throughput_30d",
    "ceo.overdue_open_tasks",
    "sales.open_pipeline_value",
    "finance.cash_balance",
    "finance.mrr",
    "retention.at_risk_accounts",
    "domain.social-media.health",
    "domain.website-traffic.health",
  ]);
  const boardKeys = pick([
    "finance.cash_balance",
    "finance.mrr",
    "sales.open_pipeline_value",
    "retention.at_risk_accounts",
    "ceo.flow_reliability_score",
    "domain.customer-journey.health",
    "domain.demo-analytics.health",
    "domain.customer-success.health",
  ]);
  const investorKeys = pick([
    "finance.mrr",
    "sales.open_pipeline_value",
    "website.sessions",
    "social.paid_spend",
    "ceo.throughput_30d",
    "domain.retention.health",
  ]);
  const customKeys = definitions
    .filter((definition) => definition.boardEligible && boardGradeKeys.has(definition.key))
    .map((definition) => definition.key);

  return [
    {
      slug: "weekly-exec",
      name: "Weekly Exec",
      description: "Recurring weekly operating review for the CEO and leadership team.",
      cadence: "weekly",
      audience: "TEAM",
      metricKeys: weeklyKeys,
      sections: [
        { title: "Internal Execution", metricKeys: pick(["ceo.flow_reliability_score", "ceo.throughput_30d", "ceo.overdue_open_tasks"]) },
        { title: "Revenue", metricKeys: pick(["sales.open_pipeline_value", "finance.mrr", "finance.cash_balance"]) },
        { title: "Growth and Retention", metricKeys: pick(["retention.at_risk_accounts", "domain.social-media.health", "domain.website-traffic.health"]) },
      ],
    },
    {
      slug: "board-meeting",
      name: "Board Meeting",
      description: "Board-ready monthly or quarterly operating snapshot with metric trust labels.",
      cadence: "quarterly",
      audience: "BOARD",
      metricKeys: boardKeys,
      sections: [
        { title: "Financials", metricKeys: pick(["finance.cash_balance", "finance.mrr"]) },
        { title: "Revenue and Retention", metricKeys: pick(["sales.open_pipeline_value", "retention.at_risk_accounts"]) },
        { title: "Operational Signals", metricKeys: pick(["ceo.flow_reliability_score", "domain.customer-journey.health", "domain.demo-analytics.health", "domain.customer-success.health"]) },
      ],
    },
    {
      slug: "investor-update",
      name: "Investor Update",
      description: "Concise investor update metric pack for recurring stakeholder communication.",
      cadence: "monthly",
      audience: "INVESTOR",
      metricKeys: investorKeys,
      sections: [
        { title: "Traction", metricKeys: pick(["finance.mrr", "sales.open_pipeline_value", "website.sessions"]) },
        { title: "Efficiency", metricKeys: pick(["social.paid_spend", "ceo.throughput_30d", "domain.retention.health"]) },
      ],
    },
    {
      slug: "custom-metric-snapshot",
      name: "Custom Metric Snapshot",
      description: "Ad hoc metric snapshot across all board-eligible CEO metrics.",
      cadence: "ad_hoc",
      audience: "CEO",
      metricKeys: customKeys,
      sections: [{ title: "Selected Metrics", metricKeys: customKeys }],
    },
  ];
}

export function computeCeoReadiness(input: {
  reportPacks: CeoReportPack[];
  metrics: CeoMetricValue[];
  verifiedMetricKeys: Set<string>;
}): CeoReadiness {
  const metricByKey = new Map(input.metrics.map((metric) => [metric.definition.key, metric]));
  const requiredKeys = Array.from(new Set(input.reportPacks.flatMap((pack) => pack.metricKeys)));
  const failingGates: CeoReadinessGate[] = [];

  for (const key of requiredKeys) {
    const metric = metricByKey.get(key);
    const label = metric?.definition.label ?? key;
    if (!metric) {
      failingGates.push({ metricKey: key, label, reason: "Metric is missing from the CEO snapshot." });
      continue;
    }
    if (!input.verifiedMetricKeys.has(key)) {
      failingGates.push({ metricKey: key, label, reason: "Metric calculator has not been verified for board use." });
    }
    if (metric.value === null || metric.value === undefined || metric.value === "") {
      failingGates.push({ metricKey: key, label, reason: "Metric value is unavailable." });
    }
    if (metric.trust.status !== "fresh") {
      failingGates.push({ metricKey: key, label, reason: `Metric source trust is ${metric.trust.status}.` });
    }
    if (metric.lineage.length === 0) {
      failingGates.push({ metricKey: key, label, reason: "Metric has no source lineage citation." });
    }
  }

  if (failingGates.length === 0) {
    return {
      status: "board_ready",
      ready: true,
      summary: "Board-ready: all required metrics have verified calculators, fresh sources, values, and lineage.",
      failingGates,
    };
  }

  return {
    status: "not_board_final",
    ready: false,
    summary: `Not board-final: ${failingGates.length} readiness gate${failingGates.length === 1 ? " is" : "s are"} failing.`,
    failingGates,
  };
}

function formatValue(value: number | string | null): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function formatMetricDetails(metric: CeoMetricValue): string {
  if (!metric.details || metric.details.length === 0) return "";
  return metric.details
    .map((detail) => `${detail.label}: ${formatValue(detail.value)}`)
    .join("; ");
}

function csvCell(value: number | string | null): string {
  const raw = formatValue(value);
  if (!/[",\n]/.test(raw)) return raw;
  return `"${raw.replaceAll('"', '""')}"`;
}

function buildDeterministicNotes(metrics: CeoMetricValue[]): string[] {
  const notes: string[] = [];
  const weakMetrics = metrics.filter((metric) => metric.trust.status !== "fresh");
  if (weakMetrics.length > 0) {
    notes.push(`${weakMetrics.length} metric(s) are stale, partial, missing, errored, or conflicted.`);
  }

  for (const metric of metrics) {
    if (typeof metric.delta !== "number" || metric.delta === 0) continue;
    const direction = metric.delta > 0 ? "increased" : "decreased";
    notes.push(`${metric.definition.label} ${direction} by ${Math.abs(metric.delta)} versus the prior period.`);
  }

  if (notes.length === 0) {
    notes.push("No material metric variances were detected.");
  }
  return notes;
}

export function buildMetricReportRun(input: {
  pack: CeoReportPack;
  metrics: CeoMetricValue[];
  generatedAt?: string;
  readiness?: CeoReadiness;
}): CeoReportRun {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const metricByKey = new Map(input.metrics.map((metric) => [metric.definition.key, metric]));
  const orderedMetrics = input.pack.metricKeys
    .map((key) => metricByKey.get(key))
    .filter((metric): metric is CeoMetricValue => Boolean(metric));
  const deterministicNotes = buildDeterministicNotes(orderedMetrics);
  const readiness = input.readiness ?? {
    status: "board_ready" as const,
    ready: true,
    summary: "Board-ready: readiness was not constrained by an external gate.",
    failingGates: [],
  };

  const markdownLines = [
    `# ${input.pack.name}`,
    "",
    `Generated: ${generatedAt}`,
    "",
    "## Board Readiness",
    readiness.summary,
    ...(readiness.failingGates.length > 0
      ? ["", ...readiness.failingGates.map((gate) => `- ${gate.label}: ${gate.reason}`)]
      : []),
    "",
    "| Metric | Value | Prior | Delta | Trust | As Of | Sources | Details |",
    "| --- | ---: | ---: | ---: | --- | --- | --- | --- |",
    ...orderedMetrics.map((metric) =>
      [
        metric.definition.label,
        formatValue(metric.value),
        formatValue(metric.priorValue),
        formatValue(metric.delta),
        metric.trust.status,
        metric.asOf,
        metric.lineage.map((lineage) => lineage.sourceKey).join("; "),
        formatMetricDetails(metric),
      ]
        .map((value) => String(value).replaceAll("|", "\\|"))
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |")
    ),
    "",
    "## Deterministic Notes",
    ...deterministicNotes.map((note) => `- ${note}`),
  ];

  const csvRows = [
    ["Readiness Status", readiness.status],
    ["Readiness Summary", readiness.summary],
    ...readiness.failingGates.map((gate) => [
      "Readiness Gate",
      `${gate.metricKey}: ${gate.reason}`,
    ]),
    [],
    ["Metric", "Value", "Prior Value", "Delta", "Trust", "As Of", "Sources", "Details"],
    ...orderedMetrics.map((metric) => [
      metric.definition.label,
      formatValue(metric.value),
      formatValue(metric.priorValue),
      formatValue(metric.delta),
      metric.trust.status,
      metric.asOf,
      metric.lineage.map((lineage) => lineage.sourceKey).join("; "),
      formatMetricDetails(metric),
    ]),
  ];

  const sections = input.pack.sections.map((section) => ({
    title: section.title,
    metrics: section.metricKeys
      .map((key) => metricByKey.get(key))
      .filter((metric): metric is CeoMetricValue => Boolean(metric))
      .map((metric) => ({
        key: metric.definition.key,
        label: metric.definition.label,
        value: metric.value,
        priorValue: metric.priorValue,
        delta: metric.delta,
        unit: metric.definition.unit,
        trust: metric.trust.status,
        asOf: metric.asOf,
        warnings: metric.trust.warnings,
        details: metric.details,
      })),
  }));

  return {
    packSlug: input.pack.slug,
    packName: input.pack.name,
    generatedAt,
    metrics: orderedMetrics,
    deterministicNotes,
    markdown: markdownLines.join("\n"),
    csv: csvRows.map((row) => row.map(csvCell).join(",")).join("\n"),
    slideJson: {
      title: input.pack.name,
      generatedAt,
      readiness,
      sections,
      notes: deterministicNotes,
    },
  };
}
