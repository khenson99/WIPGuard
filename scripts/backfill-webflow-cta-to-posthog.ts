import "dotenv/config";

import { pathToFileURL } from "node:url";
import {
  DEFAULT_POSTHOG_BATCH_SIZE,
  type SyntheticPostHogEvent,
  buildWebflowCtaBackfillEvents,
  normalizePostHogHost,
  sendPostHogBatch,
  summarizeWebflowCtaBackfill,
} from "@/lib/analytics/webflow-cta-backfill";

interface CliOptions {
  live: boolean;
  json: boolean;
  batchSize: number;
  refreshImladrisHistory: boolean;
  userIds: string[];
}

interface RefreshSummary {
  ran: boolean;
  reason?: string;
  ingestion?: {
    users: number;
    rawRecords: number;
    accepted: number;
    errors: number;
  };
  analytics?: {
    materializationEntries: number;
    errors: number;
  };
}

function readOption(args: string[], name: string): string | undefined {
  const inlinePrefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(inlinePrefix));
  if (inline) return inline.slice(inlinePrefix.length);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parsePositiveInt(name: string, raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return Math.floor(parsed);
}

function parseUserIds(args: string[]): string[] {
  return args
    .flatMap((arg, index) => {
      if (arg.startsWith("--user-id=")) return [arg.slice("--user-id=".length)];
      if (arg === "--user-id" && args[index + 1]) return [args[index + 1]];
      return [];
    })
    .map((userId) => userId.trim())
    .filter(Boolean);
}

function parseOptions(args: string[]): CliOptions {
  if (args.includes("--send")) {
    throw new Error("Use --live for the supported live mode. Dry run is the default.");
  }

  return {
    live: args.includes("--live"),
    json: args.includes("--json"),
    batchSize: parsePositiveInt("--batch-size", readOption(args, "--batch-size"), DEFAULT_POSTHOG_BATCH_SIZE),
    refreshImladrisHistory: args.includes("--refresh-imladris-history"),
    userIds: parseUserIds(args),
  };
}

function posthogHostFromEnv(env: NodeJS.ProcessEnv): string {
  return normalizePostHogHost(
    env.POSTHOG_CAPTURE_HOST?.trim() ||
      env.POSTHOG_HOST?.trim() ||
      env.POSTHOG_API_HOST?.trim() ||
      "https://us.posthog.com",
  );
}

