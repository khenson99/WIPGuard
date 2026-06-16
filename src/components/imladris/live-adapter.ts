/**
 * Imladris live-data adapter — a typed port of `prototype/app/live.js`.
 *
 * Fetches the real canonical metrics, monthly time-series, source health, and
 * company cohort/segment data, then overlays them onto the seed model. Renders
 * ONLY what the API actually provides (live-or-error): if `/metrics` fails or
 * matches zero canonical metrics, the caller shows an error — never sample data.
 *
 * Endpoints (all same-origin, NextAuth-gated):
 *   GET /api/imladris/metrics                     — canonical current values, status, lineage
 *   GET /api/imladris/sources                     — provider/source health
 *   GET /api/imladris/metrics/history?months=13   — per-metric monthly trend (PRIMARY trend source)
 *   GET /api/financial-planning/monthly-history   — monthly P&L series (trend fallback)
 *   GET /api/imladris/dashboards/company          — summary breakdowns + benchmark cohorts
 */

import { buildImladrisModel } from "./model";
import type {
  CompanyApiResponse,
  HistoryApiResponse,
  ImladrisModel,
  LiveSegment,
  LoadResult,
  MetricStatus,
  MetricsApiResponse,
  ProviderState,
  SourcesApiResponse,
  TrendsApiResponse,
  TrendsMonthEntry,
} from "./types";
import type { ImladrisProviderKey } from "@/lib/imladris/catalog";

const BASE = "";
export const ENDPOINTS = {
  metrics: BASE + "/api/imladris/metrics",
  sources: BASE + "/api/imladris/sources",
  history: BASE + "/api/imladris/metrics/history?months=13",
  trends: BASE + "/api/financial-planning/monthly-history?months=13",
  company: BASE + "/api/imladris/dashboards/company",
};
const TIMEOUT_MS = 8000;

const PROVIDER_ALIASES: Record<string, ImladrisProviderKey> = {
  hubspot: "hubspot", stripe: "stripe", pylon: "pylon", posthog: "posthog",
  linear: "linear", slack: "slack", github: "github", mercury: "mercury",
  coda: "coda", webflow: "webflow", unify: "unify", semrush: "semrush",
  reddit: "reddit", redditads: "reddit",
  googleworkspace: "googleWorkspace", googleanalytics: "googleAnalytics",
  googlesearchconsole: "googleSearchConsole", searchconsole: "googleSearchConsole",
  googleads: "googleAds", metaads: "metaAds", metapage: "metaAds", instagram: "metaAds",
};

function norm(s: unknown): string {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function providerKey(alias: unknown): ImladrisProviderKey | null {
  return PROVIDER_ALIASES[norm(alias)] ?? null;
}

/** Extract a number from a canonical value object (matches `extractNumber`). */
export function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    for (const k of ["value", "amount", "months", "rate", "score", "ratio", "count", "balance", "total", "metricValue", "metric_value"]) {
      if (k in obj) {
        const n = num(obj[k]);
        if (n != null) return n;
      }
    }
    if ("data" in obj) return num(obj.data);
  }
  return null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function statusOf(s: unknown): MetricStatus {
  const t = String(s ?? "").toLowerCase();
  if (["ready", "stale", "partial", "missing", "error"].includes(t)) return t as MetricStatus;
  if (["ok", "fresh", "connected", "success"].includes(t)) return "ready";
  return "missing";
}

function clampConf(c: unknown): number | null {
  const n = typeof c === "number" ? c : parseFloat(String(c));
  if (!Number.isFinite(n)) return null;
  return n > 1 ? Math.min(n / 100, 1) : Math.max(0, n);
}

function withTimeout<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  return fetch(url, {
    signal: ctrl.signal,
    headers: { accept: "application/json" },
    credentials: "same-origin",
  })
    .then((r) => {
      if (!r.ok) throw new Error(`${url} -> ${r.status}`);
      return r.json() as Promise<T>;
    })
    .finally(() => clearTimeout(t));
}

// ---- canonical current values -> value/status/confidence/lineage ----
function mergeMetrics(model: ImladrisModel, payload: MetricsApiResponse): number {
  const live = Array.isArray(payload?.metrics) ? payload.metrics : [];
  let matched = 0;
  live.forEach((lm) => {
    const m = model.metricByKey[lm.key];
    if (!m) return;
    matched++;
    const n = num(lm.value);
    if (n != null) m.value = n;
    if (lm.status) m.status = statusOf(lm.status);
    const conf = clampConf(lm.confidence);
    if (conf != null) m.confidence = conf;
    if (Array.isArray(lm.warnings) && lm.warnings.length) {
      m.warnings = lm.warnings.filter((w): w is string => typeof w === "string");
    }
    // Production route returns `sourceLineage`; the prototype spec read `lineage`.
    const lineage = lm.sourceLineage ?? lm.lineage;
    if (Array.isArray(lineage) && lineage.length) {
      const keys: ImladrisProviderKey[] = [];
      lineage.forEach((row) => {
        const k = providerKey(row.sourceKey ?? row.sourceType ?? row.source);
        if (k && keys.indexOf(k) < 0) keys.push(k);
      });
      if (keys.length) m.sources = keys;
    }
    if (typeof lm.calculationVersion === "string") m.calculationVersion = lm.calculationVersion;
  });
  return matched;
}

