import { AnalyticsSnapshotStatus, Prisma, RetentionTenantStatus } from "@/generated/prisma/client";
import { computeDecisionDashboard } from "@/lib/analytics/decision-dashboard";
import { buildSubscriptionMrrBreakdown } from "@/lib/analytics/subscription-mrr";
import { prisma } from "@/lib/prisma";
import {
  buildDefaultCeoReportPacks,
  buildMetricReportRun,
  computeCeoReadiness,
  evaluateMetricTrust,
  getDefaultCeoMetricDefinitions,
  getDefaultBoardGradeMetricKeys,
  type CeoMetricDefinition,
  type CeoReadiness,
  type CeoMetricTrustStatus,
  type CeoMetricValue,
  type CeoReportPack,
  type CeoReportRun,
  type CeoSourceSample,
} from "@/lib/ceo/metric-trust";

export interface CeoMetricSnapshotPayload {
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  definitions: CeoMetricDefinition[];
  metrics: CeoMetricValue[];
  reportPacks: CeoReportPack[];
  trustSummary: Record<CeoMetricTrustStatus, number>;
  readiness: CeoReadiness;
}

export interface CreateCeoReportRunResult extends CeoReportRun {
  id: string | null;
}

const TRUST_SUMMARY_KEYS: CeoMetricTrustStatus[] = [
  "fresh",
  "stale",
  "partial",
  "missing",
  "error",
  "conflicted",
];

type AnalyticsSnapshotSample = {
  id: string;
  providerKey: string;
  status: AnalyticsSnapshotStatus;
  capturedAt: Date;
  expiresAt: Date;
  lastError: string | null;
  payload: Prisma.JsonValue | null;
};

type MetricCalculatorInput = {
  definition: CeoMetricDefinition;
  decisionDashboard: Awaited<ReturnType<typeof computeDecisionDashboard>>;
  latestSnapshots: Map<string, AnalyticsSnapshotSample>;
  retentionMetric: RetentionMetricSource;
  sourceSamples: CeoSourceSample[];
  asOf: Date;
};

type MetricCalculation = {
  value: number | string | null;
  priorValue: number | string | null;
  delta: number | null;
  details?: CeoMetricValue["details"];
};

type CeoMetricCalculator = (input: MetricCalculatorInput) => MetricCalculation;

type RetentionMetricSource = {
  atRiskAccounts: number | null;
  source: CeoSourceSample;
};

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  if (value === null || value === undefined) return Prisma.JsonNull as unknown as Prisma.InputJsonValue;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function metricUnitToDb(unit: CeoMetricDefinition["unit"]) {
  return unit.toUpperCase() as Uppercase<CeoMetricDefinition["unit"]>;
}

function metricTrustToDb(status: CeoMetricTrustStatus) {
  return status.toUpperCase() as Uppercase<CeoMetricTrustStatus>;
}

function audienceToDb(audience: CeoMetricDefinition["ownerAudience"] | CeoReportPack["audience"]) {
  return audience;
}

function sourceSampleFromSnapshot(snapshot: AnalyticsSnapshotSample): CeoSourceSample {
  return {
    sourceKey: snapshot.providerKey,
    sourceId: snapshot.id,
    status: snapshot.status === AnalyticsSnapshotStatus.SUCCESS ? "SUCCESS" : "ERROR",
    capturedAt: snapshot.capturedAt,
    expiresAt: snapshot.expiresAt,
    lastError: snapshot.lastError,
  };
}

function latestSnapshotByProvider(snapshots: AnalyticsSnapshotSample[]): Map<string, AnalyticsSnapshotSample> {
  const latest = new Map<string, AnalyticsSnapshotSample>();
  for (const snapshot of snapshots) {
    const existing = latest.get(snapshot.providerKey);
    if (!existing || snapshot.capturedAt > existing.capturedAt) {
      latest.set(snapshot.providerKey, snapshot);
    }
  }
  return latest;
}

function decisionDashboardSourceSample(
  dashboard: Awaited<ReturnType<typeof computeDecisionDashboard>>
): CeoSourceSample {
  const capturedAt = new Date(dashboard.asOf);
  return {
    sourceKey: "wipguard",
    sourceId: "decision-dashboard",
    status: "SUCCESS",
    capturedAt,
    expiresAt: new Date(capturedAt.getTime() + 60 * 60 * 1000),
  };
}

