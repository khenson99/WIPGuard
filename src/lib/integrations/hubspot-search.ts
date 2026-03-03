const HUBSPOT_DEALS_SEARCH_ENDPOINT = "https://api.hubapi.com/crm/v3/objects/deals/search";

export interface HubSpotDealSearchResult {
  id: string;
  properties?: Record<string, string | undefined>;
}

export interface HubSpotDealCheckpoint {
  lastModifiedAt?: string;
  lastDealId?: string;
}

type HubSpotSearchOperator = "IN" | "GTE";

type HubSpotSearchFilter = {
  propertyName: string;
  operator: HubSpotSearchOperator;
  value?: string;
  values?: string[];
};

type HubSpotSearchSort = {
  propertyName: string;
  direction: "ASCENDING" | "DESCENDING";
};

type HubSpotSearchResponse<T> = {
  results?: T[];
  paging?: { next?: { after?: string } };
};

function parseNumericTimestamp(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return null;
  // seconds vs ms
  return numeric < 1_000_000_000_000 ? Math.round(numeric * 1000) : Math.round(numeric);
}

export function parseHubSpotDatetimeToMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? Math.round(value * 1000) : Math.round(value);
  }
  if (typeof value === "string") {
    const numeric = parseNumericTimestamp(value);
    if (numeric !== null) return numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function compareHubSpotObjectId(a: string, b: string): number {
  const aTrim = a.trim();
  const bTrim = b.trim();
  if (/^\d+$/.test(aTrim) && /^\d+$/.test(bTrim)) {
    try {
      const left = BigInt(aTrim);
      const right = BigInt(bTrim);
      if (left < right) return -1;
      if (left > right) return 1;
      return 0;
    } catch {
      // fall back to string compare
    }
  }
  return aTrim.localeCompare(bTrim);
}

async function hubspotSearch<T>(input: {
  accessToken: string;
  body: Record<string, unknown>;
}): Promise<HubSpotSearchResponse<T>> {
  const response = await fetch(HUBSPOT_DEALS_SEARCH_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.body),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok || !payload || typeof payload !== "object") {
    throw new Error(`HubSpot search API failed (${response.status})`);
  }

  return payload as HubSpotSearchResponse<T>;
}

export async function searchDealsIncremental(input: {
  accessToken: string;
  properties: string[];
  monitoredPipelines: string[];
  monitoredStages?: string[];
  checkpoint: HubSpotDealCheckpoint;
  maxResults: number;
  bufferMs?: number;
  sortDirection?: "ASCENDING" | "DESCENDING";
}): Promise<{ deals: HubSpotDealSearchResult[]; checkpoint: HubSpotDealCheckpoint }> {
  const maxResults = Math.max(1, Math.min(500, Math.floor(input.maxResults)));
  const properties = Array.from(new Set([...input.properties, "hs_lastmodifieddate"]));

  const checkpointMs = parseHubSpotDatetimeToMs(input.checkpoint.lastModifiedAt);
  const bufferMs = typeof input.bufferMs === "number" && Number.isFinite(input.bufferMs) ? input.bufferMs : 60_000;
  const bufferedMs = checkpointMs !== null ? Math.max(0, checkpointMs - bufferMs) : null;

  const filters: HubSpotSearchFilter[] = [];
  if (input.monitoredPipelines.length > 0) {
    filters.push({
      propertyName: "pipeline",
      operator: "IN",
      values: input.monitoredPipelines,
    });
  }
  if (Array.isArray(input.monitoredStages) && input.monitoredStages.length > 0) {
    filters.push({
      propertyName: "dealstage",
      operator: "IN",
      values: input.monitoredStages,
    });
  }
  if (bufferedMs !== null) {
    filters.push({
      propertyName: "hs_lastmodifieddate",
      operator: "GTE",
      value: String(bufferedMs),
    });
  }

  if (filters.length === 0) {
    filters.push({
      propertyName: "hs_lastmodifieddate",
      operator: "GTE",
      value: "0",
    });
  }

  const sortDirection =
    input.sortDirection === "DESCENDING" ? "DESCENDING" : "ASCENDING";
  const sorts: HubSpotSearchSort[] = [
    { propertyName: "hs_lastmodifieddate", direction: sortDirection },
  ];

  const deals: HubSpotDealSearchResult[] = [];
  let after: string | undefined;

  while (deals.length < maxResults) {
    const limit = Math.min(100, maxResults - deals.length);
    const body: Record<string, unknown> = {
      filterGroups: [{ filters }],
      sorts,
      properties,
      limit,
    };
    if (after) body.after = after;

    const payload = await hubspotSearch<HubSpotDealSearchResult>({
      accessToken: input.accessToken,
      body,
    });

    const batch = Array.isArray(payload.results) ? payload.results : [];
    deals.push(...batch);

    after = payload.paging?.next?.after;
    if (!after || batch.length === 0) break;
  }

  // Apply strict checkpoint filtering (buffered query can include earlier deals).
  const strictMs = checkpointMs;
  const strictDealId = input.checkpoint.lastDealId ?? null;
  const filtered = deals.filter((deal) => {
    if (strictMs === null) return true;
    const modifiedMs = parseHubSpotDatetimeToMs(deal.properties?.hs_lastmodifieddate);
    if (modifiedMs === null) return true;
    if (modifiedMs < strictMs) return false;
    if (modifiedMs > strictMs) return true;
    if (!strictDealId) return true;
    return compareHubSpotObjectId(deal.id, strictDealId) > 0;
  });

  let newestMs = strictMs;
  let newestId = strictDealId ?? undefined;
  for (const deal of filtered) {
    const modifiedMs = parseHubSpotDatetimeToMs(deal.properties?.hs_lastmodifieddate);
    if (modifiedMs === null) continue;
    if (newestMs === null || modifiedMs > newestMs) {
      newestMs = modifiedMs;
      newestId = deal.id;
      continue;
    }
    if (newestMs !== null && modifiedMs === newestMs) {
      if (!newestId || compareHubSpotObjectId(deal.id, newestId) > 0) {
        newestId = deal.id;
      }
    }
  }

  const checkpointOut: HubSpotDealCheckpoint = {
    lastModifiedAt: newestMs !== null ? new Date(newestMs).toISOString() : input.checkpoint.lastModifiedAt,
    lastDealId: newestId ?? input.checkpoint.lastDealId,
  };

  return { deals: filtered.slice(0, maxResults), checkpoint: checkpointOut };
}
