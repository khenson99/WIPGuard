/**
 * Prometheus metrics formatter and registry.
 * Collects metrics from existing observability infrastructure
 * and exports them in Prometheus text exposition format.
 *
 * @see https://prometheus.io/docs/instrumenting/exposition_formats/
 */

export type MetricType = 'gauge' | 'counter' | 'histogram' | 'summary';

export interface MetricDefinition {
  name: string;
  help: string;
  type: MetricType;
}

export interface MetricSample {
  name: string;
  value: number;
  labels?: Record<string, string>;
}

export interface MetricFamily {
  definition: MetricDefinition;
  samples: MetricSample[];
}

/**
 * Format a single metric family into Prometheus text exposition format.
 */
export function formatMetricFamily(family: MetricFamily): string {
  const lines: string[] = [];
  const { definition, samples } = family;

  lines.push(`# HELP ${definition.name} ${definition.help}`);
  lines.push(`# TYPE ${definition.name} ${definition.type}`);

  for (const sample of samples) {
    const labelStr = formatLabels(sample.labels);
    lines.push(`${sample.name}${labelStr} ${formatValue(sample.value)}`);
  }

  return lines.join('\n');
}

/**
 * Format labels into Prometheus label format: {key="value",key2="value2"}
 */
export function formatLabels(labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) {
    return '';
  }

  const pairs = Object.entries(labels)
    .map(([key, value]) => `${key}="${escapeLabelValue(value)}"`)
    .join(',');

  return `{${pairs}}`;
}

/**
 * Escape special characters in label values per Prometheus spec.
 */
export function escapeLabelValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

/**
 * Format a numeric value for Prometheus output.
 */
export function formatValue(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return '+Inf';
  if (value === -Infinity) return '-Inf';
  return String(value);
}

/**
 * Format multiple metric families into a complete Prometheus text exposition response.
 */
export function formatMetrics(families: MetricFamily[]): string {
  return families.map(formatMetricFamily).join('\n\n') + '\n';
}

/**
 * Map circuit breaker state strings to numeric values for Prometheus.
 * 0 = closed (healthy), 1 = open (tripped), 0.5 = half-open (testing)
 */
export function circuitBreakerStateToNumber(state: string): number {
  switch (state.toLowerCase()) {
    case 'closed':
      return 0;
    case 'open':
      return 1;
    case 'half-open':
    case 'half_open':
      return 0.5;
    default:
      return -1;
  }
}