function posthogProjectApiKeyFromEnv(env: NodeJS.ProcessEnv): string | null {
  const explicit = env.POSTHOG_PROJECT_API_KEY?.trim() || env.POSTHOG_CAPTURE_API_KEY?.trim();
  if (explicit) return explicit;

  const legacy = env.POSTHOG_API_KEY?.trim();
  return legacy?.startsWith("phc_") ? legacy : null;
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function refreshImladrisHistory(options: CliOptions): Promise<RefreshSummary> {
  const events = buildWebflowCtaBackfillEvents({ runId: "imladris-ingestion" });
  const summary = summarizeWebflowCtaBackfill();
  const windowStart = new Date(`${summary.dateRange.from}T00:00:00.000Z`);
  const windowEnd = new Date(`${summary.dateRange.to}T23:59:59.999Z`);
  const [
    { IntegrationProvider },
    { prisma },
    { ingestImladrisRawRecords },
    { buildImladrisRawRecordsFromPayload },
    { resolveIntegrationOrganizationId },
    { materializeImladrisCanonicalMetrics },
    { discoverConnectedUserIds },
    { withSyncAdvisoryLock },
  ] = await Promise.all([
    import("@/generated/prisma/client"),
    import("@/lib/prisma"),
    import("@/lib/imladris/ingestion"),
    import("@/lib/imladris/raw-records"),
    import("@/lib/integrations/ownership"),
    import("@/lib/imladris/materialization"),
    import("@/lib/sync/users"),
    import("@/lib/sync/sync-lock"),
  ]);

  try {
    const outcome = await withSyncAdvisoryLock(async () => {
      const userIds = options.userIds.length ? options.userIds : await discoverConnectedUserIds(prisma);
      const posthogEvents = events.map(posthogEventForRawIngestion);
      const rawRecords = buildImladrisRawRecordsFromPayload({
        provider: IntegrationProvider.POSTHOG,
        snapshotKey: "posthog",
        payload: {
          events: posthogEvents,
          eventCount: posthogEvents.length,
          conversionEventCount: posthogEvents.length,
          summary: {
            eventCount: posthogEvents.length,
            conversionEventCount: posthogEvents.length,
            backfill: summary,
          },
          _meta: {
            source: "webflow_cta_backfill",
            backfillVersion: "webflow-cta-backfill-v1",
            eventRowsMaterialized: posthogEvents.length,
          },
        },
        from: windowStart.toISOString(),
        to: windowEnd.toISOString(),
        capturedAt: new Date(),
      });

      const ingestion = [];
      const materializations = [];
      let materializationErrors = 0;
      for (const userId of userIds) {
        const organizationId = await resolveIntegrationOrganizationId(userId);
        ingestion.push(await ingestImladrisRawRecords({
          prisma,
          provider: IntegrationProvider.POSTHOG,
          context: {
            userId,
            organizationId,
          },
          records: rawRecords,
          mode: "historical",
          windowStart,
          windowEnd,
          checkpoint: {
            action: "webflow_cta_posthog_backfill",
            snapshotKey: "posthog",
            from: windowStart.toISOString(),
            to: windowEnd.toISOString(),
            events: posthogEvents.length,
          },
          now: new Date(),
        }));

        try {
          materializations.push(...(await materializeImladrisCanonicalMetrics({
            prisma,
            context: {
              userId,
              organizationId,
            },
            periodStart: windowStart,
            periodEnd: windowEnd,
            now: new Date(),
            departments: ["marketing"],
          })));
        } catch {
          materializationErrors += 1;
        }
      }

      return {
        ingestion: {
          users: userIds.length,
          rawRecords: rawRecords.length,
          accepted: ingestion.reduce((sum, result) => sum + result.acceptedCount, 0),
          errors: ingestion.reduce((sum, result) => sum + result.errorCount, 0),
        },
        analytics: {
          materializationEntries: materializations.length,
          errors: materializationErrors,
        },
      };
    });

    if (!outcome.ran) {
      return { ran: false, reason: outcome.reason };
    }

    return { ran: true, ...outcome.result };
  } finally {
    await prisma.$disconnect();
  }
}

function posthogEventForRawIngestion(event: SyntheticPostHogEvent): SyntheticPostHogEvent & { uuid: string } {
  const insertId = event.properties.$insert_id;
  return {
    uuid: typeof insertId === "string" && insertId.trim() ? insertId : `${event.event}:${event.distinct_id}:${event.timestamp}`,
    ...event,
  };
}

async function main(): Promise<number> {
  const options = parseOptions(process.argv.slice(2));
  const runId = new Date().toISOString();
  const events = buildWebflowCtaBackfillEvents({ runId });
  const summary = summarizeWebflowCtaBackfill();
  const batches = chunk(events, options.batchSize);
  const host = posthogHostFromEnv(process.env);
  const dryRun = !options.live;

  let sentBatches: Array<{ index: number; events: number; status: number }> = [];
  let refresh: RefreshSummary | null = null;

  if (options.live) {
    const projectApiKey = posthogProjectApiKeyFromEnv(process.env);
    if (!projectApiKey) {
      throw new Error(
        "POSTHOG_PROJECT_API_KEY is required for --live. POSTHOG_API_KEY is accepted only when it is a phc_ project key.",
      );
    }

    sentBatches = [];
    for (const [index, batch] of batches.entries()) {
      const status = await sendPostHogBatch({ host, projectApiKey, batch });
      sentBatches.push({ index: index + 1, events: batch.length, status });
    }

    if (options.refreshImladrisHistory) {
      refresh = await refreshImladrisHistory(options);
    }
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify({
      dryRun,
      host,
      runId,
      summary,
      batches: {
        count: batches.length,
        size: options.batchSize,
        sent: sentBatches,
      },
      refreshImladrisHistory: refresh,
      sample: events.slice(0, 3),
    }, null, 2)}\n`);
    return 0;
  }

  process.stdout.write("Webflow CTA -> PostHog backfill\n");
  process.stdout.write(`  mode: ${dryRun ? "dry-run" : "live"}\n`);
  process.stdout.write(`  events: ${events.length}\n`);
  process.stdout.write(`  date range: ${summary.dateRange.from} -> ${summary.dateRange.to}\n`);
  process.stdout.write(`  host: ${host}\n`);
  process.stdout.write(`  batches: ${batches.length} x up to ${options.batchSize}\n`);
  process.stdout.write("\nBreakdown:\n");
  for (const cta of summary.byCta) {
    process.stdout.write(`  ${String(cta.count).padStart(4)} x ${cta.ctaType} "${cta.ctaText}" on ${cta.page}\n`);
  }
  process.stdout.write("\nSample events:\n");
  for (const event of events.slice(0, 3)) {
    process.stdout.write(
      `  ${event.timestamp} ${String(event.properties.cta_type).padEnd(10)} "${event.properties.cta_text}" ${event.properties.page}\n`,
    );
  }

  if (dryRun) {
    process.stdout.write("\nDry run complete. Re-run with --live to send to PostHog.\n");
    return 0;
  }

  process.stdout.write("\nSent batches:\n");
  for (const batch of sentBatches) {
    process.stdout.write(`  batch ${batch.index}/${batches.length}: ${batch.events} events -> ${batch.status}\n`);
  }
  if (refresh) {
    process.stdout.write("\nImladris history refresh:\n");
    if (!refresh.ran) {
      process.stdout.write(`  skipped: ${refresh.reason ?? "sync lock was busy"}\n`);
    } else {
      process.stdout.write(`  raw ingestion: ${refresh.ingestion?.accepted ?? 0}/${refresh.ingestion?.rawRecords ?? 0} accepted across ${refresh.ingestion?.users ?? 0} user(s)\n`);
      process.stdout.write(`  materializations: ${refresh.analytics?.materializationEntries ?? 0} entries, ${refresh.analytics?.errors ?? 0} errors\n`);
    }
  }
  process.stdout.write(`\nBackfill run ID: ${runId}\n`);
  return 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Webflow CTA PostHog backfill failed: ${message}\n`);
      process.exitCode = 1;
    });
}