// ---- source health ----
function mergeSources(model: ImladrisModel, payload: SourcesApiResponse | SourcesApiResponse["sources"]): void {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.sources)
      ? payload.sources
      : Array.isArray(payload?.providers)
        ? payload.providers
        : [];
  const stateMap: Record<string, ProviderState> = {
    connected: "connected", success: "connected", ok: "connected",
    stale: "stale", partial: "partial",
    error: "error", failing: "error", missing: "error", disconnected: "error",
  };
  rows.forEach((row) => {
    const key = providerKey(row.key ?? row.provider ?? row.providerKey);
    if (!key || !model.providers[key]) return;
    const p = model.providers[key];
    const st = stateMap[String(row.status ?? row.state ?? "").toLowerCase()];
    if (st) p.state = st;
    const last = row.lastSyncedAt ?? row.lastSync ?? row.capturedAt;
    if (typeof last === "string") {
      const d = Math.round((Date.now() - new Date(last).getTime()) / 86_400_000);
      if (Number.isFinite(d)) p.daysAgo = Math.max(0, d);
    }
    // Top-level recordCount/records, else the production `latestSyncRun.recordCount`.
    const rec = num(row.recordCount ?? row.records ?? row.latestSyncRun?.recordCount);
    if (rec != null) p.records = rec;
    if (typeof row.lastError === "string" && row.lastError) p.error = row.lastError;
  });
}

// ---- monthly P&L -> real per-metric time-series (TREND fallback) ----
const SERIES: Record<string, (e: TrendsMonthEntry) => number | null | undefined> = {
  "revenue.total_revenue": (e) => e.revenue,
  "revenue.mrr": (e) => e.mrr,
  "revenue.arr": (e) => (e.mrr != null ? e.mrr * 12 : null),
  "finance.gross_margin": (e) => e.grossMarginPct,
  "finance.expenses": (e) => e.totalOpex,
  "finance.cash_balance": (e) => e.cashBalance,
  "finance.net_burn": (e) => (e.burnRate != null ? e.burnRate : typeof e.netIncome === "number" && e.netIncome < 0 ? -e.netIncome : null),
  "finance.cash_runway_months": (e) => (e.cashBalance != null && e.burnRate ? e.cashBalance / e.burnRate : null),
  "revenue.active_subscriptions": (e) => e.activeSubscriptions,
  "customer_success.churn_rate": (e) => e.churnRate,
};

function carryFill(raw: Array<number | null>): void {
  let last: number | null = null;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] == null) raw[i] = last;
    else last = raw[i];
  }
  let next: number | null = null;
  for (let i = raw.length - 1; i >= 0; i--) {
    if (raw[i] == null) raw[i] = next;
    else next = raw[i];
  }
}

function flatFillRest(model: ImladrisModel, len: number): void {
  model.metrics.forEach((m) => {
    if (m.liveTrend) return;
    m.liveTrend = false;
    // No live value ⇒ empty history ⇒ renders "—" (never a seeded sample value).
    m.history = m.value == null ? [] : new Array<number>(len).fill(m.value);
  });
}

function applyTrends(model: ImladrisModel, payload: TrendsApiResponse): { available: boolean; keys: string[] } {
  const entries = Array.isArray(payload?.months) ? payload.months : [];
  if (entries.length < 2) return { available: false, keys: [] };
  const months = entries.map((e) => e.month ?? "");
  model.months = months;
  model.currentMonth = months[months.length - 1];
  const need = Math.max(2, Math.floor(months.length * 0.5));
  const liveKeys: string[] = [];
  model.metrics.forEach((m) => {
    const ex = SERIES[m.key];
    if (!ex) return;
    const raw: Array<number | null> = entries.map((e) => {
      const v = ex(e);
      return typeof v === "number" && Number.isFinite(v) ? round2(v) : null;
    });
    if (raw.filter((v) => v != null).length < need) return;
    carryFill(raw);
    m.history = raw.map((v) => (v == null ? 0 : v));
    m.value = m.history[m.history.length - 1];
    m.liveTrend = true;
    liveKeys.push(m.key);
  });
  flatFillRest(model, months.length);
  return { available: true, keys: liveKeys };
}

