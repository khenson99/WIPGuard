/**
 * Metrics collector that aggregates data from existing observability
 * infrastructure and produces Prometheus-formatted output.
 */

import {
  type MetricFamily,
  circuitBreakerStateToNumber,
  formatMetrics,
} from './prometheus';

/**
 * Shape of outbox operational metrics returned by getOutboxOperationalMetrics().
 */
export interface OutboxMetrics {
  pending?: number;
  failed?: number;
  deadLetter?: number;
  processed?: number;
  total?: number;
  pendingCount?: number;
  failedCount?: number;
  deadLetterCount?: number;
  processedCount?: number;
  totalCount?: number;
}

/**
 * Shape of circuit breaker info.
 */
export interface CircuitBreakerInfo {
  provider: string;
  state: string;
  failureCount?: number;
  successCount?: number;
  lastFailure?: string | null;
}

/**
 * Shape of SLO report data.
 */
export interface SloMetric {
  name?: string;
  metric?: string;
  target?: number;
  current?: number;
  met?: boolean;
}

/**
 * Collector options for fetching metrics from various sources.
 */
export interface MetricsCollectorOptions {
  getOutboxMetrics?: () => Promise<OutboxMetrics> | OutboxMetrics;
  getCircuitBreakers?: () => Promise<CircuitBreakerInfo[]> | CircuitBreakerInfo[];
  getSloMetrics?: () => Promise<SloMetric[]> | SloMetric[];
}

/**
 * Build outbox metric families from outbox operational metrics.
 */
export function buildOutboxMetrics(metrics: OutboxMetrics): MetricFamily[] {
  const families: MetricFamily[] = [];

  const pending = metrics.pending ?? metrics.pendingCount ?? 0;
  const failed = metrics.failed ?? metrics.failedCount ?? 0;
  const deadLetter = metrics.deadLetter ?? metrics.deadLetterCount ?? 0;
  const processed = metrics.processed ?? metrics.processedCount ?? 0;
  const total = metrics.total ?? metrics.totalCount ?? 0;

  families.push({
    definition: {
      name: 'the_mother_node_outbox_events_pending',
      help: 'Number of pending outbox events',
      type: 'gauge',
    },
    samples: [
      { name: 'the_mother_node_outbox_events_pending', value: pending },
    ],
  });

  families.push({
    definition: {
      name: 'the_mother_node_outbox_events_failed',
      help: 'Number of failed outbox events',
      type: 'gauge',
    },
    samples: [
      { name: 'the_mother_node_outbox_events_failed', value: failed },
    ],
  });

  families.push({
    definition: {
      name: 'the_mother_node_outbox_events_dead_letter',
      help: 'Number of dead letter outbox events',
      type: 'gauge',
    },
    samples: [
      { name: 'the_mother_node_outbox_events_dead_letter', value: deadLetter },
    ],
  });

  families.push({
    definition: {
      name: 'the_mother_node_outbox_events_processed_total',
      help: 'Total number of processed outbox events',
      type: 'counter',
    },
    samples: [
      { name: 'the_mother_node_outbox_events_processed_total', value: processed },
    ],
  });

  families.push({
    definition: {
      name: 'the_mother_node_outbox_events_total',
      help: 'Total number of outbox events',
      type: 'counter',
    },
    samples: [
      { name: 'the_mother_node_outbox_events_total', value: total },
    ],
  });

  return families;
}

/**
 * Build circuit breaker metric families from circuit breaker info.
 */
export function buildCircuitBreakerMetrics(
  breakers: CircuitBreakerInfo[]
): MetricFamily[] {
  const families: MetricFamily[] = [];

  // State gauge
  const stateSamples = breakers.map((cb) => ({
    name: 'the_mother_node_circuit_breaker_state',
    value: circuitBreakerStateToNumber(cb.state),
    labels: { provider: cb.provider },
  }));

  if (stateSamples.length > 0) {
    families.push({
      definition: {
        name: 'the_mother_node_circuit_breaker_state',
        help: 'Circuit breaker state per provider (0=closed, 0.5=half-open, 1=open)',
        type: 'gauge',
      },
      samples: stateSamples,
    });
  }

  // Failure count gauge
  const failureSamples = breakers
    .filter((cb) => cb.failureCount !== undefined)
    .map((cb) => ({
      name: 'the_mother_node_circuit_breaker_failure_count',
      value: cb.failureCount!,
      labels: { provider: cb.provider },
    }));

  if (failureSamples.length > 0) {
    families.push({
      definition: {
        name: 'the_mother_node_circuit_breaker_failure_count',
        help: 'Circuit breaker failure count per provider',
        type: 'gauge',
      },
      samples: failureSamples,
    });
  }

  return families;
}