function getPathNumber(payload: unknown, path: string[]): number | null {
  let current = payload;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "number" && Number.isFinite(current) ? current : null;
}

function getFirstNumber(payload: unknown, paths: string[][]): number | null {
  for (const path of paths) {
    const value = getPathNumber(payload, path);
    if (value !== null) return value;
  }
  return null;
}

function getPathArray(payload: unknown, path: string[]): unknown[] {
  let current = payload;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return [];
    current = (current as Record<string, unknown>)[key];
  }
  return Array.isArray(current) ? current : [];
}

function sumArrayNumber(payload: unknown, path: string[], key: string): number | null {
  const values = getPathArray(payload, path)
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const value = (item as Record<string, unknown>)[key];
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    })
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function cashBreakdownFromMercury(payload: unknown): {
  bankCash: number | null;
  treasuryCash: number | null;
  totalCash: number | null;
} {
  const bankCashFromPayload = getFirstNumber(payload, [["cashFlow", "bankCash"], ["bankCash"]]);
  const treasuryCashFromPayload = getFirstNumber(payload, [["cashFlow", "treasuryCash"], ["treasuryCash"]]);
  const totalCashFromPayload = getFirstNumber(payload, [
    ["cashFlow", "totalCash"],
    ["cashFlow", "totalBalance"],
    ["totalCash"],
    ["totalBalance"],
    ["cashBalance"],
  ]);
  const accounts = getPathArray(payload, ["accounts"]);
  const accountTotals = accounts.reduce<{
    bankCash: number;
    treasuryCash: number;
    hasAccounts: boolean;
  }>(
    (totals, account) => {
      if (!account || typeof account !== "object" || Array.isArray(account)) return totals;
      const record = account as Record<string, unknown>;
      const balance = record.balance;
      if (typeof balance !== "number" || !Number.isFinite(balance)) return totals;
      const type = typeof record.type === "string" ? record.type.toLowerCase() : "";
      if (type === "treasury") totals.treasuryCash += balance;
      else totals.bankCash += balance;
      totals.hasAccounts = true;
      return totals;
    },
    { bankCash: 0, treasuryCash: 0, hasAccounts: false }
  );
  const bankCash = bankCashFromPayload ?? (accountTotals.hasAccounts ? accountTotals.bankCash : null);
  const treasuryCash =
    treasuryCashFromPayload ?? (accountTotals.hasAccounts ? accountTotals.treasuryCash : null);
  const totalCash = totalCashFromPayload ?? (
    bankCash !== null || treasuryCash !== null ? (bankCash ?? 0) + (treasuryCash ?? 0) : null
  );

  return { bankCash, treasuryCash, totalCash };
}

