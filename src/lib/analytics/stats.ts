/**
 * Pure statistical primitives for the analytics engine.
 * No I/O — all functions are deterministic and side-effect-free.
 */

// ── Basic helpers ──

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function movingAverage(series: number[], window: number): number[] {
  if (window <= 0 || series.length === 0) return [];
  const result: number[] = [];
  for (let i = 0; i < series.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = series.slice(start, i + 1);
    result.push(slice.reduce((s, v) => s + v, 0) / slice.length);
  }
  return result;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// ── Z-score anomaly detection ──

export function zScore(value: number, seriesMean: number, seriesStdDev: number): number {
  if (seriesStdDev === 0) return 0;
  return (value - seriesMean) / seriesStdDev;
}

export interface AnomalyResult {
  index: number;
  value: number;
  z: number;
  direction: "above" | "below";
}

export function detectAnomalies(series: number[], threshold = 2.0): AnomalyResult[] {
  if (series.length < 4) return [];
  const m = mean(series);
  const sd = stdDev(series);
  if (sd === 0) return [];

  const anomalies: AnomalyResult[] = [];
  for (let i = 0; i < series.length; i++) {
    const z = zScore(series[i], m, sd);
    if (Math.abs(z) >= threshold) {
      anomalies.push({
        index: i,
        value: series[i],
        z,
        direction: z > 0 ? "above" : "below",
      });
    }
  }
  return anomalies;
}

// ── Holt's double exponential smoothing ──

export interface ForecastPoint {
  value: number;
  upper: number;
  lower: number;
}

export interface HoltForecastResult {
  fitted: number[];
  forecast: ForecastPoint[];
  trend: number;
  mape: number;
}

export function exponentialSmoothing(
  series: number[],
  alpha = 0.3,
  beta = 0.1,
  periods = 7,
  confidenceZ = 1.96,
): HoltForecastResult {
  if (series.length < 2) {
    const val = series[0] ?? 0;
    return {
      fitted: series.length > 0 ? [val] : [],
      forecast: Array.from({ length: periods }, () => ({ value: val, upper: val, lower: val })),
      trend: 0,
      mape: 0,
    };
  }

  let level = series[0];
  let trend = series[1] - series[0];
  const fitted: number[] = [level];

  for (let i = 1; i < series.length; i++) {
    const prevLevel = level;
    level = alpha * series[i] + (1 - alpha) * (prevLevel + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    fitted.push(level + trend);
  }

  // In-sample MAPE
  let totalAbsError = 0;
  let count = 0;
  for (let i = 0; i < series.length; i++) {
    if (series[i] !== 0) {
      totalAbsError += Math.abs((series[i] - fitted[i]) / series[i]);
      count++;
    }
  }
  const mape = count > 0 ? (totalAbsError / count) * 100 : 0;

  // Residual std dev for confidence bands
  const residuals = series.map((v, i) => v - fitted[i]);
  const residualSd = stdDev(residuals);

  const forecast: ForecastPoint[] = [];
  for (let h = 1; h <= periods; h++) {
    const pointForecast = level + trend * h;
    const width = confidenceZ * residualSd * Math.sqrt(h);
    forecast.push({
      value: pointForecast,
      upper: pointForecast + width,
      lower: pointForecast - width,
    });
  }

  return { fitted, forecast, trend, mape };
}

// ── Linear regression ──

export interface RegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
}

export function linearRegression(points: { x: number; y: number }[]): RegressionResult {
  if (points.length < 2) return { slope: 0, intercept: points[0]?.y ?? 0, rSquared: 0 };

  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, rSquared: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R²
  const meanY = sumY / n;
  const ssTotal = points.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
  const ssResidual = points.reduce((s, p) => s + (p.y - (slope * p.x + intercept)) ** 2, 0);
  const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

  return { slope, intercept, rSquared };
}

// ── Pearson correlation ──

export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;

  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? 0 : num / denom;
}

// ── Dynamic confidence scoring ──

export interface ConfidenceFactors {
  dataCompleteness: number;   // 0-1: fraction of expected data sources present
  dataFreshness: number;      // 0-1: 1 = all fresh, 0 = all stale
  historicalDepth: number;    // 0-1: min(periods / 12, 1)
  crossDomainAgreement: number; // 0-1: fraction of correlated signals agreeing
}

export function computeConfidence(factors: ConfidenceFactors): number {
  const weights = { dataCompleteness: 0.30, dataFreshness: 0.25, historicalDepth: 0.25, crossDomainAgreement: 0.20 };
  const raw =
    factors.dataCompleteness * weights.dataCompleteness +
    factors.dataFreshness * weights.dataFreshness +
    factors.historicalDepth * weights.historicalDepth +
    factors.crossDomainAgreement * weights.crossDomainAgreement;

  return clampConfidence(raw);
}

function clampConfidence(value: number): number {
  return Math.max(0.1, Math.min(0.99, Math.round(value * 100) / 100));
}
