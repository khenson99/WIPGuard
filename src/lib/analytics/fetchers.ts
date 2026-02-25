// ─── Data Fetchers for Analytics Dashboard ────────────────
// Server-side functions that pull live data from HubSpot, Stripe, Mercury
// Used by API routes and server components

import type {
  HubSpotData,
  HubSpotContactRecord,
  ChannelGroup,
  SalesPerformanceDealAuditRow,
  SalesPerformancePack,
  SalesPerformanceRepMonthChannelRow,
  SalesPerformanceRepMonthRow,
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
  "1499784891": "Closed Lost",
  "1722537990": "Freemium",
  contractsent: "Subscription",
  closedwon: "Closed Won",
  closedlost: "Closed Lost",
  "1499784892": "Ping Later",
  "1574807548": "Churn",
  "1916862197": "On Hold",
};

async function fetchHubSpotOwnerMap(baseUrl: string, headers: Record<string, string>): Promise<Record<string, string>> {
  const ownerMap: Record<string, string> = {};
  try {
    const ownersUrl = `${baseUrl}/crm/v3/owners?limit=100`;
    const ownersRes = await fetch(ownersUrl, { headers, cache: "no-store" });
    if (!ownersRes.ok) return ownerMap;

    const ownersData = await ownersRes.json();
    for (const owner of ownersData.results || []) {
      ownerMap[owner.id] =
        owner.firstName && owner.lastName ? `${owner.firstName} ${owner.lastName}` : owner.email || "Unknown";
    }
  } catch {
    // Non-critical
  }
  return ownerMap;
}

