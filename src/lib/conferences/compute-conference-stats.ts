import type { ConferenceListItem } from "@/types";

export interface ConferenceStats {
  /** Total number of conferences */
  total: number;
  /** Conferences with start date in the future */
  upcoming: number;
  /** Conferences currently running (started but not ended) */
  inProgress: number;
  /** Conferences that have already ended */
  past: number;
  /** Sum of leads across all conferences */
  totalLeads: number;
}

/**
 * Derive summary statistics from a list of conferences.
 * The `now` parameter is injectable for deterministic tests.
 */
export function computeConferenceStats(
  conferences: ConferenceListItem[],
  now: Date = new Date()
): ConferenceStats {
  const nowMs = now.getTime();
  let upcoming = 0;
  let inProgress = 0;
  let past = 0;
  let totalLeads = 0;

  for (const conf of conferences) {
    const startMs = Date.parse(conf.startDate);
    const endMs = Date.parse(conf.endDate);

    if (!Number.isNaN(startMs) && startMs > nowMs) {
      upcoming++;
    } else if (!Number.isNaN(endMs) && endMs < nowMs) {
      past++;
    } else {
      inProgress++;
    }

    totalLeads += conf._count?.leads ?? 0;
  }

  return { total: conferences.length, upcoming, inProgress, past, totalLeads };
}
