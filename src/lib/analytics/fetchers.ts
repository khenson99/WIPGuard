// ─── Data Fetchers for Analytics Dashboard ────────────────
// Server-side functions that pull live data from HubSpot, Stripe, Mercury
// Used by API routes and server components

import type {
  HubSpotData,
  StripeData,
  MercuryData,
  AnalyticsTimestamp,
  DealStage,
} from "./types";

function makeMeta(source: "live" | "cached" = "live"): AnalyticsTimestamp {
  const now = new Date();
  return {
    fetchedAt: now.toISOString(),
    nextRefresh: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    source,
  };
}

// ═══════════════════════════════════════════════════════════
// HUBSPOT FETCHER
// ═══════════════════════════════════════════════════════════

const HUBSPOT_STAGE_MAP: Record<string, string> = {
  appointmentscheduled: "Prospect",
  qualifiedtobuy: "Lead",
  presentationscheduled: "Demo Scheduled",
  "1955958510": "No-Show/Reschedule",
  decisionmakerboughtin: "Demo Follow-Up",
  "176498593": "Budgetary Quote Sent",
  "176498594": "Payment Link Sent",
  "1524801846": "Free Trial",
  "1499784891": "Unlikely",
  "1722537990": "Freemium",
  contractsent: "Subscription",
  closedwon: "Closed Won",
  closedlost: "Closed Lost",
  "1499784892": "Ping Later",
  "1574807548": "Churn",
  "1916862197": "On Hold",
};

type HubSpotDealObject = {
  id?: string;
  properties?: Record<string, string>;
  propertiesWithHistory?: Record<string, Array<{ value?: string; timestamp?: string | number }>>;
};

type HubSpotDealsListResponse = {
  results?: HubSpotDealObject[];
  paging?: { next?: { after?: string } };
};

type HubSpotStageHistoryEntry = { value?: string; timestamp?: string | number };

type HubSpotStageEvent = {
  dealId: string;
  occurredAt: number;
  fromStage: string | null;
  toStage: string;
  ownerId: string | null;
  amount: number;
  source: string;
  dealName: string;
};

async function fetchAllHubSpotDeals(input: {
  baseUrl: string;
  headers: Record<string, string>;
  archived: boolean;
  properties: string;
  propertiesWithHistory?: string;
  maxTotalDeals?: number;
}): Promise<{
  deals: HubSpotDealObject[];
  pagesFetched: number;
  lastAfter: string | null;
}> {
  const deals: HubSpotDealObject[] = [];
  let after: string | undefined;
  let pagesFetched = 0;

  for (;;) {
    const url = new URL(`${input.baseUrl}/crm/v3/objects/deals`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("properties", input.properties);
    url.searchParams.set("archived", input.archived ? "true" : "false");
    if (input.propertiesWithHistory) {
      url.searchParams.set("propertiesWithHistory", input.propertiesWithHistory);
    }
    if (after) url.searchParams.set("after", after);

    const res = await fetch(url.toString(), { headers: input.headers, cache: "no-store" });

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown");
      throw new Error(`HubSpot deals API error ${res.status}: ${errText}`);
    }

    const data = (await res.json().catch(() => null)) as HubSpotDealsListResponse | null;
    const results = data?.results ?? [];
    deals.push(...results);
    pagesFetched += 1;

    after = data?.paging?.next?.after;
    if (!after || results.length === 0) break;
    if (input.maxTotalDeals && deals.length >= input.maxTotalDeals) break;
  }

  return { deals, pagesFetched, lastAfter: after ?? null };
}

