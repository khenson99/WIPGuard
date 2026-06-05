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
}

export interface InvestorHealthyArrGrowthDriver {
  id: string;
  label: string;
  value: number | string | null;
  unit: string | null;
  status: "strong" | "watch" | "missing";
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
        value:
          typeof metric.value === "number" || typeof metric.value === "string" || metric.value === null
            ? metric.value
            : null,
        priorValue:
          typeof metric.priorValue === "number" || typeof metric.priorValue === "string" || metric.priorValue === null
            ? metric.priorValue
            : null,
        delta: asNumber(metric.delta),
        unit: asString(metric.unit),
        trust: asString(metric.trust),
        asOf: asString(metric.asOf),
        warnings: asMetricWarnings(metric.warnings),
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
                  value:
                    typeof metric.value === "number" || typeof metric.value === "string" || metric.value === null
                      ? metric.value
                      : null,
                  priorValue:
                    typeof metric.priorValue === "number" ||
                    typeof metric.priorValue === "string" ||
                    metric.priorValue === null
                      ? metric.priorValue
                      : null,
                  delta: asNumber(metric.delta),
                  unit: asString(metric.unit),
                  trust: asString(metric.trust),
                  asOf: asString(metric.asOf),
                  warnings: asMetricWarnings(metric.warnings),
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

function buildHealthyArrGrowthSnapshot(metrics: InvestorBoardMetric[]): InvestorHealthyArrGrowthSnapshot {
  const mrr = metricNumber(metrics, ["revenue.mrr", "finance.mrr"]);
  const arr = metricNumber(metrics, ["revenue.arr"]) ?? (mrr === null ? null : mrr * 12);
  const arrMetric = metricByKey(metrics, ["revenue.arr"]);
  const mrrMetric = metricByKey(metrics, ["revenue.mrr", "finance.mrr"]);
  const runwayMetric = metricByKey(metrics, ["finance.cash_runway_months"]);
  const burnMetric = metricByKey(metrics, ["finance.net_burn"]);
  const pipelineMetric = metricByKey(metrics, ["sales.qualified_pipeline"]);
  const activationMetric = metricByKey(metrics, ["product.activation_rate"]);
  const retentionRiskMetric = metricByKey(metrics, ["customer_success.retention_risk"]);
  const netNewArr = asNumber(arrMetric?.delta) ?? (asNumber(mrrMetric?.delta) === null ? null : asNumber(mrrMetric?.delta)! * 12);
  const drivers: InvestorHealthyArrGrowthDriver[] = [
    {
      id: "runway",
      label: "Runway",
      value: runwayMetric?.value ?? null,
      unit: runwayMetric?.unit ?? "months",
      status: statusForMetric(runwayMetric),
    },
    {
      id: "net_burn",
      label: "Net Burn",
      value: burnMetric?.value ?? null,
      unit: burnMetric?.unit ?? "currency",
      status: statusForMetric(burnMetric),
    },
    {
      id: "pipeline",
      label: "Pipeline",
      value: pipelineMetric?.value ?? null,
      unit: pipelineMetric?.unit ?? "currency",
      status: statusForMetric(pipelineMetric),
    },
    {
      id: "activation",
      label: "Activation",
      value: activationMetric?.value ?? null,
      unit: activationMetric?.unit ?? "percent",
      status: statusForMetric(activationMetric),
    },
    {
      id: "retention_risk",
      label: "Retention Risk",
      value: retentionRiskMetric?.value ?? null,
      unit: retentionRiskMetric?.unit ?? "score",
      status: statusForMetric(retentionRiskMetric),
    },
  ];
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
      "Approved ARR/MRR growth interpreted through runway, burn, pipeline, activation, retention risk, and trust labels.",
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
