export const WEBFLOW_CTA_BACKFILL_VERSION = "webflow-cta-backfill-v1";
export const DEFAULT_POSTHOG_BATCH_SIZE = 500;

export interface WebflowCtaBackfillSummary {
  totalEvents: number;
  totalCtaCount: number;
  totalSessions: number;
  dateRange: {
    from: string;
    to: string;
  };
  daysCovered: number;
  byCta: Array<{
    ctaType: string;
    ctaText: string;
    page: string;
    count: number;
  }>;
}

export interface SyntheticPostHogEvent {
  event: "marketing_cta_clicked";
  distinct_id: string;
  timestamp: string;
  properties: Record<string, unknown>;
}

interface WebflowCtaAggregate {
  cta_type: string;
  cta_text: string;
  page: string;
  count: number;
  destination_url?: string;
}

interface DailyTrafficAggregate {
  date: string;
  sessions: number;
}

const CTA_EVENTS: WebflowCtaAggregate[] = [
  { cta_type: "trial", cta_text: "Start Free Trial", page: "/", count: 246 },
  { cta_type: "trial", cta_text: "Get Started for Free", page: "/pricing", count: 207 },
  { cta_type: "trial", cta_text: "Start Free Trial", page: "/create-kanban-cards", count: 90 },
  {
    cta_type: "trial",
    cta_text: "Start Free Trial",
    page: "/",
    count: 55,
    destination_url: "https://live.app.arda.cards/auth/signin",
  },
  { cta_type: "trial", cta_text: "Start Free", page: "/pricing", count: 65 },
  { cta_type: "free_cards", cta_text: "Make My Free Cards →", page: "/create-free-kanban-cards", count: 108 },
  { cta_type: "free_cards", cta_text: "Make Free Kanban Cards", page: "/", count: 72 },
];

const DAILY_TRAFFIC: DailyTrafficAggregate[] = [
  { date: "2026-03-19", sessions: 366 }, { date: "2026-03-20", sessions: 420 },
  { date: "2026-03-21", sessions: 274 }, { date: "2026-03-22", sessions: 308 },
  { date: "2026-03-23", sessions: 298 }, { date: "2026-03-24", sessions: 357 },
  { date: "2026-03-25", sessions: 297 }, { date: "2026-03-26", sessions: 345 },
  { date: "2026-03-27", sessions: 229 }, { date: "2026-03-28", sessions: 217 },
  { date: "2026-03-29", sessions: 226 }, { date: "2026-03-30", sessions: 306 },
  { date: "2026-03-31", sessions: 281 }, { date: "2026-04-01", sessions: 424 },
  { date: "2026-04-02", sessions: 362 }, { date: "2026-04-03", sessions: 284 },
  { date: "2026-04-04", sessions: 212 }, { date: "2026-04-05", sessions: 218 },
  { date: "2026-04-06", sessions: 322 }, { date: "2026-04-07", sessions: 356 },
  { date: "2026-04-08", sessions: 375 }, { date: "2026-04-09", sessions: 366 },
  { date: "2026-04-10", sessions: 387 }, { date: "2026-04-11", sessions: 244 },
  { date: "2026-04-12", sessions: 268 }, { date: "2026-04-13", sessions: 420 },
  { date: "2026-04-14", sessions: 451 }, { date: "2026-04-15", sessions: 483 },
  { date: "2026-04-16", sessions: 474 }, { date: "2026-04-17", sessions: 409 },
  { date: "2026-04-18", sessions: 322 }, { date: "2026-04-19", sessions: 391 },
  { date: "2026-04-20", sessions: 397 }, { date: "2026-04-21", sessions: 406 },
  { date: "2026-04-22", sessions: 580 }, { date: "2026-04-23", sessions: 442 },
  { date: "2026-04-24", sessions: 419 }, { date: "2026-04-25", sessions: 390 },
  { date: "2026-04-26", sessions: 333 }, { date: "2026-04-27", sessions: 369 },
  { date: "2026-04-28", sessions: 355 }, { date: "2026-04-29", sessions: 302 },
  { date: "2026-04-30", sessions: 330 }, { date: "2026-05-01", sessions: 262 },
  { date: "2026-05-02", sessions: 289 }, { date: "2026-05-03", sessions: 280 },
  { date: "2026-05-04", sessions: 274 }, { date: "2026-05-05", sessions: 384 },
  { date: "2026-05-06", sessions: 321 }, { date: "2026-05-07", sessions: 330 },
  { date: "2026-05-08", sessions: 326 }, { date: "2026-05-09", sessions: 247 },
  { date: "2026-05-10", sessions: 291 }, { date: "2026-05-11", sessions: 335 },
  { date: "2026-05-12", sessions: 472 }, { date: "2026-05-13", sessions: 438 },
  { date: "2026-05-14", sessions: 377 }, { date: "2026-05-15", sessions: 363 },
  { date: "2026-05-16", sessions: 367 }, { date: "2026-05-17", sessions: 357 },
  { date: "2026-05-18", sessions: 445 }, { date: "2026-05-19", sessions: 527 },
  { date: "2026-05-20", sessions: 663 }, { date: "2026-05-21", sessions: 559 },
  { date: "2026-05-22", sessions: 595 }, { date: "2026-05-23", sessions: 488 },
  { date: "2026-05-24", sessions: 304 }, { date: "2026-05-25", sessions: 293 },
  { date: "2026-05-26", sessions: 366 }, { date: "2026-05-27", sessions: 463 },
  { date: "2026-05-28", sessions: 343 }, { date: "2026-05-29", sessions: 225 },
  { date: "2026-05-30", sessions: 342 }, { date: "2026-05-31", sessions: 373 },
  { date: "2026-06-01", sessions: 347 }, { date: "2026-06-02", sessions: 406 },
  { date: "2026-06-03", sessions: 439 }, { date: "2026-06-04", sessions: 312 },
  { date: "2026-06-05", sessions: 630 }, { date: "2026-06-06", sessions: 527 },
  { date: "2026-06-07", sessions: 469 }, { date: "2026-06-08", sessions: 428 },
  { date: "2026-06-09", sessions: 391 }, { date: "2026-06-10", sessions: 338 },
  { date: "2026-06-11", sessions: 302 }, { date: "2026-06-12", sessions: 203 },
  { date: "2026-06-13", sessions: 159 }, { date: "2026-06-14", sessions: 211 },
  { date: "2026-06-15", sessions: 309 }, { date: "2026-06-16", sessions: 286 },
  { date: "2026-06-17", sessions: 337 }, { date: "2026-06-18", sessions: 264 },
  { date: "2026-06-19", sessions: 254 }, { date: "2026-06-20", sessions: 218 },
  { date: "2026-06-21", sessions: 201 }, { date: "2026-06-22", sessions: 277 },
  { date: "2026-06-23", sessions: 238 }, { date: "2026-06-24", sessions: 271 },
  { date: "2026-06-25", sessions: 320 }, { date: "2026-06-26", sessions: 241 },
];

