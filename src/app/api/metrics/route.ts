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
import { timingSafeEqual } from 'crypto';
import { collectMetrics, type MetricsCollectorOptions, type CircuitBreakerInfo } from '@/lib/metrics/collector';

/**
 * Validate the bearer token from the Authorization header.
 * Uses crypto.timingSafeEqual to prevent timing attacks.
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

  const token = parts[1];

  // Use a fixed-length comparison to avoid leaking token length.
  // If lengths differ, compare the expected token against itself
  // so we still do constant-time work.
  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expectedToken);

  if (tokenBuf.length !== expectedBuf.length) {
    // Compare expectedBuf against itself so timing is constant,
    // then return false regardless.
    timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }

  return timingSafeEqual(tokenBuf, expectedBuf);
}

/**
 * Build collector options by dynamically importing existing metric sources.
 * This gracefully handles cases where modules don't exist yet.
 */
async function buildCollectorOptions(): Promise<MetricsCollectorOptions> {
  const options: MetricsCollectorOptions = {};

  // Try to import outbox operational metrics
  try {
    const outboxModule = await import('@/lib/outbox-worker');
    const prismaModule = await import('@/lib/prisma');
    if (typeof outboxModule.getOutboxOperationalMetrics === 'function') {
      options.getOutboxMetrics = async () => {
        const metrics = await outboxModule.getOutboxOperationalMetrics(prismaModule.prisma);
        // Map OutboxOperationalMetrics to the collector's OutboxMetrics shape
        return {
          pending: metrics.counts.pending,
          failed: metrics.counts.failed,
          deadLetter: metrics.counts.deadLetter,
          processed: metrics.counts.dispatched,
          total: metrics.counts.total,
        };
      };
    }
  } catch {
    // Module doesn't exist or failed to load — skip
  }

  // Try to import circuit breaker states from DB
  try {
    const prismaModule = await import('@/lib/prisma');
    options.getCircuitBreakers = async (): Promise<CircuitBreakerInfo[]> => {
      const rows = await prismaModule.prisma.integrationCircuitState.findMany({
        select: {
          key: true,
          state: true,
          consecutiveFailures: true,
        },
      });
      return rows.map((row: { key: string; state: string; consecutiveFailures: number }) => ({
        provider: row.key,
        state: row.state,
        failureCount: row.consecutiveFailures,
      }));
    };
  } catch {
    // Module doesn't exist or failed to load — skip
  }

  // Try to import SLO evaluator
  try {
    const sloModule = await import('@/lib/observability/slo');
    if (typeof sloModule.evaluateObservabilitySlos === 'function') {
      options.getSloMetrics = async () => {
        // evaluateObservabilitySlos requires complex input; import
        // the data sources and assemble the input at call time.
        const prismaModule = await import('@/lib/prisma');
        const outboxModule = await import('@/lib/outbox-worker');

        const [connections, rules, outboxMetrics] = await Promise.all([
          prismaModule.prisma.integrationConnection.findMany({
            select: { provider: true, status: true, lastSyncedAt: true, lastError: true },
          }),
          prismaModule.prisma.integrationRule.findMany({
            select: { provider: true, key: true, enabled: true, lastRunAt: true, lastError: true },
          }),
          outboxModule.getOutboxOperationalMetrics(prismaModule.prisma),
        ]);

        const report = sloModule.evaluateObservabilitySlos({
          connections: connections.map((c: { provider: string; status: string; lastSyncedAt: Date | null; lastError: string | null }) => ({
            provider: c.provider,
            status: c.status as 'CONNECTED' | 'DISCONNECTED' | 'ERROR',
            lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
            lastError: c.lastError,
          })),
          rules: rules.map((r: { provider: string; key?: string; enabled: boolean; lastRunAt: Date | null; lastError: string | null }) => ({
            provider: r.provider,
            key: r.key,
            enabled: r.enabled,
            lastRunAt: r.lastRunAt?.toISOString() ?? null,
            lastError: r.lastError,
          })),
          expectedRuleKeysByProvider: {},
          outboxMetrics,
        });

        // Map ObservabilitySlo[] to SloMetric[]
        return report.slos.map((slo: { key: string; label: string; breached: boolean }) => ({
          name: slo.label,
          metric: slo.key,
          target: 1,
          current: slo.breached ? 0 : 1,
          met: !slo.breached,
        }));
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
      { error: 'Metrics endpoint is not configured.' },
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
