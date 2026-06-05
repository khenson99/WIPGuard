import { IMLADRIS_METRIC_DEFINITIONS, getImladrisMetricDefinition } from "@/lib/imladris/catalog";
import type { PrismaClientType } from "@/lib/prisma";

interface UserContext {
  userId: string | null;
  organizationId: string | null;
}

interface HistoryRow {
  metricKey: string;
  value: unknown;
  status: string;
  confidence: number;
  periodEnd: Date | string;
  computedAt: Date | string;
  calculationVersion: string | null;
  userId?: string | null;
  organizationId?: string | null;
}

export interface MetricHistoryPoint {
  month: string;            // "YYYY-MM"
  value: number | null;     // extracted scalar, or null when no row for that period
  status: string | null;
  confidence: number | null;
}

export interface MetricHistorySeries {
  key: string;
  label: string;
  department: string;
  unit: string;
  points: MetricHistoryPoint[]; // aligned 1:1 with the returned `months` axis
}

export interface ImladrisMetricHistory {
  months: string[];
  metrics: MetricHistorySeries[];
}

// --- helpers ---------------------------------------------------------------

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Pull a scalar number out of a canonical metric value object (amount/rate/score/…).
function extractNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "object") {
    const rec = v as Record<string, unknown>;
    for (const k of ["value", "amount", "months", "rate", "score", "ratio", "count", "balance", "total"]) {
      if (k in rec) { const n = extractNumber(rec[k]); if (n != null) return n; }
    }
    if ("data" in rec) return extractNumber(rec.data);
  }
  return null;
}

function scopeWhere(context: UserContext) {
  if (context.organizationId) {
    const scoped = context.userId ? [{ userId: context.userId, organizationId: context.organizationId }] : [];
    const legacy = context.userId ? [{ userId: context.userId, organizationId: null }] : [];
    return { OR: [...scoped, { userId: null, organizationId: context.organizationId }, ...legacy, { userId: null, organizationId: null }] };
  }
  if (!context.userId) return { OR: [{ userId: null, organizationId: null }] };
  return { OR: [{ userId: context.userId, organizationId: null }, { userId: null, organizationId: null }] };
}

// Higher = more specific match for the requesting context (pick the best row per period).
function specificity(row: HistoryRow, context: UserContext): number {
  const u = row.userId ?? null;
  const o = row.organizationId ?? null;
  if (context.organizationId) {
    if (u === context.userId && o === context.organizationId) return 4;
    if (context.userId && u === context.userId && o === null) return 3;
    if (u === null && o === context.organizationId) return 2;
    if (u === null && o === null) return 1;
    return 0;
  }
  if (context.userId) {
    if (u === context.userId && o === null) return 3;
    if (u === null && o === null) return 1;
    return 0;
  }
  return u === null && o === null ? 1 : 0;
}

function buildMonthAxis(months: number, now: Date): string[] {
  const out: string[] = [];
  const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - i, 1));
    out.push(monthKey(d));
  }
  return out;
}

// --- main ------------------------------------------------------------------

export async function buildImladrisMetricHistory(input: {
  prisma: PrismaClientType;
  context: UserContext;
  months?: number;
}): Promise<ImladrisMetricHistory> {
  const months = Math.min(36, Math.max(2, Math.floor(input.months ?? 13)));
  const now = new Date();
  const axis = buildMonthAxis(months, now);
  const earliest = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const keys = IMLADRIS_METRIC_DEFINITIONS.map((d) => d.key);

  const rows = (await input.prisma.imladrisCanonicalMetricValue.findMany({
    where: {
      metricKey: { in: keys },
      periodEnd: { gte: earliest, lte: now },
      computedAt: { lte: now },
      ...scopeWhere(input.context),
    },
    orderBy: [{ periodEnd: "desc" }, { computedAt: "desc" }],
  })) as HistoryRow[];

  // group by metricKey -> monthKey, keeping the best-scoped, freshest row per bucket
  const best = new Map<string, Map<string, HistoryRow>>();
  for (const row of rows) {
    const pe = toDate(row.periodEnd);
    const ce = toDate(row.computedAt);
    if (!pe || !ce || ce.getTime() > now.getTime()) continue;
    const mk = monthKey(pe);
    if (!axis.includes(mk)) continue;
    let perMetric = best.get(row.metricKey);
    if (!perMetric) { perMetric = new Map(); best.set(row.metricKey, perMetric); }
    const existing = perMetric.get(mk);
    if (!existing || isBetter(row, existing, input.context)) perMetric.set(mk, row);
  }

  const metrics: MetricHistorySeries[] = IMLADRIS_METRIC_DEFINITIONS.map((def) => {
    const perMetric = best.get(def.key);
    const points: MetricHistoryPoint[] = axis.map((mk) => {
      const row = perMetric?.get(mk);
      if (!row) return { month: mk, value: null, status: null, confidence: null };
      return {
        month: mk,
        value: extractNumber(row.value),
        status: row.status ?? null,
        confidence: typeof row.confidence === "number" ? row.confidence : null,
      };
    });
    const d = getImladrisMetricDefinition(def.key);
    return {
      key: def.key,
      label: d?.label ?? def.key,
      department: d?.department ?? "operating",
      unit: d?.unit ?? "count",
      points,
    };
  });

  return { months: axis, metrics };
}

function isBetter(candidate: HistoryRow, existing: HistoryRow, ctx: UserContext): boolean {
  const ds = specificity(candidate, ctx) - specificity(existing, ctx);
  if (ds !== 0) return ds > 0;
  const ca = toDate(candidate.computedAt)?.getTime() ?? 0;
  const ea = toDate(existing.computedAt)?.getTime() ?? 0;
  return ca > ea;
}
