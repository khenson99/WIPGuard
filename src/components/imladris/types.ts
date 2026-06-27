/**
 * Typed model for the Imladris metric dashboards client layer.
 *
 * Ports the normalized per-metric model from the design handoff
 * (`prototype/app/live.js` + `data.js`) to TypeScript. The normalized model
 * holds ALL catalog metrics; each dashboard view selects its own keys.
 */

import type { ImladrisProviderKey } from "@/lib/imladris/catalog";

export type MetricUnit =
  | "currency"
  | "count"
  | "percent"
  | "months"
  | "ratio"
  | "score"
  | "days";

export type MetricStatus = "ready" | "stale" | "partial" | "missing" | "error";

export type GoodDirection = "up" | "down";

export type ProviderState = "connected" | "stale" | "partial" | "error";

export type DashboardMode = "demo" | "live";

export type DataStatus = "loading" | "live" | "demo" | "error";

/** A contribution / composition breakdown (one metric split into parts). */
export interface MetricBreakdown {
  label: string;
  parts: Array<{ label: string; value: number }>;
}

/** Demo-only dimensional cohort (additive share bars or comparative rate bars). */
export interface MetricCohortGroup {
  label: string;
  history: number[];
}

export interface MetricCohortDimension {
  id: string;
  label: string;
  type: "additive" | "comparative";
  groups: MetricCohortGroup[];
}

/** A live benchmark segment sourced from `/dashboards/company` benchmarkContext. */
export interface LiveSegment {
  id: string;
  label: string;
  value: number | null;
  unit: MetricUnit;
  status: string;
  detail: string;
  sourceMetricKeys: string[];
}

/** The normalized per-metric model (README §"Client model shape"). */
export interface NormalizedMetric {
  key: string;
  label: string;
  dept: string;
  unit: MetricUnit;
  good: GoodDirection;
  /** Live mode: `null` when the metrics API published no value for this metric. */
  value: number | null;
  history: number[];
  liveTrend: boolean;
  status: MetricStatus;
  confidence: number;
  sources: ImladrisProviderKey[];
  target?: number | null;
  targetLabel?: string;
  breakdown?: MetricBreakdown;
  cohorts?: MetricCohortDimension[];
  liveSegments?: LiveSegment[];
  narrative?: string;
  warnings?: string[];
  calculationVersion?: string | null;
}

export interface NormalizedProvider {
  label: string;
  state: ProviderState;
  daysAgo: number;
  records: number;
  error?: string;
}

export interface DashboardGroup {
  title: string;
  keys: string[];
}

export interface DashboardDefinition {
  id: string;
  label: string;
  eyebrow: string;
  hero: string[];
  groups: DashboardGroup[];
}

/** The full normalized client model the dashboards render from. */
export interface ImladrisModel {
  currency: string;
  mode: DashboardMode;
  trendsAvailable: boolean;
  hasLiveCohorts: boolean;
  months: string[];
  currentMonth: string;
  providers: Record<string, NormalizedProvider>;
  metrics: NormalizedMetric[];
  metricByKey: Record<string, NormalizedMetric>;
  dashboards: Record<string, DashboardDefinition>;
  liveTrendKeys?: string[];
  liveSegmentList?: LiveSegment[];
}

// ---- Raw API response shapes (loosely-typed; the hook reads defensively) ----

export interface MetricsApiLineageRow {
  sourceKey?: unknown;
  sourceType?: unknown;
  source?: unknown;
}

export interface MetricsApiMetric {
  key: string;
  value?: unknown;
  status?: unknown;
  confidence?: unknown;
  warnings?: unknown;
  /** Production route returns `sourceLineage`; the prototype spec read `lineage`. */
  sourceLineage?: MetricsApiLineageRow[];
  lineage?: MetricsApiLineageRow[];
  calculationVersion?: unknown;
}

export interface MetricsApiResponse {
  generatedAt?: string | null;
  metrics?: MetricsApiMetric[];
}

export interface HistoryApiPoint {
  month?: string;
  value?: unknown;
  status?: unknown;
  confidence?: unknown;
}

export interface HistoryApiMetric {
  key: string;
  points?: Array<HistoryApiPoint | null>;
}

export interface HistoryApiResponse {
  months?: string[];
  metrics?: HistoryApiMetric[];
}

export interface SourcesApiRow {
  key?: unknown;
  provider?: unknown;
  providerKey?: unknown;
  status?: unknown;
  state?: unknown;
  connectionStatus?: unknown;
  credentialConnected?: unknown;
  lastSyncedAt?: unknown;
  lastSync?: unknown;
  capturedAt?: unknown;
  recordCount?: unknown;
  records?: unknown;
  lastError?: unknown;
  /** Production sources route nests the synced record count here. */
  latestSyncRun?: { recordCount?: unknown } | null;
}

export interface SourcesApiResponse {
  sources?: SourcesApiRow[];
  providers?: SourcesApiRow[];
}

export interface TrendsMonthEntry {
  month?: string;
  revenue?: number | null;
  mrr?: number | null;
  grossMarginPct?: number | null;
  totalOpex?: number | null;
  cashBalance?: number | null;
  burnRate?: number | null;
  netIncome?: number | null;
  activeSubscriptions?: number | null;
  churnRate?: number | null;
  operatingExpenses?: {
    payroll?: number | null;
    marketing?: number | null;
    infrastructure?: number | null;
    ops?: number | null;
  } | null;
}

export interface TrendsApiResponse {
  months?: TrendsMonthEntry[];
}

export interface CompanyApiResponse {
  summary?: Record<string, unknown> & { currency?: string };
  benchmarkContext?: { cohorts?: LiveSegment[] };
}

export type LoadResult =
  | { ok: true; data: ImladrisModel; generatedAt: string | null }
  | { ok: false; error: string; url: string };
