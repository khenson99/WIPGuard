// ---------- Types ----------

export type DateRangePreset = "7d" | "30d" | "90d" | "all";

export interface DateRange {
  start: Date | null; // null = no lower bound
  end: Date;
}

export interface Rep {
  id: string;
  name: string;
}

/** Minimal deal shape mirroring HubSpotData["deals"][number] */
export interface FunnelDeal {
  dealId: string;
  dealName: string;
  stageId: string;
  stageLabel: string;
  amount: number;
  source: string;
  ownerId: string | null;
  repName?: string;
  createdAt: string | null;
  closedAt?: string | null;
  stripeCustomerId?: string | null;
  [key: string]: unknown;
}

// ---------- Date range helpers ----------

export function getDateRangeFromPreset(preset: DateRangePreset): DateRange {
  const end = new Date();
  if (preset === "all") return { start: null, end };
  const daysMap: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
  const start = new Date(end);
  start.setDate(start.getDate() - daysMap[preset]);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

// ---------- Rep extraction ----------

export function extractReps(deals: FunnelDeal[]): Rep[] {
  const map = new Map<string, string>();
  for (const d of deals) {
    const id = d.ownerId ?? "";
    if (id && !map.has(id)) {
      map.set(id, d.repName ?? id);
    }
  }
  return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

// ---------- Deal filtering ----------

export function filterDeals(
  deals: FunnelDeal[],
  dateRange: DateRange,
  repId: string | null
): FunnelDeal[] {
  return deals.filter((d) => {
    if (dateRange.start && d.createdAt) {
      const created = new Date(d.createdAt);
      if (created < dateRange.start || created > dateRange.end) return false;
    }
    if (repId && d.ownerId !== repId) return false;
    return true;
  });
}

// ---------- Funnel recomputation ----------

/** Stage labels considered "terminal" (end of funnel). */
const TERMINAL_LABELS = new Set([
  "Closed Won",
  "Closed Lost",
  "Unlikely",
  "Churn",
  "Ping Later",
  "On Hold",
]);

/** Stage labels for demo-booked tracking (same set as RepScoreboardCard). */
const DEMO_BOOKED_LABELS = new Set([
  "Demo Scheduled",
  "No-Show/Reschedule",
  "Demo Follow-Up",
  "Budgetary Quote Sent",
  "Payment Link Sent",
  "Free Trial",
  "Freemium",
  "Subscription",
  "Closed Won",
  "Closed Lost",
]);

export interface FilteredFunnelMetrics {
  totalDeals: number;
  closedWon: number;
  closedLost: number;
  unlikely: number;
  churn: number;
  activeSubscriptions: number;
  noShows: number;
  demoScheduled: number;
  demoFollowUp: number;
  notActivated: number;
  avgDealSize: number;
  winRate: number;
  effectiveWinRate: number;
  noShowRate: number;
  stages: Array<{ stageId: string; label: string; count: number; value: number }>;
  dealsBySource: Array<{ source: string; count: number; value: number }>;
  dealsByRep: Array<{
    repName: string;
    count: number;
    value: number;
    closedWon: number;
    closedWonValue: number;
  }>;
}

export function recomputeFunnelMetrics(
  deals: FunnelDeal[],
  stageOrder?: string[]
): FilteredFunnelMetrics {
  // Stage tallies
  const stageCounts = new Map<string, { stageId: string; count: number; value: number }>();
  const seenOrder: string[] = [];

  // Source tallies
  const sourceCounts = new Map<string, { count: number; value: number }>();

  // Rep tallies
  const repCounts = new Map<
    string,
    { repName: string; count: number; value: number; closedWon: number; closedWonValue: number }
  >();

  let closedWon = 0;
  let closedLost = 0;
  let unlikely = 0;
  let churn = 0;
  let noShows = 0;
  let demoScheduled = 0;
  let demoFollowUp = 0;
  let notActivated = 0;
  let activeSubscriptions = 0;
  let totalValue = 0;

  for (const d of deals) {
    const label = d.stageLabel;
    const amt = d.amount ?? 0;
    totalValue += amt;

    // Stage counts
    if (!stageCounts.has(label)) {
      stageCounts.set(label, { stageId: d.stageId, count: 0, value: 0 });
      seenOrder.push(label);
    }
    const sc = stageCounts.get(label)!;
    sc.count += 1;
    sc.value += amt;

    // Source counts
    const src = d.source || "Unknown";
    if (!sourceCounts.has(src)) sourceCounts.set(src, { count: 0, value: 0 });
    const srcc = sourceCounts.get(src)!;
    srcc.count += 1;
    srcc.value += amt;

    // Rep counts
    const ownerId = d.ownerId ?? "__unassigned__";
    const repName = d.repName ?? (d.ownerId ? d.ownerId : "Unassigned");
    if (!repCounts.has(ownerId)) {
      repCounts.set(ownerId, { repName, count: 0, value: 0, closedWon: 0, closedWonValue: 0 });
    }
    const rc = repCounts.get(ownerId)!;
    rc.count += 1;
    rc.value += amt;

    // Stage-specific tallies
    switch (label) {
      case "Closed Won":
        closedWon += 1;
        rc.closedWon += 1;
        rc.closedWonValue += amt;
        break;
      case "Closed Lost":
        closedLost += 1;
        break;
      case "Unlikely":
        unlikely += 1;
        break;
      case "Churn":
        churn += 1;
        break;
      case "No-Show/Reschedule":
        noShows += 1;
        break;
      case "Demo Scheduled":
        demoScheduled += 1;
        break;
      case "Demo Follow-Up":
        demoFollowUp += 1;
        break;
      case "Freemium":
        notActivated += 1;
        break;
      case "Subscription":
        activeSubscriptions += 1;
        break;
    }
  }

  const totalDeals = deals.length;
  const decided = closedWon + closedLost;
  const effectiveDecided = closedWon + closedLost + unlikely + churn;
  const demosForRate = DEMO_BOOKED_LABELS
    ? deals.filter((d) => DEMO_BOOKED_LABELS.has(d.stageLabel)).length
    : 0;

  const winRate = decided > 0 ? (closedWon / decided) * 100 : 0;
  const effectiveWinRate = effectiveDecided > 0 ? (closedWon / effectiveDecided) * 100 : 0;
  const noShowRate = demosForRate > 0 ? (noShows / demosForRate) * 100 : 0;
  const avgDealSize = totalDeals > 0 ? totalValue / totalDeals : 0;

  // Build ordered stage list
  const order = stageOrder ?? seenOrder;
  const stages = order
    .filter((label) => stageCounts.has(label))
    .map((label) => {
      const { stageId, count, value } = stageCounts.get(label)!;
      return { stageId, label, count, value };
    });
  // Include any stages not in order (e.g. terminal stages seen in data but not in FUNNEL_ORDER)
  for (const label of seenOrder) {
    if (!stages.some((s) => s.label === label)) {
      const { stageId, count, value } = stageCounts.get(label)!;
      stages.push({ stageId, label, count, value });
    }
  }

  const dealsBySource = Array.from(sourceCounts, ([source, { count, value }]) => ({
    source,
    count,
    value,
  })).sort((a, b) => b.value - a.value);

  const dealsByRep = Array.from(repCounts.values()).sort((a, b) => b.value - a.value);

  return {
    totalDeals,
    closedWon,
    closedLost,
    unlikely,
    churn,
    activeSubscriptions,
    noShows,
    demoScheduled,
    demoFollowUp,
    notActivated,
    avgDealSize,
    winRate,
    effectiveWinRate,
    noShowRate,
    stages,
    dealsBySource,
    dealsByRep,
  };
}
