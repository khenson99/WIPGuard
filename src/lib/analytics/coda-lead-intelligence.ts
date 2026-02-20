import type { CodaEngagedLeadCandidate } from "@/lib/analytics/types";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const HUBSPOT_SEARCH_ENDPOINT = "https://api.hubapi.com/crm/v3/objects/contacts/search";

export interface CodaLeadScoringInput {
  creator: string;
  email: string;
  cards30d: number;
  cardsPrevious30d: number;
  activeDays30d: number;
  lastActivityAt: string | null;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeEmail(email: string): string | null {
  const lower = email.trim().toLowerCase();
  if (!lower || !EMAIL_PATTERN.test(lower)) return null;
  return lower;
}

function daysSince(dateIso: string | null, now: Date): number {
  if (!dateIso) return 90;
  const parsed = Date.parse(dateIso);
  if (!Number.isFinite(parsed)) return 90;
  return Math.max(0, Math.floor((now.getTime() - parsed) / (24 * 60 * 60 * 1000)));
}

function acceleration(input: { current: number; previous: number }): {
  trendPct: number | null;
  normalized: number;
} {
  if (input.current === 0 && input.previous === 0) {
    return { trendPct: null, normalized: 0.5 };
  }

  if (input.previous === 0) {
    return { trendPct: null, normalized: 1 };
  }

  const trendPct = ((input.current - input.previous) / input.previous) * 100;
  const ratio = (input.current - input.previous) / (input.current + input.previous);
  const normalized = clamp01((ratio + 1) / 2);
  return { trendPct: round1(trendPct), normalized };
}

function reasonList(input: {
  volumeNorm: number;
  activeNorm: number;
  recencyNorm: number;
  trendPct: number | null;
}): string[] {
  const reasons: string[] = [];

  if (input.volumeNorm >= 0.7) reasons.push("high 30d volume");
  if (input.activeNorm >= 0.7) reasons.push("strong active-day consistency");
  if (input.recencyNorm >= 0.7) reasons.push("very recent activity");
  if (typeof input.trendPct === "number" && input.trendPct >= 20) {
    reasons.push("accelerating vs prior 30d");
  }

  if (reasons.length === 0) {
    reasons.push("solid baseline engagement");
  }

  return reasons;
}

export function buildHubspotSearchUrl(email: string): string {
  return `https://app.hubspot.com/contacts?query=${encodeURIComponent(email)}`;
}

export function scoreCodaEngagedLeads(input: {
  creators: CodaLeadScoringInput[];
  now?: Date;
}): CodaEngagedLeadCandidate[] {
  const now = input.now ?? new Date();
  const candidates = input.creators
    .map((item) => {
      const email = normalizeEmail(item.email);
      if (!email) return null;
      return {
        creator: item.creator,
        email,
        cards30d: Math.max(0, item.cards30d),
        cardsPrevious30d: Math.max(0, item.cardsPrevious30d),
        activeDays30d: Math.max(0, item.activeDays30d),
        lastActivityAt: item.lastActivityAt,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (candidates.length === 0) return [];

  const maxCards30d = Math.max(1, ...candidates.map((item) => item.cards30d));
  const maxActiveDays = Math.max(1, ...candidates.map((item) => item.activeDays30d));

  const scored = candidates.map((item): CodaEngagedLeadCandidate => {
    const volumeNorm = clamp01(item.cards30d / maxCards30d);
    const activeNorm = clamp01(item.activeDays30d / maxActiveDays);
    const recencyNorm = clamp01(1 - daysSince(item.lastActivityAt, now) / 30);
    const accel = acceleration({
      current: item.cards30d,
      previous: item.cardsPrevious30d,
    });

    const score =
      volumeNorm * 0.45 + activeNorm * 0.25 + recencyNorm * 0.2 + accel.normalized * 0.1;

    return {
      creator: item.creator,
      email: item.email,
      cards30d: item.cards30d,
      activeDays30d: item.activeDays30d,
      lastActivityAt: item.lastActivityAt,
      trend30dVsPrevious30d: accel.trendPct,
      engagementScore: round2(score * 100),
      reasons: reasonList({
        volumeNorm,
        activeNorm,
        recencyNorm,
        trendPct: accel.trendPct,
      }),
      funnelStatus: "unknown",
      hubspotSearchUrl: buildHubspotSearchUrl(item.email),
    };
  });

  return scored.sort((a, b) => b.engagementScore - a.engagementScore || b.cards30d - a.cards30d);
}

async function checkHubspotContactPresence(input: {
  accessToken: string;
  email: string;
}): Promise<"inFunnel" | "notInFunnel" | "unknown"> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);

  try {
    const response = await fetch(HUBSPOT_SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              {
                propertyName: "email",
                operator: "EQ",
                value: input.email,
              },
            ],
          },
        ],
        limit: 1,
        properties: ["email"],
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return "unknown";
    }

    const payload = (await response.json().catch(() => null)) as
      | { total?: number; results?: unknown[] }
      | null;
    if (!payload) return "unknown";

    const total = typeof payload.total === "number" ? payload.total : payload.results?.length ?? 0;
    return total > 0 ? "inFunnel" : "notInFunnel";
  } catch {
    return "unknown";
  } finally {
    clearTimeout(timeout);
  }
}

export async function enrichCodaLeadFunnelStatus(input: {
  candidates: CodaEngagedLeadCandidate[];
  hubspotAccessToken?: string | null;
  maxCandidates?: number;
}): Promise<{ candidates: CodaEngagedLeadCandidate[]; hubspotMatchingErrors: number }> {
  if (!input.hubspotAccessToken) {
    return {
      candidates: input.candidates.map((candidate) => ({ ...candidate, funnelStatus: "unknown" })),
      hubspotMatchingErrors: 0,
    };
  }

  const maxCandidates = Math.max(1, Math.min(input.maxCandidates ?? 25, input.candidates.length));
  const top = input.candidates.slice(0, maxCandidates);

  const settled = await Promise.all(
    top.map(async (candidate) => {
      const status = await checkHubspotContactPresence({
        accessToken: input.hubspotAccessToken!,
        email: candidate.email,
      });
      return {
        candidate,
        status,
      };
    })
  );

  let hubspotMatchingErrors = 0;
  const statusByEmail = new Map<string, "inFunnel" | "notInFunnel" | "unknown">();

  for (const row of settled) {
    statusByEmail.set(row.candidate.email, row.status);
    if (row.status === "unknown") {
      hubspotMatchingErrors += 1;
    }
  }

  const merged = input.candidates.map((candidate) => ({
    ...candidate,
    funnelStatus: statusByEmail.get(candidate.email) ?? "unknown",
  }));

  return {
    candidates: merged,
    hubspotMatchingErrors,
  };
}