export async function fetchHubSpotData(
  accessToken: string,
  from: Date,
  to: Date,
  opts?: { includeInactiveProspects?: boolean; maxPages?: number }
): Promise<HubSpotData> {
  const token = accessToken.trim();
  const baseUrl = "https://api.hubapi.com";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // ── Fetch ALL deals using list endpoint with pagination ──
  // Using GET list instead of POST search — more compatible with PAT tokens
  const allDeals: { properties: Record<string, string> }[] = [];
  let after: string | undefined;
  const properties =
    "dealstage,amount,dealname,closedate,createdate,hs_analytics_source,num_associated_contacts,hubspot_owner_id,hs_lastmodifieddate,hs_lastactivitydate,stripe_customer_id,stripe_customer";

  const envMaxPages = Number(process.env.HUBSPOT_MAX_PAGES || "");
  const maxPages = Math.max(1, Math.min(opts?.maxPages ?? (Number.isFinite(envMaxPages) ? envMaxPages : 1000), 1000));

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${baseUrl}/crm/v3/objects/deals`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("properties", properties);
    if (after) url.searchParams.set("after", after);

    const res = await fetch(url.toString(), { headers, cache: "no-store" });

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown");
      throw new Error(`HubSpot deals API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const results = data.results || [];
    allDeals.push(...results);

    // Check for next page
    after = data.paging?.next?.after;
    if (!after || results.length === 0) break;
  }

  const ownerMap = await fetchHubSpotOwnerMap(baseUrl, headers);

  // Filter out inactive pre-demo deals
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const includeInactiveProspects = Boolean(opts?.includeInactiveProspects);

  const activeDeals: { properties: Record<string, string> }[] = [];
  if (includeInactiveProspects) {
    activeDeals.push(...allDeals);
  } else {
    for (const deal of allDeals) {
      const props = deal.properties || {};
      const stageId = props.dealstage || "unknown";
      const mappedStage = HUBSPOT_STAGE_MAP[stageId] || stageId;

      if (mappedStage === "Prospect" || mappedStage === "Lead") {
        const lastModified = props.hs_lastmodifieddate ? new Date(props.hs_lastmodifieddate) : null;
        const lastActivity = props.hs_lastactivitydate ? new Date(props.hs_lastactivitydate) : null;

        const mostRecent =
          lastActivity && lastModified
            ? new Date(Math.max(lastActivity.getTime(), lastModified.getTime()))
            : lastActivity || lastModified || null;

        if (!mostRecent || mostRecent < ninetyDaysAgo) {
          continue; // Skip this deal
        }
      }
      activeDeals.push(deal);
    }
  }

  const totalDeals = activeDeals.length;

  // Aggregate by stage
  const stageAgg: Record<string, { count: number; value: number }> = {};
  const sourceAgg: Record<string, { count: number; value: number; closedWon: number; followUpNeeded: number; churned: number }> = {};
  const repAgg: Record<string, { count: number; value: number; closedWon: number; closedWonValue: number }> = {};

  let notActivatedCount = 0;
  let actualChurnCount = 0;

  for (const deal of activeDeals) {
    const props = deal.properties || {};
    // Skip if deal is not within the date range depending on stage type
    // We typically want to filter closed deals by closedate, created deals by createdate
    const rawCloseDate = props.closedate ? new Date(props.closedate) : null;
    const rawCreateDate = props.createdate ? new Date(props.createdate) : null;
    
    // Simple filter: only include if it was created before 'to' 
    // AND (not closed OR closed after 'from')
    if (rawCreateDate && rawCreateDate > to) continue;
    if (rawCloseDate && rawCloseDate < from) continue;

    const stage = props.dealstage || "unknown";
    const mappedLabel = HUBSPOT_STAGE_MAP[stage] || stage;
    const amount = parseFloat(props.amount) || 0;
    const source = props.hs_analytics_source || "Unknown";
    const ownerId = props.hubspot_owner_id;
    const repName = ownerId ? ownerMap[ownerId] || "Unknown" : "Unassigned";

    if (!stageAgg[stage]) stageAgg[stage] = { count: 0, value: 0 };
    stageAgg[stage].count++;
    stageAgg[stage].value += amount;

    if (!sourceAgg[source]) sourceAgg[source] = { count: 0, value: 0, closedWon: 0, followUpNeeded: 0, churned: 0 };
    sourceAgg[source].count++;
    sourceAgg[source].value += amount;
    
    if (stage === "closedwon") sourceAgg[source].closedWon++;
    if (mappedLabel === "Demo Follow-Up") sourceAgg[source].followUpNeeded++;
    if (mappedLabel === "Churn") {
      sourceAgg[source].churned++;
      
      const createdMs = rawCreateDate ? rawCreateDate.getTime() : 0;
      const updatedMs = props.hs_lastmodifieddate ? new Date(props.hs_lastmodifieddate).getTime() 
        : rawCloseDate ? rawCloseDate.getTime() 
        : new Date().getTime();
      
      const daysSinceCreation = createdMs > 0 ? (updatedMs - createdMs) / 86_400_000 : Infinity;
      
      if (createdMs > 0 && daysSinceCreation <= 60) {
        notActivatedCount++;
      } else {
        actualChurnCount++;
      }
    }

    if (!repAgg[repName]) repAgg[repName] = { count: 0, value: 0, closedWon: 0, closedWonValue: 0 };
    repAgg[repName].count++;
    repAgg[repName].value += amount;
    if (stage === "closedwon") {
      repAgg[repName].closedWon++;
      repAgg[repName].closedWonValue += amount;
    }
  }

  const stages: DealStage[] = Object.entries(stageAgg).map(([id, data]) => ({
    stageId: id,
    label: HUBSPOT_STAGE_MAP[id] || id,
    count: data.count,
    value: data.value,
  }));

  const deals = activeDeals.map((deal) => {
    const props = deal.properties || {};
    const stageId = props.dealstage || "unknown";
    const ownerId = props.hubspot_owner_id || null;
    return {
      dealId: String((deal as { id?: string }).id ?? ""),
      dealName: props.dealname || "Untitled deal",
      stageId,
      stageLabel: HUBSPOT_STAGE_MAP[stageId] || stageId,
      amount: parseFloat(props.amount) || 0,
      source: props.hs_analytics_source || "Unknown",
      ownerId,
      repName: ownerId ? ownerMap[ownerId] || "Unknown" : "Unassigned",
      updatedAt: props.hs_lastmodifieddate ? new Date(props.hs_lastmodifieddate).toISOString() : null,
      createdAt: props.createdate ? new Date(props.createdate).toISOString() : null,
      closedAt: props.closedate ? new Date(props.closedate).toISOString() : null,
      stripeCustomerId: props.stripe_customer_id || props.stripe_customer || null,
    };
  });

  const closedWon = stageAgg["closedwon"]?.count || 0;
  const closedLost = stageAgg["closedlost"]?.count || 0;
  // Unlikely is now consolidated into Closed Lost, but if any stray remains check it
  const unlikely = stageAgg["1499784891"]?.count || 0;
  const churn = actualChurnCount;
  const notActivated = notActivatedCount;
  const subscriptions = stageAgg["contractsent"]?.count || 0;
  const noShows = stageAgg["1955958510"]?.count || 0;
  const demoScheduled = stageAgg["presentationscheduled"]?.count || 0;
  const demoFollowUp = stageAgg["decisionmakerboughtin"]?.count || 0;

  const wonValue = stageAgg["closedwon"]?.value || 0;
  const winRate = closedWon + closedLost > 0
    ? (closedWon / (closedWon + closedLost)) * 100 : 0;
  const terminal = closedWon + closedLost + unlikely + churn + notActivated;
  const effectiveWinRate = terminal > 0 ? (closedWon / terminal) * 100 : 0;
  const noShowRate = demoScheduled + noShows > 0
    ? (noShows / (demoScheduled + noShows)) * 100 : 0;
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

  return {
    funnel: {
      totalDeals,
      closedWon,
      closedLost,
      unlikely,
      churn,
      notActivated,
      activeSubscriptions: subscriptions,
      noShows,
      demoScheduled,
      demoFollowUp,
      avgDealSize,
      winRate,
      effectiveWinRate,
      noShowRate,
      stages,
      dealsBySource: Object.entries(sourceAgg).map(([source, data]) => ({
        source,
        count: data.count,
        value: data.value,
        closedWon: data.closedWon,
        followUpNeeded: data.followUpNeeded,
        churned: data.churned,
      })),
      dealsByRep: Object.entries(repAgg).map(([repName, data]) => ({
        repName,
        count: data.count,
        value: data.value,
        closedWon: data.closedWon,
        closedWonValue: data.closedWonValue,
      })),
    },
    contacts: {
      totalContacts: recentContacts,
      recentContacts,
      bySource: [],
    },
    deals,
    _meta: makeMeta(),
  };
}

