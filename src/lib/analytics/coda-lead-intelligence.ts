import type { CodaEngagedLeadCandidate, HubSpotContactSummary } from "@/lib/analytics/types";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const HUBSPOT_SEARCH_ENDPOINT = "https://api.hubapi.com/crm/v3/objects/contacts/search";
const HUBSPOT_BATCH_READ_ENDPOINT = "https://api.hubapi.com/crm/v3/objects/contacts/batch/read";

type HubSpotContactLookupStatus = "inFunnel" | "notInFunnel" | "unknown";
type HubSpotContactLookupResult = {
  status: HubSpotContactLookupStatus;
  contact: HubSpotContactSummary | null;
};

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

      candidates: input.candidates.map((candidate) => ({
        ...candidate,
        funnelStatus: "unknown",
        hubspotContact: null,
      })),
      hubspotMatchingErrors: 0,
    };
  }

  const maxCandidates = Math.max(1, Math.min(input.maxCandidates ?? 25, input.candidates.length));
  const top = input.candidates.slice(0, maxCandidates);

  const lookup = await resolveHubspotContactsByEmail({
    accessToken: input.hubspotAccessToken!,
    emails: top.map((candidate) => candidate.email),
  });

  const merged = input.candidates.map((candidate) => {
    const result = lookup.results.get(candidate.email);
    return {
      ...candidate,
      funnelStatus: result?.status ?? "unknown",
      hubspotContact: result?.contact ?? null,
    };
  });

  return {
    candidates: merged,
    hubspotMatchingErrors: lookup.errors,
  };
}
