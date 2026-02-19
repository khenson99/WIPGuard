import { prisma } from "@/lib/prisma";
import { fetchGoogleCseProspects } from "./google-cse-fetcher";
import { scrapeWebsites } from "./website-scraper";
import { fetchDirectoryProspects } from "./directory-scraper";
import { validateProspects, storeProspects } from "./prospect-validator";
import { pushProspectsToHubSpot } from "./hubspot-prospect-pusher";
import type {
  DiscoveryJobConfig,
  DiscoveryRunSummary,
  PushRunSummary,
  RawProspect,
} from "./types";

function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

// ── Discovery job ────────────────────────────────────────────────────────────

export async function runDiscoveryJob(
  config: DiscoveryJobConfig
): Promise<DiscoveryRunSummary> {
  const sources = config.sources ?? ["google_cse", "website_scrape", "directory"];
  const maxResults = config.maxResults ?? 50;

  let allProspects: RawProspect[] = [];
  let errors = 0;

  // Phase 1: Fetch from enabled sources
  if (sources.includes("google_cse")) {
    try {
      const cseResults = await timeout(
        fetchGoogleCseProspects({ maxResults }),
        30_000
      );
      allProspects.push(...cseResults);
    } catch (error) {
      console.error("[prospecting] Google CSE phase failed:", error);
      errors++;
    }
  }

  if (sources.includes("directory")) {
    try {
      const directoryResults = await timeout(fetchDirectoryProspects(), 30_000);
      allProspects.push(...directoryResults);
    } catch (error) {
      console.error("[prospecting] Directory phase failed:", error);
      errors++;
    }
  }

  // Phase 2: Enrich with website scraping
  if (sources.includes("website_scrape") && allProspects.length > 0) {
    try {
      allProspects = await timeout(scrapeWebsites(allProspects), 120_000);
    } catch (error) {
      console.error("[prospecting] Website scraping phase failed:", error);
      errors++;
    }
  }

  // Phase 3: Validate & deduplicate
  const { valid, duplicatesSkipped } = await validateProspects(
    config.userId,
    allProspects
  );

  // Phase 4: Store in database
  const stored = await storeProspects(config.userId, valid);

  return {
    discovered: stored,
    duplicatesSkipped,
    errors,
    completedAt: new Date().toISOString(),
  };
}

// ── Push job ─────────────────────────────────────────────────────────────────

export async function runPushJob(
  userId: string,
  options?: { limit?: number }
): Promise<PushRunSummary> {
  const results = await timeout(
    pushProspectsToHubSpot(userId, options),
    60_000
  );

  const pushed = results.filter((r) => r.status === "PUSHED" && !r.error).length;
  const skipped = results.filter((r) => r.error?.includes("Already pushed")).length;
  const errorCount = results.filter((r) => r.status === "ERROR").length;

  return {
    pushed,
    skipped,
    errors: errorCount,
    results,
    completedAt: new Date().toISOString(),
  };
}

// ── Status query ─────────────────────────────────────────────────────────────

export async function getProspectStats(userId: string) {
  const [total, byStatusRaw, recentCount, lastDiscovery, lastPush] =
    await Promise.all([
      prisma.manufacturerProspect.count({ where: { userId } }),
      prisma.manufacturerProspect.groupBy({
        by: ["status"],
        where: { userId },
        _count: true,
      }),
      prisma.manufacturerProspect.count({
        where: {
          userId,
          discoveredAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.manufacturerProspect.findFirst({
        where: { userId },
        orderBy: { discoveredAt: "desc" },
        select: { discoveredAt: true },
      }),
      prisma.manufacturerProspect.findFirst({
        where: { userId, status: "PUSHED" },
        orderBy: { pushedToHubspotAt: "desc" },
        select: { pushedToHubspotAt: true },
      }),
    ]);

  const byStatus: Record<string, number> = {};
  for (const row of byStatusRaw) {
    byStatus[row.status] = row._count;
  }

  return {
    total,
    byStatus,
    recentDiscoveries: recentCount,
    lastDiscoveryAt: lastDiscovery?.discoveredAt?.toISOString() ?? null,
    lastPushAt: lastPush?.pushedToHubspotAt?.toISOString() ?? null,
  };
}