function derivedSourceSample(input: {
  sourceKey: string;
  sourceId: string;
  asOf: Date;
  freshnessSlaHours: number;
  requiredSourceKeys: string[];
  sources: CeoSourceSample[];
}): CeoSourceSample {
  const trust = evaluateMetricTrust({
    asOf: input.asOf,
    freshnessSlaHours: input.freshnessSlaHours,
    requiredSourceKeys: input.requiredSourceKeys,
    sources: input.sources,
  });
  const citedStates = trust.sourceStates.filter((state) => state.sourceId || state.capturedAt);
  if (trust.status !== "fresh") {
    const capturedAt = citedStates
      .map((state) => state.capturedAt)
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value))
      .reduce<Date | null>(
        (latest, date) => (!latest || date.getTime() > latest.getTime() ? date : latest),
        null
      );
    return {
      sourceKey: input.sourceKey,
      sourceId: citedStates.length > 0 ? input.sourceId : null,
      status: citedStates.length > 0 ? "PARTIAL" : "MISSING",
      capturedAt,
      expiresAt: null,
      lastError: trust.warnings.join(" "),
    };
  }

  const capturedAt = citedStates
    .map((state) => state.capturedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .reduce<Date | null>(
      (latest, date) => (!latest || date.getTime() > latest.getTime() ? date : latest),
      null
    );
  const expiresAt = citedStates
    .map((state) => state.expiresAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .reduce<Date | null>(
      (earliest, date) => (!earliest || date.getTime() < earliest.getTime() ? date : earliest),
      null
    );

  return {
    sourceKey: input.sourceKey,
    sourceId: input.sourceId,
    status: "SUCCESS",
    capturedAt: capturedAt ?? input.asOf,
    expiresAt: expiresAt ?? new Date(input.asOf.getTime() + input.freshnessSlaHours * 60 * 60 * 1000),
  };
}

const CEO_METRIC_CALCULATORS: Record<string, CeoMetricCalculator> = {
  "ceo.flow_reliability_score": ({ decisionDashboard }) => ({
    value: decisionDashboard.northStar.flowReliabilityScore,
    priorValue: null,
    delta: null,
  }),
  "ceo.throughput_30d": ({ decisionDashboard }) => ({
    value: decisionDashboard.northStar.throughput30d,
    priorValue: null,
    delta: decisionDashboard.northStar.throughputTrendPct,
  }),
  "ceo.overdue_open_tasks": ({ decisionDashboard }) => ({
    value: decisionDashboard.supportingMetrics.overdueOpenTasks,
    priorValue: null,
    delta: null,
  }),
  "finance.cash_balance": ({ latestSnapshots }) => {
    const mercury = latestSnapshots.get("mercury")?.payload;
    const cash = cashBreakdownFromMercury(mercury);
    return {
      value: cash.totalCash,
      priorValue: null,
      delta: null,
      details: [
        { key: "bankCash", label: "Bank cash", value: cash.bankCash, unit: "currency" },
        { key: "treasuryCash", label: "Treasury cash", value: cash.treasuryCash, unit: "currency" },
        { key: "totalCash", label: "Total cash", value: cash.totalCash, unit: "currency" },
      ],
    };
  },
  "finance.mrr": ({ latestSnapshots }) => {
    const stripe = latestSnapshots.get("stripe")?.payload;
    const hubspot = latestSnapshots.get("hubspot")?.payload;
    const breakdown = buildSubscriptionMrrBreakdown({ stripe, hubspot });
    return {
      value: breakdown.totalMrr,
      priorValue: null,
      delta: breakdown.stripeMrrChange,
      details: [
        { key: "stripeMrr", label: "Stripe MRR", value: breakdown.stripeMrr, unit: "currency" },
        {
          key: "hubspotOnlySubscriptionMrr",
          label: "HubSpot-only subscription MRR",
          value: breakdown.hubspotOnlySubscriptionMrr,
          unit: "currency",
        },
        {
          key: "excludedLinkedHubspotSubscriptionMrr",
          label: "Linked HubSpot subscription MRR excluded",
          value: breakdown.excludedLinkedHubspotSubscriptionMrr,
          unit: "currency",
        },
        { key: "totalMrr", label: "Total MRR", value: breakdown.totalMrr, unit: "currency" },
      ],
    };
  },
  "sales.open_pipeline_value": ({ latestSnapshots }) => {
    const hubspot = latestSnapshots.get("hubspot")?.payload;
    const scoreboardPipeline = sumArrayNumber(hubspot, ["repScoreboard"], "totalPipeline");
    return {
      value:
        scoreboardPipeline ??
        getFirstNumber(hubspot, [
          ["pipeline", "totalValue"],
          ["totalPipelineValue"],
          ["totalValue"],
        ]),
      priorValue: null,
      delta: null,
    };
  },
  "retention.at_risk_accounts": ({ retentionMetric }) => ({
    value: retentionMetric.atRiskAccounts,
    priorValue: null,
    delta: null,
  }),
  "customer_success.support_load": ({ latestSnapshots }) => {
    const pylon = latestSnapshots.get("pylon")?.payload;
    return {
      value: getFirstNumber(pylon, [["openIssues"], ["openConversations"], ["summary", "openIssues"]]),
      priorValue: null,
      delta: null,
    };
  },
  "website.sessions": ({ latestSnapshots }) => {
    const googleAnalytics = latestSnapshots.get("googleAnalytics")?.payload;
    return {
      value: getFirstNumber(googleAnalytics, [
        ["sessions30d"],
        ["overview", "sessions"],
        ["sessions"],
        ["traffic", "sessions"],
      ]),
      priorValue: null,
      delta: null,
    };
  },
  "social.paid_spend": ({ latestSnapshots }) => {
    const spend = ["googleAds", "metaAds", "redditAds"].reduce((sum, key) => {
      const value = getFirstNumber(latestSnapshots.get(key)?.payload, [
        ["totalSpend30d"],
        ["spend"],
        ["cost"],
        ["summary", "spend"],
      ]);
      return sum + (value ?? 0);
    }, 0);
    return { value: spend > 0 ? spend : null, priorValue: null, delta: null };
  },
};

function healthScoreForDefinition(input: MetricCalculatorInput): MetricCalculation {
  const trust = evaluateMetricTrust({
    asOf: input.asOf,
    freshnessSlaHours: input.definition.freshnessSlaHours,
    requiredSourceKeys: input.definition.sourceDependencies,
    sources: input.sourceSamples,
  });
  const scoreByStatus: Record<CeoMetricTrustStatus, number> = {
    fresh: 100,
    stale: 70,
    partial: 55,
    conflicted: 35,
    missing: 0,
    error: 0,
  };
  return { value: scoreByStatus[trust.status], priorValue: null, delta: null };
}

async function loadRetentionMetricSource(input: {
  organizationId: string | null;
  asOf: Date;
}): Promise<RetentionMetricSource> {
  if (!input.organizationId) {
    return {
      atRiskAccounts: null,
      source: { sourceKey: "retention", sourceId: null, status: "MISSING" },
    };
  }

  const [atRiskAccounts, latest] = await Promise.all([
    prisma.retentionTenantCurrent.count({
      where: {
        organizationId: input.organizationId,
        status: RetentionTenantStatus.AT_RISK,
      },
    }),
    prisma.retentionTenantCurrent.findFirst({
      where: { organizationId: input.organizationId },
      orderBy: [{ lastMaterializedAt: "desc" }, { updatedAt: "desc" }],
      select: { id: true, lastMaterializedAt: true, updatedAt: true },
    }),
  ]);

  if (!latest) {
    return {
      atRiskAccounts: null,
      source: { sourceKey: "retention", sourceId: null, status: "MISSING" },
    };
  }

  const capturedAt = latest.lastMaterializedAt ?? latest.updatedAt ?? input.asOf;
  return {
    atRiskAccounts,
    source: {
      sourceKey: "retention",
      sourceId: latest.id,
      status: "SUCCESS",
      capturedAt,
      expiresAt: new Date(capturedAt.getTime() + 24 * 60 * 60 * 1000),
    },
  };
}

function valueForDefinition(input: MetricCalculatorInput): MetricCalculation {
  const calculator = CEO_METRIC_CALCULATORS[input.definition.key];
  if (calculator) return calculator(input);
  if (input.definition.key.startsWith("domain.") || input.definition.key.startsWith("source.")) {
    return healthScoreForDefinition(input);
  }
  return { value: null, priorValue: null, delta: null };
}

function verifiedMetricKeysForDefinitions(definitions: CeoMetricDefinition[]): Set<string> {
  const boardGradeKeys = getDefaultBoardGradeMetricKeys(definitions);
  return new Set(
    definitions
      .filter((definition) => definition.key in CEO_METRIC_CALCULATORS || definition.key.startsWith("domain."))
      .map((definition) => definition.key)
      .filter((key) => boardGradeKeys.has(key))
  );
}

async function loadLatestAnalyticsSnapshots(input: {
  userId: string;
  sourceKeys: string[];
}): Promise<AnalyticsSnapshotSample[]> {
  return prisma.analyticsSnapshot.findMany({
    where: {
      userId: input.userId,
      providerKey: { in: Array.from(new Set(input.sourceKeys)) },
    },
    orderBy: [{ capturedAt: "desc" }],
    select: {
      id: true,
      providerKey: true,
      status: true,
      capturedAt: true,
      expiresAt: true,
      lastError: true,
      payload: true,
    },
  });
}

async function upsertMetricDefinitions(definitions: CeoMetricDefinition[]): Promise<Map<string, string>> {
  const entries = await Promise.all(
    definitions.map((definition) =>
      prisma.ceoMetricDefinition.upsert({
        where: { key: definition.key },
        create: {
          key: definition.key,
          label: definition.label,
          domain: definition.domain,
          ownerAudience: audienceToDb(definition.ownerAudience),
          unit: metricUnitToDb(definition.unit),
          calculationVersion: definition.calculationVersion,
          sourceDependencies: definition.sourceDependencies,
          freshnessSlaHours: definition.freshnessSlaHours,
          boardEligible: definition.boardEligible,
          weeklyEligible: definition.weeklyEligible,
          description: definition.description,
        },
        update: {
          label: definition.label,
          domain: definition.domain,
          ownerAudience: audienceToDb(definition.ownerAudience),
          unit: metricUnitToDb(definition.unit),
          calculationVersion: definition.calculationVersion,
          sourceDependencies: definition.sourceDependencies,
          freshnessSlaHours: definition.freshnessSlaHours,
          boardEligible: definition.boardEligible,
          weeklyEligible: definition.weeklyEligible,
          description: definition.description,
        },
        select: { id: true, key: true },
      })
    )
  );

  return new Map(entries.map((entry) => [entry.key, entry.id]));
}

async function persistMetricSnapshots(input: {
  metrics: CeoMetricValue[];
  definitionIds: Map<string, string>;
  userId: string;
  organizationId: string | null;
}): Promise<void> {
  for (const metric of input.metrics) {
    const valueSnapshot = await prisma.ceoMetricValueSnapshot.create({
      data: {
        metricKey: metric.definition.key,
        definitionId: input.definitionIds.get(metric.definition.key) ?? null,
        userId: input.userId,
        organizationId: input.organizationId,
        periodStart: new Date(metric.periodStart),
        periodEnd: new Date(metric.periodEnd),
        value: toPrismaJson(metric.value),
        priorValue: toPrismaJson(metric.priorValue),
        delta: metric.delta,
        asOf: new Date(metric.asOf),
        computedAt: new Date(metric.computedAt),
        trustStatus: metricTrustToDb(metric.trust.status),
        confidence: metric.trust.confidence,
        warnings: metric.trust.warnings,
        sourceState: toPrismaJson(metric.trust.sourceStates),
      },
      select: { id: true },
    });

    if (metric.lineage.length > 0) {
      await prisma.ceoMetricSourceLineage.createMany({
        data: metric.lineage.map((lineage) => ({
          valueSnapshotId: valueSnapshot.id,
          sourceKey: lineage.sourceKey,
          sourceType: "analytics_snapshot",
          sourceId: lineage.sourceId,
          capturedAt: lineage.capturedAt ? new Date(lineage.capturedAt) : null,
          metadata: Prisma.JsonNull,
        })),
      });
    }
  }
}

export async function loadCeoMetricSnapshot(input: {
  userId: string;
  organizationId?: string | null;
  persist?: boolean;
}): Promise<CeoMetricSnapshotPayload> {
  const definitions = getDefaultCeoMetricDefinitions();
  const sourceKeys = definitions.flatMap((definition) => definition.sourceDependencies);
  const [decisionDashboard, snapshots] = await Promise.all([
    computeDecisionDashboard(),
    loadLatestAnalyticsSnapshots({ userId: input.userId, sourceKeys }),
  ]);
  const latestSnapshots = latestSnapshotByProvider(snapshots);
  const asOf = new Date(decisionDashboard.asOf);
  const snapshotSourceSamples = snapshots.map(sourceSampleFromSnapshot);
  const retentionMetric = await loadRetentionMetricSource({
    organizationId: input.organizationId ?? null,
    asOf,
  });
  const sourceSamples = [
    decisionDashboardSourceSample(decisionDashboard),
    ...snapshotSourceSamples,
    derivedSourceSample({
      sourceKey: "customerJourney",
      sourceId: "derived:customerJourney",
      asOf,
      freshnessSlaHours: 24,
      requiredSourceKeys: ["hubspot"],
      sources: snapshotSourceSamples,
    }),
    derivedSourceSample({
      sourceKey: "demoAnalytics",
      sourceId: "derived:demoAnalytics",
      asOf,
      freshnessSlaHours: 24,
      requiredSourceKeys: ["hubspot"],
      sources: snapshotSourceSamples,
    }),
    derivedSourceSample({
      sourceKey: "processAnalytics",
      sourceId: "derived:processAnalytics",
      asOf,
      freshnessSlaHours: 1,
      requiredSourceKeys: ["hubspot"],
      sources: snapshotSourceSamples,
    }),
    retentionMetric.source,
  ];
  const computedAt = new Date().toISOString();
  const periodEnd = asOf.toISOString();
  const periodStart = new Date(asOf.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const reportPacks = buildDefaultCeoReportPacks(definitions);

  const metrics: CeoMetricValue[] = definitions.map((definition) => {
    const trust = evaluateMetricTrust({
      asOf,
      freshnessSlaHours: definition.freshnessSlaHours,
      requiredSourceKeys: definition.sourceDependencies,
      sources: sourceSamples,
    });
    const value = valueForDefinition({
      definition,
      decisionDashboard,
      latestSnapshots,
      retentionMetric,
      sourceSamples,
      asOf,
    });

    return {
      definition,
      value: value.value,
      priorValue: value.priorValue,
      delta: value.delta,
      details: value.details,
      periodStart,
      periodEnd,
      asOf: periodEnd,
      computedAt,
      trust,
      lineage: trust.sourceStates
        .filter((state) => state.sourceId || state.capturedAt)
        .map((state) => ({
          sourceKey: state.sourceKey,
          sourceId: state.sourceId,
          capturedAt: state.capturedAt,
        })),
    };
  });

  const trustSummary = TRUST_SUMMARY_KEYS.reduce(
    (summary, key) => {
      summary[key] = metrics.filter((metric) => metric.trust.status === key).length;
      return summary;
    },
    {} as Record<CeoMetricTrustStatus, number>
  );

  const definitionIds = await upsertMetricDefinitions(definitions);
  if (input.persist) {
    await persistMetricSnapshots({
      metrics,
      definitionIds,
      userId: input.userId,
      organizationId: input.organizationId ?? null,
    });
  }
  const readiness = computeCeoReadiness({
    reportPacks,
    metrics,
    verifiedMetricKeys: verifiedMetricKeysForDefinitions(definitions),
  });

  return {
    generatedAt: computedAt,
    periodStart,
    periodEnd,
    definitions,
    metrics,
    reportPacks,
    trustSummary,
    readiness,
  };
}

export async function listCeoReportPacks(): Promise<CeoReportPack[]> {
  return buildDefaultCeoReportPacks(getDefaultCeoMetricDefinitions());
}

export async function createCeoReportRun(input: {
  userId: string;
  organizationId?: string | null;
  packSlug: string;
}): Promise<CreateCeoReportRunResult> {
  const snapshot = await loadCeoMetricSnapshot({
    userId: input.userId,
    organizationId: input.organizationId,
    persist: true,
  });
  const pack = snapshot.reportPacks.find((candidate) => candidate.slug === input.packSlug);
  if (!pack) {
    throw new Error(`Unknown CEO report pack: ${input.packSlug}`);
  }

  const run = buildMetricReportRun({ pack, metrics: snapshot.metrics, readiness: snapshot.readiness });
  const persisted = await prisma.ceoReportRun.create({
    data: {
      packSlug: run.packSlug,
      packName: run.packName,
      userId: input.userId,
      organizationId: input.organizationId ?? null,
      generatedAt: new Date(run.generatedAt),
      metricPayload: toPrismaJson(run.metrics),
      deterministicNotes: run.deterministicNotes,
      markdown: run.markdown,
      csv: run.csv,
      slideJson: toPrismaJson(run.slideJson),
    },
    select: { id: true },
  });

  return {
    ...run,
    id: persisted.id,
  };
}

export async function getCeoReportRun(input: {
  userId: string;
  organizationId?: string | null;
  runId: string;
}): Promise<CreateCeoReportRunResult | null> {
  const row = await prisma.ceoReportRun.findFirst({
    where: {
      id: input.runId,
      OR: [
        { userId: input.userId },
        ...(input.organizationId ? [{ organizationId: input.organizationId }] : []),
      ],
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    packSlug: row.packSlug,
    packName: row.packName,
    generatedAt: row.generatedAt.toISOString(),
    metrics: row.metricPayload as unknown as CeoMetricValue[],
    deterministicNotes: row.deterministicNotes,
    markdown: row.markdown,
    csv: row.csv,
    slideJson: row.slideJson as unknown as CeoReportRun["slideJson"],
  };
}