export async function fetchHubSpotContacts(
  accessToken: string,
  from: Date,
  to: Date,
  opts?: { maxPages?: number }
): Promise<HubSpotContactRecord[]> {
  const token = accessToken.trim();
  const baseUrl = "https://api.hubapi.com";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const envMaxPages = Number(process.env.HUBSPOT_CONTACTS_MAX_PAGES || "");
  const maxPages = Math.max(1, Math.min(opts?.maxPages ?? (Number.isFinite(envMaxPages) ? envMaxPages : 1000), 1000));

  const ownerMap = await fetchHubSpotOwnerMap(baseUrl, headers);

  const fromMs = from.getTime();
  const toMs = to.getTime();

  const out: HubSpotContactRecord[] = [];
  let after: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const url = `${baseUrl}/crm/v3/objects/contacts/search`;

    const body = {
      filterGroups: [
        {
          filters: [
            { propertyName: "createdate", operator: "GTE", value: String(fromMs) },
            { propertyName: "createdate", operator: "LTE", value: String(toMs) },
          ],
        },
      ],
      sorts: ["createdate"],
      properties: ["createdate", "hubspot_owner_id", "hs_analytics_source"],
      limit: 100,
      after,
    };

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "unknown");
      throw new Error(`HubSpot contacts API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    const results = data.results || [];

    for (const contact of results) {
      const props = contact.properties || {};
      const ownerId = props.hubspot_owner_id ? String(props.hubspot_owner_id) : null;

      out.push({
        contactId: String(contact.id ?? ""),
        createdAt: props.createdate ? new Date(props.createdate).toISOString() : null,
        ownerId,
        repName: ownerId ? ownerMap[ownerId] || "Unknown" : "Unassigned",
        rawSource: props.hs_analytics_source ? String(props.hs_analytics_source) : null,
      });
    }

    after = data.paging?.next?.after;
    if (!after || results.length === 0) break;
  }

  return out;
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
  id: string;
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
  from: Date,
  to: Date
): Promise<StripeData> {
  const headers = { Authorization: `Bearer ${apiKey}` };
  const baseUrl = "https://api.stripe.com/v1";
  
  const fromMs = Math.floor(from.getTime() / 1000);
  const toMs = Math.floor(to.getTime() / 1000);

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
    try {
      const countSubscriptionsByStatus = async (status: string): Promise<number> => {
        let count = 0;
        let startingAfter: string | undefined;

        for (let page = 0; page < 1000; page++) {
          let url = `${baseUrl}/subscriptions?limit=100&status=${encodeURIComponent(status)}`;
          if (startingAfter) url += `&starting_after=${startingAfter}`;

          const res = await fetchStripe(url);
          if (!res.ok) {
            throw new Error(`Stripe subscriptions(${status}) error ${res.status}`);
          }

          const data = await res.json();
          const batch = (data?.data || []) as StripeSub[];
          count += batch.length;

          if (!data?.has_more || batch.length === 0) break;
          startingAfter = batch[batch.length - 1]?.id;
          if (!startingAfter) break;
        }

        return count;
      };

      const [pastDueCount, trialingCount] = await Promise.all([
        countSubscriptionsByStatus("past_due"),
        countSubscriptionsByStatus("trialing"),
      ]);
      return { pastDueCount, trialingCount };
    } catch {
      // Non-critical
    }
    return { pastDueCount: 0, trialingCount: 0 };
  };

  const fetchChargesSixMonths = async (): Promise<StripeCharge[]> => {
    // Paginate through all charges in the specified date range
    const allCharges: StripeCharge[] = [];
    let startingAfter: string | undefined;
    for (let page = 0; page < 5; page++) {
      let chargesUrl = `${baseUrl}/charges?limit=100&created[gte]=${fromMs}&created[lte]=${toMs}`;
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

  const [activeSubs, canceledSubs, counts, allCharges] = await Promise.all([
    fetchActiveSubscriptions(),
    fetchCanceledSubscriptions(),
    fetchPastDueAndTrialingCounts(),
    fetchChargesSixMonths(),
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

  // ── Bucket charges into the range ──
  // Calculate previous period for comparison based on the length of the selected range
  const now = Math.floor(Date.now() / 1000);
  const rangeLengthSecs = toMs - fromMs;
  const prevToMs = fromMs;
  const prevFromMs = fromMs - rangeLengthSecs;
  
  // Also fetch previous period charges for growth calculation
  const fetchPrevCharges = async (): Promise<StripeCharge[]> => {
    const prevCharges: StripeCharge[] = [];
    let prevStartingAfter: string | undefined;
    for (let page = 0; page < 5; page++) {
      let chargesUrl = `${baseUrl}/charges?limit=100&created[gte]=${prevFromMs}&created[lte]=${prevToMs}`;
      if (prevStartingAfter) chargesUrl += `&starting_after=${prevStartingAfter}`;

      const chargesRes = await fetchStripe(chargesUrl);
      if (!chargesRes.ok) break;
      const chargesData = await chargesRes.json();
      const batch = chargesData.data || [];
      prevCharges.push(...batch);

      if (!chargesData.has_more || batch.length === 0) break;
      prevStartingAfter = batch[batch.length - 1].id;
    }
    return prevCharges;
  };
  
  const prevCharges = await fetchPrevCharges();

  const monthBuckets: Record<string, number> = {};

  let rev30d = 0, revPrev30d = 0, succeeded = 0, failed = 0;
  for (const charge of allCharges) {
    const amt = (charge.amount || 0) / 100;
    const chargeDate = new Date(charge.created * 1000);
    const monthKey = chargeDate.toLocaleDateString("en-US", { month: "short", year: "2-digit" });

    if (charge.status === "succeeded") {
      monthBuckets[monthKey] = (monthBuckets[monthKey] || 0) + amt;
      rev30d += amt;
      succeeded++;
    } else if (charge.status === "failed") {
      failed++;
    }
  }
  
  for (const charge of prevCharges) {
    const amt = (charge.amount || 0) / 100;
    if (charge.status === "succeeded") {
      revPrev30d += amt;
    }
  }

  const revenueGrowth = revPrev30d > 0 ? ((rev30d - revPrev30d) / revPrev30d) * 100 : 0;

  // ── Build revenue trend (last 6 months) ──
  const trend: { month: string; revenue: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    trend.push({
      month: key,
      revenue: monthBuckets[key] || 0,
    });
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
      totalRevenue30d: rev30d,
      totalRevenuePrev30d: revPrev30d,
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

type StripeChargeListResponse = {
  data: Array<{
    id: string;
    amount: number;
    amount_refunded?: number;
    created: number;
    currency?: string;
    status?: string;
    paid?: boolean;
  }>;
  has_more?: boolean;
};

export type StripeChargeLite = {
  chargeId: string;
  created: number; // seconds since epoch
  currency: string | null;
  netAmountCents: number;
};

export type StripeChargesByCustomerId = Record<string, StripeChargeLite[]>;

export type StripeCustomerChargeRequest = {
  customerId: string;
  createdGte: Date;
  createdLte: Date;
};

function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const pending = [...items];
  const running = new Set<Promise<void>>();

  const enqueue = async (): Promise<void> => {
    while (pending.length > 0 && running.size < concurrency) {
      const item = pending.shift()!;
      const p = fn(item).finally(() => running.delete(p));
      running.add(p);
    }

    if (running.size === 0) return;
    await Promise.race(running);
    return enqueue();
  };

  await enqueue();
  await Promise.all(running);
}

async function fetchStripeChargesForCustomer(
  apiKey: string,
  request: StripeCustomerChargeRequest
): Promise<StripeChargeLite[]> {
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
  const baseUrl = "https://api.stripe.com/v1";

  const gte = toUnixSeconds(request.createdGte);
  const lte = toUnixSeconds(request.createdLte);

  const all: StripeChargeLite[] = [];
  let startingAfter: string | undefined;

  for (let page = 0; page < 1000; page++) {
    const url = new URL(`${baseUrl}/charges`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("customer", request.customerId);
    url.searchParams.set("created[gte]", String(gte));
    url.searchParams.set("created[lte]", String(lte));
    if (startingAfter) url.searchParams.set("starting_after", startingAfter);

    const res = await fetch(url.toString(), { headers, cache: "no-store" });
    if (!res.ok) {
      const text = await res.text().catch(() => "unknown");
      throw new Error(`Stripe charges error (${res.status}) for customer ${request.customerId}: ${text}`);
    }

    const body = (await res.json()) as StripeChargeListResponse;
    const batch = body.data ?? [];

    for (const charge of batch) {
      if (charge.status !== "succeeded") continue;
      if (charge.paid === false) continue;

      const amountRefunded = charge.amount_refunded ?? 0;
      const net = Math.max(0, (charge.amount ?? 0) - amountRefunded);

      all.push({
        chargeId: charge.id,
        created: charge.created,
        currency: charge.currency ?? null,
        netAmountCents: net,
      });
    }

    if (!body.has_more || batch.length === 0) break;
    startingAfter = batch[batch.length - 1]?.id;
    if (!startingAfter) break;
  }

  return all;
}

export async function fetchStripeChargesByCustomer(
  apiKey: string,
  requests: StripeCustomerChargeRequest[],
  opts?: { concurrency?: number }
): Promise<StripeChargesByCustomerId> {
  const concurrency = Math.max(1, Math.min(opts?.concurrency ?? 5, 25));

  const uniqueRequestsByCustomer = new Map<string, StripeCustomerChargeRequest>();
  for (const request of requests) {
    const existing = uniqueRequestsByCustomer.get(request.customerId);
    if (!existing) {
      uniqueRequestsByCustomer.set(request.customerId, request);
      continue;
    }

    uniqueRequestsByCustomer.set(request.customerId, {
      customerId: request.customerId,
      createdGte: existing.createdGte < request.createdGte ? existing.createdGte : request.createdGte,
      createdLte: existing.createdLte > request.createdLte ? existing.createdLte : request.createdLte,
    });
  }

  const output: StripeChargesByCustomerId = {};
  const requestsToRun = [...uniqueRequestsByCustomer.values()];

  await runWithConcurrency(requestsToRun, concurrency, async (request) => {
    output[request.customerId] = await fetchStripeChargesForCustomer(apiKey, request);
  });

  return output;
}

// ═══════════════════════════════════════════════════════════
// MERCURY FETCHER
// ═══════════════════════════════════════════════════════════

export async function fetchMercuryData(
  apiKey: string,
  from: Date,
  to: Date
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
  const fromIsoDate = from.toISOString().split("T")[0];
  const toIsoDate = to.toISOString().split("T")[0];

  let inflows = 0, outflows = 0;
  for (const account of accounts) {
    try {
      const txRes = await fetch(
        `${baseUrl}/account/${account.accountId}/transactions?start=${fromIsoDate}&end=${toIsoDate}&limit=500`,
        { headers }
      );
      if (!txRes.ok) continue;
      const txData = await txRes.json();
      for (const tx of txData.transactions || []) {
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

type HubSpotDeal = NonNullable<HubSpotData["deals"]>[number];

type ChannelMapping = Record<string, ChannelGroup>;

function monthKeyUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function safeDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

function normalizeSourceKey(value: string): string {
  return value.trim().toLowerCase();
}

function classifyChannelGroup(rawSource: string, mapping?: ChannelMapping): ChannelGroup {
  const normalized = normalizeSourceKey(rawSource || "unknown");
  const explicit = mapping?.[normalized];
  if (explicit) return explicit;

  const key = normalized.replaceAll("_", " ").replaceAll("-", " ");

  if (!key || key === "unknown" || key === "unassigned" || key === "(none)") return "Unknown";
  if (key.includes("offline")) return "Outbound";
  if (key.includes("outbound")) return "Outbound";
  if (key.includes("partner")) return "Partner";
  if (key.includes("product")) return "Product-led";
  if (key.includes("plg")) return "Product-led";

  const inboundHints = [
    "organic",
    "paid",
    "search",
    "social",
    "email",
    "referral",
    "direct",
    "campaign",
    "web",
    "content",
  ];
  if (inboundHints.some((hint) => key.includes(hint))) return "Inbound";

  return "Unknown";
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

export function buildSalesPerformancePack(args: {
  from: Date;
  to: Date;
  generatedAt?: Date;
  fromSnapshot?: boolean;
  deals: HubSpotDeal[];
  contacts: HubSpotContactRecord[];
  chargesByCustomerId: StripeChargesByCustomerId;
  cohortWindowDays?: number;
  channelMapping?: ChannelMapping;
  errors?: string[];
}): SalesPerformancePack {
  const from = args.from;
  const to = args.to;
  const generatedAt = args.generatedAt ?? new Date();
  const fromSnapshot = args.fromSnapshot ?? false;
  const cohortWindowDays = args.cohortWindowDays ?? 90;

  const mappingNormalized: ChannelMapping = {};
  for (const [key, value] of Object.entries(args.channelMapping ?? {})) {
    mappingNormalized[normalizeSourceKey(key)] = value;
  }

  const observedSources = new Set<string>();
  for (const deal of args.deals) observedSources.add((deal.source || "Unknown").trim() || "Unknown");

  const channelMappingRows = [...observedSources]
    .sort((a, b) => a.localeCompare(b))
    .map((rawSource) => ({
      rawSource,
      channelGroup: classifyChannelGroup(rawSource, mappingNormalized),
    }));

  const channelGroupBySource = new Map<string, ChannelGroup>();
  for (const row of channelMappingRows) channelGroupBySource.set(row.rawSource, row.channelGroup);

  // ── Stripe realized 30d allocation ──
  const realizedCentsByDealId = new Map<string, number>();
  const dealsByCustomer = new Map<string, HubSpotDeal[]>();

  for (const deal of args.deals) {
    const customerId = deal.stripeCustomerId?.trim() || null;
    if (!customerId) continue;
    const stageId = (deal.stageId || "").toLowerCase();
    const closedAt = safeDate(deal.closedAt ?? null);
    if (stageId !== "closedwon" || !closedAt) continue;

    const bucket = dealsByCustomer.get(customerId);
    if (bucket) bucket.push(deal);
    else dealsByCustomer.set(customerId, [deal]);
  }

  for (const [customerId, customerDeals] of dealsByCustomer.entries()) {
    const charges = args.chargesByCustomerId[customerId] ?? [];
    if (charges.length === 0) continue;

    const sortedDeals = [...customerDeals].sort((a, b) => {
      const aClose = safeDate(a.closedAt ?? null)?.getTime() ?? 0;
      const bClose = safeDate(b.closedAt ?? null)?.getTime() ?? 0;
      return aClose - bClose;
    });

    const windows = sortedDeals.map((deal) => {
      const close = safeDate(deal.closedAt ?? null)!;
      const closeMs = close.getTime();
      const endMs = closeMs + 30 * 24 * 60 * 60 * 1000;
      return { deal, closeMs, endMs };
    });

    for (const charge of charges) {
      const chargeMs = charge.created * 1000;
      let matchedIndex = -1;
      for (let i = windows.length - 1; i >= 0; i--) {
        const w = windows[i]!;
        if (chargeMs < w.closeMs) continue;
        if (chargeMs > w.endMs) continue;
        matchedIndex = i;
        break;
      }
      if (matchedIndex === -1) continue;

      const dealId = windows[matchedIndex]!.deal.dealId;
      realizedCentsByDealId.set(dealId, (realizedCentsByDealId.get(dealId) ?? 0) + charge.netAmountCents);
    }
  }

  // ── Leads ──
  const leadsByRepMonth = new Map<string, number>();
  const leadsMissingOwnerByRepMonth = new Map<string, number>();

  for (const contact of args.contacts) {
    const createdAt = safeDate(contact.createdAt);
    if (!createdAt) continue;
    if (createdAt < from || createdAt > to) continue;
    const month = monthKeyUtc(createdAt);
    const repName = contact.repName || "Unassigned";
    const key = `${month}||${repName}`;
    leadsByRepMonth.set(key, (leadsByRepMonth.get(key) ?? 0) + 1);
    if (!contact.ownerId) {
      leadsMissingOwnerByRepMonth.set(key, (leadsMissingOwnerByRepMonth.get(key) ?? 0) + 1);
    }
  }

  // ── Opps + signed + decided + cohort ──
  const oppByRepMonth = new Map<string, number>();
  const oppByRepMonthSource = new Map<string, number>();
  const oppMissingOwnerByRepMonth = new Map<string, number>();

  const signedByRepMonth = new Map<string, HubSpotDeal[]>();
  const signedByRepMonthSource = new Map<string, HubSpotDeal[]>();

  const decidedByRepCloseMonth = new Map<string, { won: number; lost: number }>();
  const decidedByRepCloseMonthSource = new Map<string, { won: number; lost: number }>();

  const cohortCreatedByRepMonth = new Map<string, number>();
  const cohortWon90dByRepMonth = new Map<string, number>();

  for (const deal of args.deals) {
    const repName = deal.repName || "Unassigned";
    const stageId = (deal.stageId || "").toLowerCase();
    const rawSource = (deal.source || "Unknown").trim() || "Unknown";
    const channelGroup = channelGroupBySource.get(rawSource) ?? classifyChannelGroup(rawSource, mappingNormalized);

    const createdAt = safeDate(deal.createdAt);
    if (createdAt && createdAt >= from && createdAt <= to) {
      const createdMonth = monthKeyUtc(createdAt);
      const repMonthKey = `${createdMonth}||${repName}`;
      oppByRepMonth.set(repMonthKey, (oppByRepMonth.get(repMonthKey) ?? 0) + 1);
      const srcKey = `${createdMonth}||${repName}||${channelGroup}||${rawSource}`;
      oppByRepMonthSource.set(srcKey, (oppByRepMonthSource.get(srcKey) ?? 0) + 1);

      if (!deal.ownerId) {
        oppMissingOwnerByRepMonth.set(repMonthKey, (oppMissingOwnerByRepMonth.get(repMonthKey) ?? 0) + 1);
      }

      cohortCreatedByRepMonth.set(repMonthKey, (cohortCreatedByRepMonth.get(repMonthKey) ?? 0) + 1);
      if (stageId === "closedwon") {
        const closedAt = safeDate(deal.closedAt ?? null);
        if (closedAt && closedAt <= to) {
          const windowEnd = new Date(createdAt.getTime() + cohortWindowDays * 24 * 60 * 60 * 1000);
          if (closedAt <= windowEnd) {
            cohortWon90dByRepMonth.set(repMonthKey, (cohortWon90dByRepMonth.get(repMonthKey) ?? 0) + 1);
          }
        }
      }
    }

    const closedAt = safeDate(deal.closedAt ?? null);
    if (closedAt && closedAt >= from && closedAt <= to) {
      const closeMonth = monthKeyUtc(closedAt);
      const decidedKey = `${closeMonth}||${repName}`;
      const decidedSourceKey = `${closeMonth}||${repName}||${channelGroup}||${rawSource}`;

      if (stageId === "closedwon" || stageId === "closedlost") {
        const agg = decidedByRepCloseMonth.get(decidedKey) ?? { won: 0, lost: 0 };
        if (stageId === "closedwon") agg.won += 1;
        else agg.lost += 1;
        decidedByRepCloseMonth.set(decidedKey, agg);

        const aggSrc = decidedByRepCloseMonthSource.get(decidedSourceKey) ?? { won: 0, lost: 0 };
        if (stageId === "closedwon") aggSrc.won += 1;
        else aggSrc.lost += 1;
        decidedByRepCloseMonthSource.set(decidedSourceKey, aggSrc);
      }

      if (stageId === "closedwon") {
        const monthKey = `${closeMonth}||${repName}`;
        const arr = signedByRepMonth.get(monthKey) ?? [];
        arr.push(deal);
        signedByRepMonth.set(monthKey, arr);

        const arrSrc = signedByRepMonthSource.get(decidedSourceKey) ?? [];
        arrSrc.push(deal);
        signedByRepMonthSource.set(decidedSourceKey, arrSrc);
      }
    }
  }

  // ── Deal audit rows ──
  const dealAuditRows: SalesPerformanceDealAuditRow[] = [];
  for (const deal of args.deals) {
    const rawSource = (deal.source || "Unknown").trim() || "Unknown";
    const channelGroup = channelGroupBySource.get(rawSource) ?? classifyChannelGroup(rawSource, mappingNormalized);

    const flags: string[] = [];
    if (!deal.ownerId) flags.push("missing_owner");
    if (!deal.amount || deal.amount === 0) flags.push("amount_zero");
    if (!rawSource || rawSource === "Unknown") flags.push("missing_source");

    const stageId = (deal.stageId || "").toLowerCase();
    if (stageId === "closedwon" && !deal.closedAt) flags.push("missing_close_date");

    const customerId = deal.stripeCustomerId?.trim() || null;
    const stripeLinked = Boolean(customerId);
    const realized30d = (realizedCentsByDealId.get(deal.dealId) ?? 0) / 100;

    dealAuditRows.push({
      hubspotDealId: deal.dealId,
      dealName: deal.dealName,
      ownerId: deal.ownerId,
      repName: deal.repName || "Unassigned",
      createdAt: deal.createdAt ?? null,
      closedAt: deal.closedAt ?? null,
      stageId: deal.stageId,
      stageLabel: deal.stageLabel,
      amount: deal.amount,
      rawSource,
      channelGroup,
      stripeCustomerId: customerId,
      stripeLinked,
      stripeRealized30d: realized30d,
      flags,
    });
  }

  // ── Rep × Month rows ──
  const repMonthKeys = new Set<string>();
  for (const k of leadsByRepMonth.keys()) repMonthKeys.add(k);
  for (const k of oppByRepMonth.keys()) repMonthKeys.add(k);
  for (const k of signedByRepMonth.keys()) repMonthKeys.add(k);
  for (const k of decidedByRepCloseMonth.keys()) repMonthKeys.add(k);
  for (const k of cohortCreatedByRepMonth.keys()) repMonthKeys.add(k);

  const repMonthRows: SalesPerformanceRepMonthRow[] = [];
  for (const key of repMonthKeys) {
    const [month, repName] = key.split("||");
    const leadsCreatedCount = leadsByRepMonth.get(key) ?? 0;
    const opportunitiesCreatedCount = oppByRepMonth.get(key) ?? 0;
    const signedDeals = signedByRepMonth.get(key) ?? [];

    const signedDealsCount = signedDeals.length;
    const signedDealsBookedValue = signedDeals.reduce((s, d) => s + (d.amount || 0), 0);

    const signedAmounts = signedDeals.map((d) => d.amount || 0).filter((v) => Number.isFinite(v));
    const avgSignedDealSizeBooked = mean(signedAmounts);
    const medianSignedDealSizeBooked = median(signedAmounts);

    const signedDealsRealizedValue30d =
      signedDeals.reduce((s, d) => s + (realizedCentsByDealId.get(d.dealId) ?? 0), 0) / 100;
    const bookedToRealizedRatio30d =
      signedDealsBookedValue > 0 ? signedDealsRealizedValue30d / signedDealsBookedValue : null;

    const leadToOpportunityRate = leadsCreatedCount > 0 ? opportunitiesCreatedCount / leadsCreatedCount : null;

    const cohortCreated = cohortCreatedByRepMonth.get(key) ?? 0;
    const cohortWon90d = cohortWon90dByRepMonth.get(key) ?? 0;
    const opportunityToClosedRate90d = cohortCreated > 0 ? cohortWon90d / cohortCreated : null;

    const decided = decidedByRepCloseMonth.get(key) ?? { won: 0, lost: 0 };
    const decidedDenom = decided.won + decided.lost;
    const winRateDecided = decidedDenom > 0 ? decided.won / decidedDenom : null;

    const signedByGroup: Record<ChannelGroup, number> = {
      Inbound: 0,
      Outbound: 0,
      Partner: 0,
      "Product-led": 0,
      Unknown: 0,
    };

    for (const d of signedDeals) {
      const src = (d.source || "Unknown").trim() || "Unknown";
      const group = channelGroupBySource.get(src) ?? classifyChannelGroup(src, mappingNormalized);
      signedByGroup[group] += 1;
    }

    const signedDealsMissingSource = signedDeals.filter((d) => {
      const src = (d.source || "Unknown").trim() || "Unknown";
      return !src || src === "Unknown";
    }).length;

    const signedDealsMissingCloseDate = signedDeals.filter((d) => !d.closedAt).length;
    const signedDealsMissingOwner = signedDeals.filter((d) => !d.ownerId).length;

    const opportunitiesMissingOwner = oppMissingOwnerByRepMonth.get(key) ?? 0;
    const leadsMissingOwner = leadsMissingOwnerByRepMonth.get(key) ?? 0;

    repMonthRows.push({
      month,
      repName,
      leadsCreatedCount,
      opportunitiesCreatedCount,
      leadToOpportunityRate,
      signedDealsCount,
      signedDealsBookedValue,
      avgSignedDealSizeBooked,
      medianSignedDealSizeBooked,
      signedDealsRealizedValue30d,
      bookedToRealizedRatio30d,
      opportunityToClosedRate90d,
      winRateDecided,
      signedInboundShare: pct(signedByGroup["Inbound"], signedDealsCount),
      signedOutboundShare: pct(signedByGroup["Outbound"], signedDealsCount),
      signedPartnerShare: pct(signedByGroup["Partner"], signedDealsCount),
      signedProductLedShare: pct(signedByGroup["Product-led"], signedDealsCount),
      signedUnknownShare: pct(signedByGroup["Unknown"], signedDealsCount),
      dataQuality: {
        signedDealsMissingSourcePct: pct(signedDealsMissingSource, signedDealsCount),
        signedDealsMissingCloseDatePct: pct(signedDealsMissingCloseDate, signedDealsCount),
        signedDealsMissingOwnerPct: pct(signedDealsMissingOwner, signedDealsCount),
        opportunitiesMissingOwnerPct: pct(opportunitiesMissingOwner, opportunitiesCreatedCount),
        leadsMissingOwnerPct: pct(leadsMissingOwner, leadsCreatedCount),
      },
    });
  }

  repMonthRows.sort((a, b) => {
    if (a.month !== b.month) return a.month.localeCompare(b.month);
    return a.repName.localeCompare(b.repName);
  });

  // ── Rep × Month × Channel rows ──
  const repMonthChannelRows: SalesPerformanceRepMonthChannelRow[] = [];
  const repMonthChannelKeys = new Set<string>();
  for (const k of oppByRepMonthSource.keys()) repMonthChannelKeys.add(k);
  for (const k of signedByRepMonthSource.keys()) repMonthChannelKeys.add(k);
  for (const k of decidedByRepCloseMonthSource.keys()) repMonthChannelKeys.add(k);

  for (const key of repMonthChannelKeys) {
    const [month, repName, channelGroup, rawSource] = key.split("||") as [
      string,
      string,
      ChannelGroup,
      string,
    ];

    const opportunitiesCreatedCount = oppByRepMonthSource.get(key) ?? 0;
    const signedDeals = signedByRepMonthSource.get(key) ?? [];
    const signedDealsCount = signedDeals.length;
    const bookedValue = signedDeals.reduce((s, d) => s + (d.amount || 0), 0);
    const avgBookedDealSize = signedDealsCount > 0 ? bookedValue / signedDealsCount : null;
    const realizedValue30d =
      signedDeals.reduce((s, d) => s + (realizedCentsByDealId.get(d.dealId) ?? 0), 0) / 100;

    const decided = decidedByRepCloseMonthSource.get(key) ?? { won: 0, lost: 0 };
    const decidedDenom = decided.won + decided.lost;
    const winRateDecided = decidedDenom > 0 ? decided.won / decidedDenom : null;

    const daysToClose = signedDeals
      .map((d) => {
        const c = safeDate(d.createdAt);
        const cl = safeDate(d.closedAt ?? null);
        if (!c || !cl) return null;
        return (cl.getTime() - c.getTime()) / 86_400_000;
      })
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const avgDaysToClose = mean(daysToClose);

    repMonthChannelRows.push({
      month,
      repName,
      channelGroup,
      rawSource,
      opportunitiesCreatedCount,
      signedDealsCount,
      bookedValue,
      avgBookedDealSize,
      realizedValue30d,
      winRateDecided,
      avgDaysToClose,
    });
  }

  repMonthChannelRows.sort((a, b) => {
    if (a.month !== b.month) return a.month.localeCompare(b.month);
    if (a.repName !== b.repName) return a.repName.localeCompare(b.repName);
    if (a.channelGroup !== b.channelGroup) return a.channelGroup.localeCompare(b.channelGroup);
    return a.rawSource.localeCompare(b.rawSource);
  });

  dealAuditRows.sort((a, b) => {
    const aClosed = a.closedAt ?? "";
    const bClosed = b.closedAt ?? "";
    if (aClosed !== bClosed) return aClosed.localeCompare(bClosed);
    return a.hubspotDealId.localeCompare(b.hubspotDealId);
  });

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    generatedAt: generatedAt.toISOString(),
    fromSnapshot,
    channelMapping: channelMappingRows,
    repMonthRows,
    repMonthChannelRows,
    dealAuditRows,
    errors: args.errors ?? [],
  };
}
