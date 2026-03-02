import type { CustomerJourneyRecord, TouchpointChannel } from "@/lib/analytics/types";

export interface MatchedJourney {
  id: string;
  dealName: string;
  contactEmail: string | null;
  value: number;
  currentStage: string;
  daysInPipeline: number;
  lastTouch: string;
}

/**
 * Derives the ordered, deduplicated channel sequence from a journey's touchpoints.
 * Mirrors the logic in buildTopPaths in customer-journey.ts.
 */
function getJourneySequence(journey: CustomerJourneyRecord): TouchpointChannel[] {
  const seen = new Set<TouchpointChannel>();
  const result: TouchpointChannel[] = [];
  for (const tp of journey.touchpoints) {
    if (!seen.has(tp.channel)) {
      seen.add(tp.channel);
      result.push(tp.channel);
    }
  }
  return result;
}

/**
 * Given a list of customer journey records and a target path (ordered channel sequence),
 * returns all journeys whose deduplicated channel sequence contains the path as a
 * contiguous subsequence.
 *
 * Mirrors the grouping logic in buildTopPaths so clicking a path row shows the
 * journeys that contributed to it.
 */
export function matchJourneysToPath(
  journeys: CustomerJourneyRecord[],
  pathChannels: TouchpointChannel[],
): MatchedJourney[] {
  if (!pathChannels.length || !journeys.length) return [];

  return journeys
    .filter((journey) => {
      const seq = getJourneySequence(journey);
      if (seq.length < pathChannels.length) return false;

      for (let i = 0; i <= seq.length - pathChannels.length; i++) {
        let match = true;
        for (let j = 0; j < pathChannels.length; j++) {
          if (seq[i + j] !== pathChannels[j]) {
            match = false;
            break;
          }
        }
        if (match) return true;
      }
      return false;
    })
    .map(({ dealId, dealName, contactEmail, value, currentStage, daysInPipeline, lastTouch }) => ({
      id: dealId,
      dealName,
      contactEmail,
      value,
      currentStage,
      daysInPipeline,
      lastTouch,
    }));
}