/**
 * Build SLO metric families from SLO report.
 */
export function buildSloMetrics(slos: SloMetric[]): MetricFamily[] {
  const families: MetricFamily[] = [];

  const targetSamples = slos
    .filter((s) => s.target !== undefined)
    .map((s) => ({
      name: 'the_mother_node_slo_target',
      value: s.target!,
      labels: { slo: s.name ?? s.metric ?? 'unknown' },
    }));

  if (targetSamples.length > 0) {
    families.push({
      definition: {
        name: 'the_mother_node_slo_target',
        help: 'SLO target value',
        type: 'gauge',
      },
      samples: targetSamples,
    });
  }

  const currentSamples = slos
    .filter((s) => s.current !== undefined)
    .map((s) => ({
      name: 'the_mother_node_slo_current',
      value: s.current!,
      labels: { slo: s.name ?? s.metric ?? 'unknown' },
    }));

  if (currentSamples.length > 0) {
    families.push({
      definition: {
        name: 'the_mother_node_slo_current',
        help: 'SLO current value',
        type: 'gauge',
      },
      samples: currentSamples,
    });
  }

  const metSamples = slos
    .filter((s) => s.met !== undefined)
    .map((s) => ({
      name: 'the_mother_node_slo_met',
      value: s.met ? 1 : 0,
      labels: { slo: s.name ?? s.metric ?? 'unknown' },
    }));

  if (metSamples.length > 0) {
    families.push({
      definition: {
        name: 'the_mother_node_slo_met',
        help: 'Whether the SLO is currently met (1=yes, 0=no)',
        type: 'gauge',
      },
      samples: metSamples,
    });
  }

  return families;
}

/**
 * Build a basic process/app info metric.
 */
export function buildAppInfoMetrics(): MetricFamily[] {
  return [
    {
      definition: {
        name: 'the_mother_node_app_info',
        help: 'The Mother Node application info',
        type: 'gauge',
      },
      samples: [
        {
          name: 'the_mother_node_app_info',
          value: 1,
          labels: {
            version: process.env.npm_package_version ?? 'unknown',
            node_version: process.version,
          },
        },
      ],
    },
    {
      definition: {
        name: 'the_mother_node_up',
        help: 'Whether The Mother Node application is up',
        type: 'gauge',
      },
      samples: [
        { name: 'the_mother_node_up', value: 1 },
      ],
    },
  ];
}

/**
 * Collect all metrics and return formatted Prometheus text.
 */
export async function collectMetrics(
  options: MetricsCollectorOptions = {}
): Promise<string> {
  const families: MetricFamily[] = [];

  // App info (always present)
  families.push(...buildAppInfoMetrics());

  // Outbox metrics
  if (options.getOutboxMetrics) {
    try {
      const outboxMetrics = await options.getOutboxMetrics();
      families.push(...buildOutboxMetrics(outboxMetrics));
    } catch (error) {
      // If outbox metrics fail, we still return other metrics
      console.error('[metrics] Failed to collect outbox metrics:', error);
    }
  }

  // Circuit breaker metrics
  if (options.getCircuitBreakers) {
    try {
      const breakers = await options.getCircuitBreakers();
      families.push(...buildCircuitBreakerMetrics(breakers));
    } catch (error) {
      console.error('[metrics] Failed to collect circuit breaker metrics:', error);
    }
  }

  // SLO metrics
  if (options.getSloMetrics) {
    try {
      const slos = await options.getSloMetrics();
      families.push(...buildSloMetrics(slos));
    } catch (error) {
      console.error('[metrics] Failed to collect SLO metrics:', error);
    }
  }

  return formatMetrics(families);
}
