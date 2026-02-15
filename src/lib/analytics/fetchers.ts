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

export async function fetchHubSpotData(accessToken: string): Promise<HubSpotData> {
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
  const properties = "dealstage,amount,dealname,closedate,createdate,hs_analytics_source,num_associated_contacts";

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

  const totalDeals = allDeals.length;

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

  const closedWon = stageAgg["closedwon"]?.count || 0;
  const closedLost = stageAgg["closedlost"]?.count || 0;
  const unlikely = stageAgg["1499784891"]?.count || 0;
  const churn = stageAgg["1574807548"]?.count || 0;
  const subscriptions = stageAgg["contractsent"]?.count || 0;
  const noShows = stageAgg["1955958510"]?.count || 0;
  const demoScheduled = stageAgg["presentationscheduled"]?.count || 0;
  const demoFollowUp = stageAgg["decisionmakerboughtin"]?.count || 0;

  const wonValue = stageAgg["closedwon"]?.value || 0;
  const winRate = closedWon + closedLost > 0
    ? (closedWon / (closedWon + closedLost)) * 100 : 0;
  const terminal = closedWon + closedLost + unlikely + churn;
  const effectiveWinRate = terminal > 0 ? (closedWon / terminal) * 100 : 0;
  const noShowRate = demoScheduled + noShows > 0
    ? (noShows / (demoScheduled + noShows)) * 100 : 0;
  const avgDealSize = closedWon > 0 ? wonValue / closedWon : 0;

  // ── Fetch recent contacts count using list endpoint ──
  let recentContacts = 0;
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
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
      })),
    },
    contacts: {
      totalContacts: recentContacts,
      recentContacts,
      bySource: [],
    },
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
  items: { data: StripeSubItem[] };
  customer: string;
  canceled_at: number;
}

interface StripeCharge {
  amount: number;
  created: number;
  status: string;
}

export async function fetchStripeData(apiKey: string): Promise<StripeData> {
  const headers = { Authorization: `Bearer ${apiKey}` };
  const baseUrl = "https://api.stripe.com/v1";

  // ── Fetch active subscriptions ──
  const subsRes = await fetch(`${baseUrl}/subscriptions?limit=100&status=active`, { headers });
  if (!subsRes.ok) {
    throw new Error(`Stripe subscriptions error ${subsRes.status}`);
  }
  const subsData = await subsRes.json();
  const activeSubs: StripeSub[] = subsData.data || [];

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

  // ── Fetch past_due + trialing subscriptions counts ──
  let pastDueCount = 0;
  let trialingCount = 0;
  try {
    const [pastDueRes, trialingRes] = await Promise.all([
      fetch(`${baseUrl}/subscriptions?limit=1&status=past_due`, { headers }),
      fetch(`${baseUrl}/subscriptions?limit=1&status=trialing`, { headers }),
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

  // ── Fetch canceled subscriptions (recent) ──
  const canceledRes = await fetch(`${baseUrl}/subscriptions?limit=50&status=canceled`, { headers });
  const canceledData = await canceledRes.json();
  const canceledSubs: StripeSub[] = canceledData.data || [];

  // ── Fetch charges for revenue across 6 months ──
  const now = Math.floor(Date.now() / 1000);
  const sixMonthsAgo = now - 180 * 24 * 60 * 60;

  // Paginate through all charges in the last 6 months
  const allCharges: StripeCharge[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < 10; page++) {
    let chargesUrl = `${baseUrl}/charges?limit=100&created[gte]=${sixMonthsAgo}`;
    if (startingAfter) chargesUrl += `&starting_after=${startingAfter}`;

    const chargesRes = await fetch(chargesUrl, { headers });
    if (!chargesRes.ok) break;
    const chargesData = await chargesRes.json();
    const batch = chargesData.data || [];
    allCharges.push(...batch);

    if (!chargesData.has_more || batch.length === 0) break;
    startingAfter = batch[batch.length - 1].id;
  }

  // ── Bucket charges by month for trend ──
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60;
  const sixtyDaysAgo = now - 60 * 24 * 60 * 60;
  const monthBuckets: Record<string, number> = {};

  let rev30d = 0, revPrev30d = 0, succeeded = 0, failed = 0;
  for (const charge of allCharges) {
    const amt = (charge.amount || 0) / 100;
    const chargeDate = new Date(charge.created * 1000);
    const monthKey = chargeDate.toLocaleDateString("en-US", { month: "short", year: "2-digit" });

    if (charge.status === "succeeded") {
      monthBuckets[monthKey] = (monthBuckets[monthKey] || 0) + amt;
    }

    if (charge.created >= thirtyDaysAgo) {
      if (charge.status === "succeeded") { rev30d += amt; succeeded++; }
      else if (charge.status === "failed") failed++;
    } else if (charge.created >= sixtyDaysAgo) {
      if (charge.status === "succeeded") revPrev30d += amt;
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

export async function fetchMercuryData(apiKey: string): Promise<MercuryData> {
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
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];

  let inflows = 0, outflows = 0;
  for (const account of accounts) {
    try {
      const txRes = await fetch(
        `${baseUrl}/account/${account.accountId}/transactions?start=${thirtyDaysAgo}&limit=500`,
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