function mulberry32(seed: number): () => number {
  return function random(): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ctaKey(cta: WebflowCtaAggregate): string {
  return `${cta.cta_type}:${cta.cta_text}:${cta.page}:${cta.destination_url ?? ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function totalSessions(): number {
  return DAILY_TRAFFIC.reduce((sum, day) => sum + day.sessions, 0);
}

export function summarizeWebflowCtaBackfill(): WebflowCtaBackfillSummary {
  return {
    totalEvents: CTA_EVENTS.reduce((sum, cta) => sum + cta.count, 0),
    totalCtaCount: CTA_EVENTS.reduce((sum, cta) => sum + cta.count, 0),
    totalSessions: totalSessions(),
    dateRange: {
      from: DAILY_TRAFFIC[0].date,
      to: DAILY_TRAFFIC[DAILY_TRAFFIC.length - 1].date,
    },
    daysCovered: DAILY_TRAFFIC.length,
    byCta: CTA_EVENTS.map((cta) => ({
      ctaType: cta.cta_type,
      ctaText: cta.cta_text,
      page: cta.page,
      count: cta.count,
    })),
  };
}

export function buildWebflowCtaBackfillEvents(input: {
  runId?: string;
  seed?: number;
} = {}): SyntheticPostHogEvent[] {
  const rand = mulberry32(input.seed ?? 20260627);
  const sessions = totalSessions();
  const runId = input.runId ?? new Date().toISOString();
  const events: SyntheticPostHogEvent[] = [];

  for (const cta of CTA_EVENTS) {
    const key = ctaKey(cta);
    const dailyCounts = DAILY_TRAFFIC.map((day) => ({
      date: day.date,
      count: Math.round(cta.count * (day.sessions / sessions)),
    }));

    let diff = cta.count - dailyCounts.reduce((sum, day) => sum + day.count, 0);
    while (diff !== 0) {
      const index = Math.floor(rand() * dailyCounts.length);
      if (diff > 0) {
        dailyCounts[index].count += 1;
        diff -= 1;
      } else if (dailyCounts[index].count > 0) {
        dailyCounts[index].count -= 1;
        diff += 1;
      }
    }

    for (const day of dailyCounts) {
      for (let eventIndex = 0; eventIndex < day.count; eventIndex += 1) {
        const hour = Math.floor(rand() * 12) + 8;
        const minute = Math.floor(rand() * 60);
        const second = Math.floor(rand() * 60);
        const timestamp = `${day.date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.000Z`;
        const stableEventId = `${WEBFLOW_CTA_BACKFILL_VERSION}:${day.date}:${key}:${eventIndex}`;

        events.push({
          event: "marketing_cta_clicked",
          distinct_id: `webflow_backfill_${day.date}_${key}_${eventIndex}`,
          timestamp,
          properties: {
            cta_type: cta.cta_type,
            cta_text: cta.cta_text,
            page: cta.page,
            destination_url: cta.destination_url ?? "",
            $source: "webflow_backfill",
            $host: "www.arda.cards",
            $current_url: `https://www.arda.cards${cta.page}`,
            $insert_id: stableEventId,
            $lib: "imladris-webflow-cta-backfill",
            backfill_run: runId,
            backfill_source: "webflow_analyze",
            imladris_backfill_version: WEBFLOW_CTA_BACKFILL_VERSION,
            synthetic: true,
          },
        });
      }
    }
  }

  return events.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

export function normalizePostHogHost(host: string): string {
  const normalized = host.trim().replace(/\/+$/g, "");
  if (!normalized) throw new Error("PostHog host is required");
  return normalized;
}

export async function sendPostHogBatch(input: {
  host: string;
  projectApiKey: string;
  batch: SyntheticPostHogEvent[];
}): Promise<number> {
  const host = normalizePostHogHost(input.host);
  const response = await fetch(`${host}/batch/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: input.projectApiKey,
      batch: input.batch,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PostHog /batch/ returned ${response.status}: ${text || response.statusText}`);
  }

  return response.status;
}