// PRIMARY trend source: per-metric canonical history (covers every catalog metric).
function applyHistory(model: ImladrisModel, payload: HistoryApiResponse): { available: boolean; keys: string[] } {
  const months = Array.isArray(payload?.months) ? payload.months : [];
  const series = Array.isArray(payload?.metrics) ? payload.metrics : [];
  if (months.length < 2 || !series.length) return { available: false, keys: [] };
  model.months = months;
  model.currentMonth = months[months.length - 1];
  const need = Math.max(2, Math.floor(months.length * 0.4));
  const liveKeys: string[] = [];
  series.forEach((s) => {
    const m = model.metricByKey[s.key];
    if (!m || !Array.isArray(s.points)) return;
    const raw: Array<number | null> = s.points.map((p) =>
      p && typeof p.value === "number" && Number.isFinite(p.value) ? round2(p.value) : null,
    );
    if (raw.filter((v) => v != null).length < need) return;
    carryFill(raw);
    m.history = raw.map((v) => (v == null ? 0 : v));
    m.value = m.history[m.history.length - 1];
    m.liveTrend = true;
    liveKeys.push(m.key);
  });
  flatFillRest(model, months.length);
  return { available: true, keys: liveKeys };
}

// Enrich finance.expenses with the real opex category split (from monthly P&L).
function applyExpenseCategories(model: ImladrisModel, payload: TrendsApiResponse): void {
  const entries = Array.isArray(payload?.months) ? payload.months : [];
  const latest = entries[entries.length - 1];
  const oe = latest?.operatingExpenses;
  const exp = model.metricByKey["finance.expenses"];
  if (!oe || !exp) return;
  const parts = [
    { label: "Payroll", value: oe.payroll },
    { label: "Marketing", value: oe.marketing },
    { label: "Infrastructure", value: oe.infrastructure },
    { label: "Ops", value: oe.ops },
  ].filter((p): p is { label: string; value: number } => typeof p.value === "number" && Number.isFinite(p.value));
  if (parts.length) exp.breakdown = { label: "By category", parts };
}

// ---- company dashboard -> real breakdowns + cohort segments ----
type SummaryBreakdown = (s: Record<string, unknown>) => { label: string; parts: Array<{ label: string; value: unknown }> };
const SUMMARY_BREAKDOWNS: Record<string, SummaryBreakdown> = {
  "revenue.total_revenue": (s) => ({ label: "Recognized this month", parts: [
    { label: "Subscription", value: s.subscriptionRevenue }, { label: "Services", value: s.servicesRevenue } ] }),
  "finance.net_burn": (s) => ({ label: "Cash flow", parts: [
    { label: "Outflow", value: s.cashOutflow }, { label: "Inflow", value: s.cashInflow } ] }),
  "revenue.active_subscriptions": (s) => ({ label: "By billing system", parts: [
    { label: "Stripe", value: s.stripeSubscriptions }, { label: "HubSpot-only", value: s.hubspotOnlySubscriptions } ] }),
  "revenue.customer_count": (s) => ({ label: "By billing system", parts: [
    { label: "Stripe", value: s.stripeCustomers }, { label: "HubSpot-only", value: s.hubspotOnlyCustomers } ] }),
  "sales.demos": (s) => ({ label: "By stage", parts: [
    { label: "Scheduled", value: s.scheduledDemos }, { label: "Requested", value: s.requestedDemos } ] }),
  "marketing.website_traffic": (s) => ({ label: "Traffic", parts: [
    { label: "Sessions", value: s.websiteSessions }, { label: "Organic", value: s.organicTraffic } ] }),
};

function applyCohorts(model: ImladrisModel, payload: CompanyApiResponse): { available: boolean; segments: LiveSegment[] } {
  if (!payload || typeof payload !== "object") return { available: false, segments: [] };
  const summary = payload.summary ?? null;
  // Strip every scaffold breakdown/cohort first — live shows only what the API gives.
  model.metrics.forEach((m) => {
    delete m.breakdown;
    delete m.cohorts;
    m.liveSegments = [];
  });
  if (summary) {
    if (typeof summary.currency === "string") model.currency = summary.currency;
    Object.keys(SUMMARY_BREAKDOWNS).forEach((k) => {
      const m = model.metricByKey[k];
      if (!m) return;
      const b = SUMMARY_BREAKDOWNS[k](summary);
      const parts = b.parts
        .map((p) => ({ label: p.label, value: num(p.value) }))
        .filter((p): p is { label: string; value: number } => p.value != null);
      if (parts.length) m.breakdown = { label: b.label, parts };
    });
  }
  const segs = Array.isArray(payload.benchmarkContext?.cohorts) ? payload.benchmarkContext.cohorts : [];
  segs.forEach((c) => {
    (c.sourceMetricKeys ?? []).forEach((k) => {
      const m = model.metricByKey[k];
      if (m) (m.liveSegments ??= []).push(c);
    });
  });
  return { available: segs.length > 0, segments: segs };
}

