/**
 * GET /api/metrics
 *
 * Prometheus-format metrics endpoint for external monitoring systems.
 * Returns metrics in Prometheus text exposition format.
 *
 * Authentication: Bearer token via METRICS_BEARER_TOKEN environment variable.
 * If METRICS_BEARER_TOKEN is not set, the endpoint is disabled (returns 404).
 *
 * Usage:
 *   curl -H "Authorization: Bearer <token>" http://localhost:3000/api/metrics
 *
 * @see https://prometheus.io/docs/instrumenting/exposition_formats/
 */

import { NextRequest, NextResponse } from 'next/server';
import { collectMetrics, type MetricsCollectorOptions } from '@/lib/metrics/collector';

/**
 * Validate the bearer token from the Authorization header.
 */
function validateBearerToken(request: NextRequest): boolean {
  const expectedToken = process.env.METRICS_BEARER_TOKEN;

  // If no token is configured, the endpoint is disabled
  if (!expectedToken) {
    return false;
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return false;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  const token = parts[1];
  if (token.length !== expectedToken.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ expectedToken.charCodeAt(i);
  }

  return mismatch === 0;
}

/**
 * Build collector options by dynamically importing existing metric sources.
 * This gracefully handles cases where modules don't exist yet.
 */
async function buildCollectorOptions(): Promise<MetricsCollectorOptions> {
  const options: MetricsCollectorOptions = {};

  // Try to import outbox operational metrics
  try {
    const outboxModule = await import('@/lib/outbox/metrics');
    if (typeof outboxModule.getOutboxOperationalMetrics === 'function') {
      options.getOutboxMetrics = outboxModule.getOutboxOperationalMetrics;
    }
  } catch {
    // Module doesn't exist or failed to load — skip
  }

  // Try to import circuit breaker registry
  try {
    const cbModule = await import('@/lib/circuit-breaker/registry');
    if (typeof cbModule.getAllCircuitBreakerStates === 'function') {
      options.getCircuitBreakers = cbModule.getAllCircuitBreakerStates;
    }
  } catch {
    // Module doesn't exist or failed to load — skip
  }

  // Try to import SLO evaluator
  try {
    const sloModule = await import('@/lib/observability/slo');
    if (typeof sloModule.getSloReport === 'function') {
      options.getSloMetrics = async () => {
        const report = await sloModule.getSloReport();
        // The SLO report might have various shapes — normalize
        if (Array.isArray(report)) {
          return report;
        }
        if (report && typeof report === 'object' && Array.isArray((report as Record<string, unknown>).slos)) {
          return (report as Record<string, unknown>).slos as Array<{ name?: string; metric?: string; target?: number; current?: number; met?: boolean }>;
        }
        return [];
      };
    }
  } catch {
    // Module doesn't exist or failed to load — skip
  }

  return options;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Check if metrics endpoint is enabled
  if (!process.env.METRICS_BEARER_TOKEN) {
    return NextResponse.json(
      { error: 'Metrics endpoint is not configured. Set METRICS_BEARER_TOKEN environment variable.' },
      { status: 404 }
    );
  }

  // Validate bearer token
  if (!validateBearerToken(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const options = await buildCollectorOptions();
    const metricsText = await collectMetrics(options);

    return new NextResponse(metricsText, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[/api/metrics] Failed to collect metrics:', error);
    return NextResponse.json(
      { error: 'Internal server error while collecting metrics' },
      { status: 500 }
    );
  }
}