function parseHubSpotTimestamp(value: string | number | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // HubSpot often returns ms timestamps; guard seconds timestamps too.
    return value < 1_000_000_000_000 ? Math.round(value * 1000) : Math.round(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric < 1_000_000_000_000 ? Math.round(numeric * 1000) : Math.round(numeric);
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractHubSpotStageEvents(deal: HubSpotDealObject): HubSpotStageEvent[] {
  const dealId = String(deal.id ?? "").trim();
  if (!dealId) return [];
  const props = deal.properties || {};
  const amount = parseFloat(props.amount) || 0;
  const ownerId = props.hubspot_owner_id || null;
  const source = props.hs_analytics_source || "Unknown";
  const dealName = props.dealname || "Untitled deal";

  const history = (deal.propertiesWithHistory?.dealstage ?? []) as HubSpotStageHistoryEntry[];
  const normalized = history
    .map((entry) => {
      const stage = entry.value ? String(entry.value).trim() : "";
      const ts = parseHubSpotTimestamp(entry.timestamp);
      if (!stage || !ts) return null;
      return { stage, ts };
    })
    .filter(Boolean) as Array<{ stage: string; ts: number }>;

  if (normalized.length === 0) return [];
  normalized.sort((a, b) => a.ts - b.ts);

  const events: HubSpotStageEvent[] = [];
  for (let i = 0; i < normalized.length; i++) {
    const current = normalized[i];
    const previous = i > 0 ? normalized[i - 1] : null;
    events.push({
      dealId,
      occurredAt: current.ts,
      fromStage: previous?.stage ?? null,
      toStage: current.stage,
      ownerId,
      amount,
      source,
      dealName,
    });
  }
  return events;
}

type HubSpotOwnerRecord = { id: string; name: string; email: string | null };

async function fetchHubSpotOwners(input: {
  baseUrl: string;
  headers: Record<string, string>;
}): Promise<{ owners: HubSpotOwnerRecord[]; source: "v3" | "v2" | "none" }> {
  // Best-effort: owners enrich the rep scoreboard. If this fails, we can still group by ownerId.
  try {
    const owners: HubSpotOwnerRecord[] = [];
    let after: string | undefined;
    for (let page = 0; page < 25; page++) {
      const url = new URL(`${input.baseUrl}/crm/v3/owners/`);
      url.searchParams.set("limit", "100");
      if (after) url.searchParams.set("after", after);
      const res = await fetch(url.toString(), { headers: input.headers, cache: "no-store" });
      if (!res.ok) break;
      const data = (await res.json().catch(() => null)) as
        | { results?: Array<{ id?: string; firstName?: string; lastName?: string; email?: string }>; paging?: { next?: { after?: string } } }
        | null;
      const results = data?.results ?? [];
      for (const row of results) {
        const id = String(row.id ?? "").trim();
        if (!id) continue;
        const full = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();
        const email = row.email?.trim() || null;
        owners.push({
          id,
          name: full || email || `Owner ${id}`,
          email,
        });
      }
      after = data?.paging?.next?.after;
      if (!after || results.length === 0) break;
    }
    return { owners, source: "v3" };
  } catch {
    // fall through
  }

  try {
    const res = await fetch(`${input.baseUrl}/owners/v2/owners?count=500&offset=0`, {
      headers: input.headers,
      cache: "no-store",
    });
    if (!res.ok) return { owners: [], source: "none" };
    const data = (await res.json().catch(() => null)) as
      | Array<{ ownerId?: number; firstName?: string; lastName?: string; email?: string }>
      | null;
    const owners: HubSpotOwnerRecord[] = [];
    for (const row of data ?? []) {
      const id = String(row.ownerId ?? "").trim();
      if (!id) continue;
      const full = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();
      const email = row.email?.trim() || null;
      owners.push({ id, name: full || email || `Owner ${id}`, email });
    }
    return { owners, source: "v2" };
  } catch {
    return { owners: [], source: "none" };
  }
}

export async function fetchHubSpotData(
  accessToken: string,
  options?: { fromDate?: Date; toDate?: Date }
): Promise<HubSpotData> {
  const token = accessToken.trim();
  const baseUrl = "https://api.hubapi.com";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const properties =
    "dealstage,amount,dealname,closedate,createdate,hs_analytics_source,num_associated_contacts,hubspot_owner_id,hs_lastmodifieddate,stripe_customer_id,stripe_customer";
  const historyKey = "dealstage";

  const [activeDealsResult, archivedDealsResult] = await Promise.all([
    fetchAllHubSpotDeals({
      baseUrl,
      headers,
      archived: false,
      properties,
      propertiesWithHistory: historyKey,
      maxTotalDeals: 10_000,
    }),
    fetchAllHubSpotDeals({
      baseUrl,
      headers,
      archived: true,
      properties,
      propertiesWithHistory: historyKey,
      maxTotalDeals: 10_000,
    }),
  ]);

  const allDealsById = new Map<string, HubSpotDealObject>();
  for (const deal of [...activeDealsResult.deals, ...archivedDealsResult.deals]) {
    const id = String(deal.id ?? "").trim();
    if (!id) continue;
    allDealsById.set(id, deal);
  }
  const allDeals = [...allDealsById.values()];
  const dealsFetched = allDeals.length;

  // Aggregate by stage
  const stageAgg: Record<string, { count: number; value: number }> = {};
  const sourceAgg: Record<string, { count: number; value: number }> = {};

  for (const deal of allDeals) {
    const props = deal.properties || {};
    const stage = props.dealstage || "unknown";
    const amount = parseFloat(props.amount) || 0;
    const source = props.hs_analytics_source || "Unknown";

    if (!stageAgg[stage]) stageAgg[stage] = { count: 0, value: 0 };
    stageAgg[stage].count++;
    stageAgg[stage].value += amount;

    if (!sourceAgg[source]) sourceAgg[source] = { count: 0, value: 0 };
    sourceAgg[source].count++;
    sourceAgg[source].value += amount;
  }

  const stages: DealStage[] = Object.entries(stageAgg).map(([id, data]) => ({
    stageId: id,
    label: HUBSPOT_STAGE_MAP[id] || id,
    count: data.count,
    value: data.value,
  }));

  const deals = allDeals.map((deal) => {
    const props = deal.properties || {};
    const stageId = props.dealstage || "unknown";
    return {
      dealId: String((deal as { id?: string }).id ?? ""),
      dealName: props.dealname || "Untitled deal",
      stageId,
      stageLabel: HUBSPOT_STAGE_MAP[stageId] || stageId,
      amount: parseFloat(props.amount) || 0,
      source: props.hs_analytics_source || "Unknown",
      ownerId: props.hubspot_owner_id || null,
      updatedAt: props.hs_lastmodifieddate ? new Date(props.hs_lastmodifieddate).toISOString() : null,
      createdAt: props.createdate ? new Date(props.createdate).toISOString() : null,
      stripeCustomerId: props.stripe_customer_id || props.stripe_customer || null,
    };
  });

  const rangeFrom = options?.fromDate ?? null;
  const rangeTo = options?.toDate ?? null;
  const useActivityInRange =
    Boolean(rangeFrom && rangeTo) &&
    !Number.isNaN(rangeFrom?.getTime() ?? NaN) &&
    !Number.isNaN(rangeTo?.getTime() ?? NaN) &&
    Boolean(rangeFrom && rangeTo && rangeFrom <= rangeTo);

  const STAGE_CLOSED_WON = "closedwon";
  const STAGE_CLOSED_LOST = "closedlost";
  const STAGE_UNLIKELY = "1499784891";
  const STAGE_CHURN = "1574807548";
  const STAGE_SUBSCRIPTION = "contractsent";
  const STAGE_NO_SHOW = "1955958510";
  const STAGE_DEMO_SCHEDULED = "presentationscheduled";
  const STAGE_DEMO_FOLLOW_UP = "decisionmakerboughtin";

  let funnelStages = stages;
  let dealsBySource = Object.entries(sourceAgg).map(([source, data]) => ({
    source,
    count: data.count,
    value: data.value,
  }));
  let totalDeals = dealsFetched;
  let closedWon = stageAgg[STAGE_CLOSED_WON]?.count || 0;
  let closedLost = stageAgg[STAGE_CLOSED_LOST]?.count || 0;
  let unlikely = stageAgg[STAGE_UNLIKELY]?.count || 0;
  let churn = stageAgg[STAGE_CHURN]?.count || 0;
  let subscriptions = stageAgg[STAGE_SUBSCRIPTION]?.count || 0;
  let noShows = stageAgg[STAGE_NO_SHOW]?.count || 0;
  let demoScheduled = stageAgg[STAGE_DEMO_SCHEDULED]?.count || 0;
  let demoFollowUp = stageAgg[STAGE_DEMO_FOLLOW_UP]?.count || 0;
  let wonValue = stageAgg[STAGE_CLOSED_WON]?.value || 0;

  let repScoreboard: HubSpotData["repScoreboard"] = undefined;
  let ownerLookupDiagnostics: { ownersFetched: number; source: string } | null = null;

  if (useActivityInRange && rangeFrom && rangeTo) {
    const fromMs = rangeFrom.getTime();
    const toMs = rangeTo.getTime();
    const stageEntryAgg: Record<string, { count: number; value: number }> = {};
    const touchedDeals = new Map<string, { ownerId: string | null; amount: number; source: string; dealName: string }>();
    const eventsInRange: HubSpotStageEvent[] = [];
    const hadWonBeforeChurnInRange = new Set<string>();

    for (const deal of allDeals) {
      const events = extractHubSpotStageEvents(deal);
      if (events.length === 0) continue;

      // Detect churned-won: churn entry in range with a prior won stage.
      const wonAt = events.find((e) => e.toStage === STAGE_CLOSED_WON)?.occurredAt ?? null;

      for (const ev of events) {
        if (ev.occurredAt < fromMs || ev.occurredAt > toMs) continue;
        eventsInRange.push(ev);

        // touched deal set
        touchedDeals.set(ev.dealId, {
          ownerId: ev.ownerId,
          amount: ev.amount,
          source: ev.source,
          dealName: ev.dealName,
        });

        if (!stageEntryAgg[ev.toStage]) stageEntryAgg[ev.toStage] = { count: 0, value: 0 };
        stageEntryAgg[ev.toStage].count += 1;
        stageEntryAgg[ev.toStage].value += ev.amount;

        if (ev.toStage === STAGE_CHURN && wonAt && wonAt < ev.occurredAt) {
          hadWonBeforeChurnInRange.add(ev.dealId);
        }
      }
    }

    // Overwrite funnel KPIs with activity-in-range metrics.
    totalDeals = touchedDeals.size;
    closedWon = stageEntryAgg[STAGE_CLOSED_WON]?.count || 0;
    closedLost = stageEntryAgg[STAGE_CLOSED_LOST]?.count || 0;
    unlikely = stageEntryAgg[STAGE_UNLIKELY]?.count || 0;
    churn = stageEntryAgg[STAGE_CHURN]?.count || 0;
    subscriptions = stageEntryAgg[STAGE_SUBSCRIPTION]?.count || 0;
    noShows = stageEntryAgg[STAGE_NO_SHOW]?.count || 0;
    demoScheduled = stageEntryAgg[STAGE_DEMO_SCHEDULED]?.count || 0;
    demoFollowUp = stageEntryAgg[STAGE_DEMO_FOLLOW_UP]?.count || 0;
    wonValue = stageEntryAgg[STAGE_CLOSED_WON]?.value || 0;

    funnelStages = Object.entries(stageEntryAgg).map(([id, data]) => ({
      stageId: id,
      label: HUBSPOT_STAGE_MAP[id] || id,
      count: data.count,
      value: data.value,
    }));

    const sourceAggTouched: Record<string, { count: number; value: number }> = {};
    for (const touched of touchedDeals.values()) {
      const source = touched.source || "Unknown";
      if (!sourceAggTouched[source]) sourceAggTouched[source] = { count: 0, value: 0 };
      sourceAggTouched[source].count += 1;
      sourceAggTouched[source].value += touched.amount;
    }
    dealsBySource = Object.entries(sourceAggTouched).map(([source, data]) => ({
      source,
      count: data.count,
      value: data.value,
    }));

    const { owners, source } = await fetchHubSpotOwners({ baseUrl, headers });
    const ownerNameById = new Map<string, string>(owners.map((o) => [o.id, o.name]));
    ownerLookupDiagnostics = { ownersFetched: owners.length, source };

    const scoreboardByOwner = new Map<
      string,
      {
        ownerId: string | null;
        ownerName: string;
        dealIds: Set<string>;
        totalPipeline: number;
        demos: number;
        noShows: number;
        wonCount: number;
        wonRevenue: number;
        lostCount: number;
        churnedWon: number;
      }
    >();

    function bucket(ownerId: string | null): string {
      return ownerId ? `owner:${ownerId}` : "owner:unassigned";
    }

    function ensure(ownerId: string | null) {
      const key = bucket(ownerId);
      const existing = scoreboardByOwner.get(key);
      if (existing) return existing;
      const ownerName = ownerId ? ownerNameById.get(ownerId) || `Owner ${ownerId}` : "Unassigned";
      const created = {
        ownerId,
        ownerName,
        dealIds: new Set<string>(),
        totalPipeline: 0,
        demos: 0,
        noShows: 0,
        wonCount: 0,
        wonRevenue: 0,
        lostCount: 0,
        churnedWon: 0,
      };
      scoreboardByOwner.set(key, created);
      return created;
    }

    // Pipeline totals: sum amounts for touched deals.
    for (const [dealId, touched] of touchedDeals.entries()) {
      const row = ensure(touched.ownerId);
      row.dealIds.add(dealId);
      row.totalPipeline += touched.amount;
    }

    // Event counters.
    for (const ev of eventsInRange) {
      const row = ensure(ev.ownerId);
      if (ev.toStage === STAGE_DEMO_SCHEDULED) row.demos += 1;
      if (ev.toStage === STAGE_NO_SHOW) row.noShows += 1;
      if (ev.toStage === STAGE_CLOSED_WON) {
        row.wonCount += 1;
        row.wonRevenue += ev.amount;
      }
      if (ev.toStage === STAGE_CLOSED_LOST) row.lostCount += 1;
    }

    // Churned-won attribution: attribute to current owner bucket.
    for (const dealId of hadWonBeforeChurnInRange) {
      const touched = touchedDeals.get(dealId);
      const row = ensure(touched?.ownerId ?? null);
      row.churnedWon += 1;
    }

    repScoreboard = [...scoreboardByOwner.values()]
      .map((row) => {
        const totalDeals = row.dealIds.size;
        const avgDealSize = totalDeals > 0 ? row.totalPipeline / totalDeals : 0;
        const noShowRate = row.demos + row.noShows > 0 ? (row.noShows / (row.demos + row.noShows)) * 100 : 0;
        const winRate = row.wonCount + row.lostCount > 0 ? (row.wonCount / (row.wonCount + row.lostCount)) * 100 : 0;
        const avgWon = row.wonCount > 0 ? row.wonRevenue / row.wonCount : 0;
        const demoToWonRate = row.demos > 0 ? (row.wonCount / row.demos) * 100 : 0;
        const churnRate = row.wonCount > 0 ? (row.churnedWon / row.wonCount) * 100 : 0;
        return {
          ownerId: row.ownerId,
          ownerName: row.ownerName,
          totalDeals,
          totalPipeline: row.totalPipeline,
          avgDealSize,
          demos: row.demos,
          noShows: row.noShows,
          noShowRate,
          wonCount: row.wonCount,
          wonRevenue: row.wonRevenue,
          avgWon,
          lostCount: row.lostCount,
          winRate,
          demoToWonRate,
          churnedWon: row.churnedWon,
          churnRate,
        };
      })
      .sort((a, b) => b.totalPipeline - a.totalPipeline);

    // Reduce deal list to touched deals (keeps UI payload aligned to selected range).
    const touchedIds = new Set(touchedDeals.keys());
    const filteredDeals = deals.filter((d) => touchedIds.has(d.dealId));
    deals.length = 0;
    deals.push(...filteredDeals);

  }

  const winRate = closedWon + closedLost > 0 ? (closedWon / (closedWon + closedLost)) * 100 : 0;
  const terminal = closedWon + closedLost + unlikely + churn;
  const effectiveWinRate = terminal > 0 ? (closedWon / terminal) * 100 : 0;
  const noShowRate = demoScheduled + noShows > 0 ? (noShows / (demoScheduled + noShows)) * 100 : 0;
  const avgDealSize = closedWon > 0 ? wonValue / closedWon : 0;

  // ── Fetch recent contacts count using list endpoint ──
  let recentContacts = 0;
  try {
    const contactsUrl = `${baseUrl}/crm/v3/objects/contacts?limit=1&properties=createdate`;
    const contactsRes = await fetch(contactsUrl, { headers });
    if (contactsRes.ok) {
      const contactsData = await contactsRes.json();
      // The list endpoint returns total count in the response
      recentContacts = contactsData.total || 0;
    }
  } catch {
    // Non-critical — skip
  }

  const meta = makeMeta("live");
  meta.diagnostics = {
    dealsFetched,
    archivedIncluded: true,
    activityMode: useActivityInRange ? "activity_in_range" : "snapshot_current_stage",
    pagesFetched: {
      active: activeDealsResult.pagesFetched,
      archived: archivedDealsResult.pagesFetched,
    },
    activeDealsRaw: activeDealsResult.deals.length,
    archivedDealsRaw: archivedDealsResult.deals.length,
    lastAfter: {
      active: activeDealsResult.lastAfter,
      archived: archivedDealsResult.lastAfter,
    },
    range: useActivityInRange
      ? {
          from: rangeFrom?.toISOString() ?? null,
          to: rangeTo?.toISOString() ?? null,
        }
      : null,
    ownerLookup: ownerLookupDiagnostics,
  };

  return {
    funnel: {
      totalDeals,
      closedWon,
      closedLost,
      unlikely,
      churn,
      activeSubscriptions: subscriptions,
      noShows,
      demoScheduled,
      demoFollowUp,
      avgDealSize,
      winRate,
      effectiveWinRate,
      noShowRate,
      stages: funnelStages,
      dealsBySource,
    },
    contacts: {
      totalContacts: recentContacts,
      recentContacts,
      bySource: [],
    },
    repScoreboard,
    deals,
    _meta: meta,
  };
}

// ═══════════════════════════════════════════════════════════
// STRIPE FETCHER
// ═══════════════════════════════════════════════════════════

interface StripeSubItem {
  price: {
    unit_amount: number;
    recurring?: { interval?: string; interval_count?: number };
  };
}

interface StripeSub {
  items: { data: StripeSubItem[] };
  customer: string;
  canceled_at: number;
}

interface StripeCharge {
  id?: string;
  amount: number;
  created: number;
  status: string;
}

export async function fetchStripeData(
  apiKey: string,
  options?: { fromDate?: Date; toDate?: Date }
): Promise<StripeData> {
  const headers = { Authorization: `Bearer ${apiKey}` };
  const baseUrl = "https://api.stripe.com/v1";
  const now = Math.floor(Date.now() / 1000);
  const rangeFrom = options?.fromDate ?? null;
  const rangeTo = options?.toDate ?? null;
  const useRange =
    Boolean(rangeFrom && rangeTo) &&
    !Number.isNaN(rangeFrom?.getTime() ?? NaN) &&
    !Number.isNaN(rangeTo?.getTime() ?? NaN) &&
    Boolean(rangeFrom && rangeTo && rangeFrom <= rangeTo);

  const rangeStart = useRange ? Math.floor(rangeFrom!.getTime() / 1000) : now - 30 * 24 * 60 * 60;
  const rangeEnd = useRange ? Math.floor(rangeTo!.getTime() / 1000) : now;
  const rangeDays = Math.max(1, Math.ceil((rangeEnd - rangeStart) / (24 * 60 * 60)));
  const previousStart = rangeStart - rangeDays * 24 * 60 * 60;
  const previousEnd = rangeEnd - rangeDays * 24 * 60 * 60;

  const fetchStripe = async (url: string): Promise<Response> =>
    fetch(url, { headers, cache: "no-store" });

  const fetchActiveSubscriptions = async (): Promise<StripeSub[]> => {
    const subsRes = await fetchStripe(`${baseUrl}/subscriptions?limit=100&status=active`);
    if (!subsRes.ok) {
      throw new Error(`Stripe subscriptions error ${subsRes.status}`);
    }
    const subsData = await subsRes.json();
    return subsData.data || [];
  };

  const fetchCanceledSubscriptions = async (): Promise<StripeSub[]> => {
    const canceledRes = await fetchStripe(`${baseUrl}/subscriptions?limit=50&status=canceled`);
    const canceledData = await canceledRes.json();
    return canceledData.data || [];
  };

  const fetchPastDueAndTrialingCounts = async (): Promise<{
    pastDueCount: number;
    trialingCount: number;
  }> => {
    let pastDueCount = 0;
    let trialingCount = 0;
    try {
      const [pastDueRes, trialingRes] = await Promise.all([
        fetchStripe(`${baseUrl}/subscriptions?limit=1&status=past_due`),
        fetchStripe(`${baseUrl}/subscriptions?limit=1&status=trialing`),
      ]);
      if (pastDueRes.ok) {
        const pd = await pastDueRes.json();
        pastDueCount = pd.data?.length || 0;
        // Stripe doesn't return total count on list, but we fetch all if needed
        if (pd.has_more) pastDueCount = 99; // approximate; indicates "many"
      }
      if (trialingRes.ok) {
        const tr = await trialingRes.json();
        trialingCount = tr.data?.length || 0;
        if (tr.has_more) trialingCount = 99;
      }
    } catch {
      // Non-critical
    }
    return { pastDueCount, trialingCount };
  };

  const fetchCharges = async (createdGte: number, createdLte: number): Promise<StripeCharge[]> => {
    const allCharges: StripeCharge[] = [];
    let startingAfter: string | undefined;
    for (let page = 0; page < 10; page++) {
      let chargesUrl = `${baseUrl}/charges?limit=100&created[gte]=${createdGte}&created[lte]=${createdLte}`;
      if (startingAfter) chargesUrl += `&starting_after=${startingAfter}`;

      const chargesRes = await fetchStripe(chargesUrl);
      if (!chargesRes.ok) break;
      const chargesData = await chargesRes.json();
      const batch = chargesData.data || [];
      allCharges.push(...batch);

      if (!chargesData.has_more || batch.length === 0) break;
      startingAfter = batch[batch.length - 1].id;
    }
    return allCharges;
  };

  const [activeSubs, canceledSubs, counts, chargesInRange, chargesPrevRange] = await Promise.all([
    fetchActiveSubscriptions(),
    fetchCanceledSubscriptions(),
    fetchPastDueAndTrialingCounts(),
    fetchCharges(rangeStart, rangeEnd),
    fetchCharges(previousStart, previousEnd),
  ]);

  // ── Calculate MRR — normalize yearly/quarterly subscriptions to monthly ──
  const mrr = activeSubs.reduce((sum: number, s: StripeSub) => {
    const item = s.items?.data?.[0];
    if (!item?.price) return sum;
    const unitAmount = (item.price.unit_amount || 0) / 100;
    const interval = item.price.recurring?.interval || "month";
    const intervalCount = item.price.recurring?.interval_count || 1;

    // Convert any interval to monthly
    let monthlyAmount = unitAmount;
    if (interval === "year") {
      monthlyAmount = unitAmount / (12 * intervalCount);
    } else if (interval === "week") {
      monthlyAmount = (unitAmount * 52) / (12 * intervalCount);
    } else if (interval === "day") {
      monthlyAmount = (unitAmount * 365) / (12 * intervalCount);
    } else {
      // "month" — divide by interval_count if multi-month
      monthlyAmount = unitAmount / intervalCount;
    }
    return sum + monthlyAmount;
  }, 0);

  const { pastDueCount, trialingCount } = counts;

  // ── Bucket charges by month for trend ──
  const monthBuckets: Record<string, number> = {};

  let revInRange = 0, revPrev = 0, succeeded = 0, failed = 0;
  for (const charge of chargesInRange) {
    const amt = (charge.amount || 0) / 100;
    const chargeDate = new Date(charge.created * 1000);
    const monthKey = chargeDate.toLocaleDateString("en-US", { month: "short", year: "2-digit" });

    if (charge.status === "succeeded") {
      monthBuckets[monthKey] = (monthBuckets[monthKey] || 0) + amt;
    }

    if (charge.status === "succeeded") { revInRange += amt; succeeded++; }
      else if (charge.status === "failed") failed++;
  }
  for (const charge of chargesPrevRange) {
    if (charge.status === "succeeded") {
      revPrev += (charge.amount || 0) / 100;
    }
  }

  const revenueGrowth = revPrev > 0 ? ((revInRange - revPrev) / revPrev) * 100 : 0;

  // ── Build revenue trend (last 6 months) ──
  const trend: { month: string; revenue: number }[] = [];
  if (useRange) {
    // Bucket by day for custom ranges.
    const dayBuckets: Record<string, number> = {};
    for (const charge of chargesInRange) {
      if (charge.status !== "succeeded") continue;
      const dayKey = new Date(charge.created * 1000).toISOString().slice(0, 10);
      dayBuckets[dayKey] = (dayBuckets[dayKey] || 0) + (charge.amount || 0) / 100;
    }
    const keys = Object.keys(dayBuckets).sort();
    for (const key of keys) {
      trend.push({ month: key, revenue: dayBuckets[key] || 0 });
    }
  } else {
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      trend.push({
        month: key,
        revenue: monthBuckets[key] || 0,
      });
    }
  }

  const recentChurn = canceledSubs.slice(0, 5).map((s: StripeSub) => ({
    customer: s.customer,
    canceledAt: new Date((s.canceled_at || 0) * 1000).toISOString(),
    amount: (s.items?.data?.[0]?.price?.unit_amount || 0) / 100,
  }));

  return {
    revenue: {
      mrr: Math.round(mrr * 100) / 100,
      mrrChange: 0,
      totalRevenue30d: revInRange,
      totalRevenuePrev30d: revPrev,
      revenueGrowth,
      avgRevenuePerCustomer: activeSubs.length > 0 ? mrr / activeSubs.length : 0,
    },
    subscriptions: {
      active: activeSubs.length,
      pastDue: pastDueCount,
      canceled: canceledSubs.length,
      trialing: trialingCount,
      churnRate: activeSubs.length + canceledSubs.length > 0
        ? (canceledSubs.length / (activeSubs.length + canceledSubs.length)) * 100 : 0,
      recentChurnEvents: recentChurn,
    },
    payments: {
      succeeded,
      failed,
      successRate: succeeded + failed > 0 ? (succeeded / (succeeded + failed)) * 100 : 0,
    },
    revenueTrend: trend,
    _meta: makeMeta(),
  };
}

// ═══════════════════════════════════════════════════════════
// MERCURY FETCHER
// ═══════════════════════════════════════════════════════════

export async function fetchMercuryData(
  apiKey: string,
  options?: { fromDate?: Date; toDate?: Date }
): Promise<MercuryData> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const baseUrl = "https://api.mercury.com/api/v1";

  // Fetch accounts
  const accountsRes = await fetch(`${baseUrl}/accounts`, { headers });
  if (!accountsRes.ok) {
    throw new Error(`Mercury accounts error ${accountsRes.status}`);
  }
  const accountsData = await accountsRes.json();
  const accounts = (accountsData.accounts || []).map((a: {
    id: string; name: string; currentBalance: number; type: string;
  }) => ({
    accountId: a.id,
    accountName: a.name,
    balance: a.currentBalance || 0,
    type: a.type || "checking",
  }));

  const totalBalance = accounts.reduce((s: number, a: { balance: number }) => s + a.balance, 0);

  // Fetch recent transactions for cash flow
  const rangeFrom = options?.fromDate ?? null;
  const rangeTo = options?.toDate ?? null;
  const useRange =
    Boolean(rangeFrom && rangeTo) &&
    !Number.isNaN(rangeFrom?.getTime() ?? NaN) &&
    !Number.isNaN(rangeTo?.getTime() ?? NaN) &&
    Boolean(rangeFrom && rangeTo && rangeFrom <= rangeTo);

  const startKey = (useRange ? rangeFrom! : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
    .toISOString()
    .split("T")[0];

  let inflows = 0, outflows = 0;
  for (const account of accounts) {
    try {
      const txRes = await fetch(
        `${baseUrl}/account/${account.accountId}/transactions?start=${startKey}&limit=500`,
        { headers }
      );
      if (!txRes.ok) continue;
      const txData = await txRes.json();
      for (const tx of txData.transactions || []) {
        if (useRange && rangeTo) {
          const postedAt = (tx.postedAt || tx.createdAt || tx.timestamp || "") as string;
          if (postedAt) {
            const postedMs = Date.parse(postedAt);
            if (Number.isFinite(postedMs) && postedMs > rangeTo.getTime()) continue;
          }
        }
        if (tx.status === "sent") {
          const amt = Math.abs(tx.amount || 0);
          if (tx.amount > 0) inflows += amt;
          else outflows += amt;
        }
      }
    } catch {
      // Skip account on error
    }
  }

  const burnRate = outflows > 0 ? outflows : 1;
  const runway = totalBalance / burnRate;

  return {
    accounts,
    cashFlow: {
      totalBalance,
      inflows30d: inflows,
      outflows30d: outflows,
      netCashFlow: inflows - outflows,
      runway: Math.round(runway * 10) / 10,
      burnRate,
    },
    _meta: makeMeta(),
  };
}