/** Fetch all endpoints in parallel and overlay onto the seed model. */
export async function loadImladrisData(): Promise<LoadResult> {
  let res: PromiseSettledResult<unknown>[];
  try {
    res = await Promise.allSettled([
      withTimeout<MetricsApiResponse>(ENDPOINTS.metrics),
      withTimeout<SourcesApiResponse>(ENDPOINTS.sources),
      withTimeout<HistoryApiResponse>(ENDPOINTS.history),
      withTimeout<TrendsApiResponse>(ENDPOINTS.trends),
      withTimeout<CompanyApiResponse>(ENDPOINTS.company),
    ]);
  } catch (e) {
    return { ok: false, error: errMessage(e), url: ENDPOINTS.metrics };
  }

  const [metricsR, sourcesR, historyR, trendsR, companyR] = res;

  if (metricsR.status !== "fulfilled" || !metricsR.value) {
    const reason = metricsR.status === "rejected" ? metricsR.reason : null;
    const msg =
      reason && (reason as Error).name === "AbortError"
        ? `Request timed out after ${TIMEOUT_MS / 1000}s.`
        : (reason as Error)?.message || "The metrics API did not return a response.";
    return { ok: false, error: msg, url: ENDPOINTS.metrics };
  }

  const model = buildImladrisModel();
  model.mode = "live";
  // Live-or-error: the seed model contributes STRUCTURE only (labels, units,
  // targets, cohort scaffolding) — never its sample VALUES. Clear every seeded
  // value up front so any metric the API omits, or returns without a value,
  // renders as an honest empty state ("—") instead of a fabricated demo number.
  for (const m of model.metrics) {
    m.value = null;
    m.history = [];
    m.liveTrend = false;
  }

  const metricsPayload = metricsR.value as MetricsApiResponse;
  const matched = mergeMetrics(model, metricsPayload);
  if (!matched) {
    return {
      ok: false,
      error: "The metrics API responded but returned no recognized canonical metrics.",
      url: ENDPOINTS.metrics,
    };
  }

  if (sourcesR.status === "fulfilled" && sourcesR.value) {
    mergeSources(model, sourcesR.value as SourcesApiResponse);
  }

  // Trends: prefer the per-metric history endpoint; fall back to the P&L series.
  let trends = { available: false, keys: [] as string[] };
  if (historyR.status === "fulfilled" && historyR.value) {
    trends = applyHistory(model, historyR.value as HistoryApiResponse);
  }
  if (!trends.available && trendsR.status === "fulfilled" && trendsR.value) {
    trends = applyTrends(model, trendsR.value as TrendsApiResponse);
  }
  model.trendsAvailable = trends.available;
  model.liveTrendKeys = trends.keys;
  if (!trends.available) {
    model.metrics.forEach((m) => {
      m.liveTrend = false;
      m.history = m.value == null ? [] : [m.value];
    });
    model.months = [model.currentMonth || IMLADRIS_FALLBACK_MONTH(model)];
  }

  const cohorts =
    companyR.status === "fulfilled"
      ? applyCohorts(model, companyR.value as CompanyApiResponse)
      : { available: false, segments: [] as LiveSegment[] };
  model.hasLiveCohorts = cohorts.available;
  model.liveSegmentList = cohorts.segments;
  if (companyR.status !== "fulfilled") {
    model.metrics.forEach((m) => {
      delete m.breakdown;
      delete m.cohorts;
      m.liveSegments = [];
    });
  }
  // Expense category split survives the cohort strip (added last, best-effort).
  if (trendsR.status === "fulfilled" && trendsR.value) {
    applyExpenseCategories(model, trendsR.value as TrendsApiResponse);
  }

  return { ok: true, data: model, generatedAt: metricsPayload.generatedAt ?? null };
}

function IMLADRIS_FALLBACK_MONTH(model: ImladrisModel): string {
  return model.months[model.months.length - 1] ?? "";
}

function errMessage(e: unknown): string {
  return (e as Error)?.message || "Unexpected error contacting the metrics API.";
}

/** A demo model for the explicit `?demo` path (loudly labeled in the UI). */
export function buildDemoModel(): ImladrisModel {
  return buildImladrisModel();
}
