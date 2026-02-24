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
  "1499784891": "Closed Lost",
  "1722537990": "Freemium",
  contractsent: "Subscription",
  closedwon: "Closed Won",
  closedlost: "Closed Lost",
  "1499784892": "Ping Later",
  "1574807548": "Churn",
  "1916862197": "On Hold",
};

export async function fetchHubSpotData(
  accessToken: string,
  from: Date,
  to: Date
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

  for (let page = 0; page < 10; page++) {
    const url = new URL(`${baseUrl}/crm/v3/objects/deals`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("properties", properties);
    if (after) url.searchParams.set("after", after);

    const res = await fetch(url.toString(), { headers });

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

  // ── Fetch owners ──
  const ownerMap: Record<string, string> = {};
  try {
    const ownersUrl = `${baseUrl}/crm/v3/owners?limit=100`;
    const ownersRes = await fetch(ownersUrl, { headers });
    if (ownersRes.ok) {
      const ownersData = await ownersRes.json();
      for (const owner of ownersData.results || []) {
        ownerMap[owner.id] = owner.firstName && owner.lastName 
          ? `${owner.firstName} ${owner.lastName}`
          : owner.email || "Unknown";
      }
    }
  } catch {
    // Non-critical
  }

  // Filter out inactive pre-demo deals
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const activeDeals = [];

  for (const deal of allDeals) {
    const props = deal.properties || {};
    const stageId = props.dealstage || "unknown";
    const mappedStage = HUBSPOT_STAGE_MAP[stageId] || stageId;

    if (mappedStage === "Prospect" || mappedStage === "Lead") {
      const lastModified = props.hs_lastmodifieddate ? new Date(props.hs_lastmodifieddate) : null;
      const lastActivity = props.hs_lastactivitydate ? new Date(props.hs_lastactivitydate) : null;
      
      const mostRecent = 
        lastActivity && lastModified ? new Date(Math.max(lastActivity.getTime(), lastModified.getTime()))
        : lastActivity || lastModified || null;

      if (!mostRecent || mostRecent < ninetyDaysAgo) {
        continue; // Skip this deal
      }
    }
    activeDeals.push(deal);
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
