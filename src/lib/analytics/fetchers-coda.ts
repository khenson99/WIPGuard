import {
  buildHubspotSearchUrl,
  enrichCodaLeadFunnelStatus,
  scoreCodaEngagedLeads,
} from "@/lib/analytics/coda-lead-intelligence";
import { safeJson } from "@/lib/analytics/fetcher-utils";
import { enrichStripeEmails } from "@/lib/analytics/stripe-email-enrichment";
import type {
  AnalyticsTimestamp,
  CodaCard,
  CodaCreatorBreakdown,
  CodaCreatorWindow,
  CodaKanbanData,
  CodaNewCreatorFeedEntry,
} from "./types";

const CODA_API_BASE = "https://coda.io/apis/v1";

function makeMeta(source: "live" | "cached" = "live"): AnalyticsTimestamp {
  const now = new Date();
  return {
    fetchedAt: now.toISOString(),
    nextRefresh: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    source,
  };
}

interface CodaTable {
  id: string;
  name: string;
}

interface CodaColumn {
  id: string;
  name: string;
}

type CodaRowCell =
  | string
  | number
  | boolean
  | null
  | undefined
  | {
      name?: string;
      email?: string;
      displayName?: string;
    };

interface CodaRow {
  id: string;
  name?: string;
  createdAt?: string;
  updatedAt?: string;
  values: Record<string, CodaRowCell> | CodaRowCell[];
}

interface CodaTablesResponse {
  items: CodaTable[];
}

interface CodaColumnsResponse {
  items: CodaColumn[];
}

interface CodaRowsResponse {
  items: CodaRow[];
  nextPageToken?: string;
}

export interface FetchCodaDataOptions {
  creatorColumn?: string;
  hubspotAccessToken?: string | null;
  stripeKey?: string | null;
  maxLeadCandidates?: number;
  maxRecentSubmitters?: number;
  fromDate?: Date;
  toDate?: Date;
  now?: Date;
}

interface EnrichedCard extends CodaCard {
  creator: string;
  creatorEmail: string | null;
  createdAtIso: string | null;
}

function normalizeName(value: string | undefined): string {
  const name = value?.trim();
  return name && name.length > 0 ? name : "Unknown";
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function parseIso(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function toDayKey(iso: string | null): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

function toUtcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function isWithinDays(iso: string | null, days: number, now: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  const ageMs = now.getTime() - t;
  return ageMs >= 0 && ageMs <= days * 24 * 60 * 60 * 1000;
}

function isWithinPreviousWindow(iso: string | null, days: number, now: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  const ageMs = now.getTime() - t;
  const windowMs = days * 24 * 60 * 60 * 1000;
  return ageMs > windowMs && ageMs <= windowMs * 2;
}

function isWithinRange(iso: string | null, from: Date, to: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return t >= from.getTime() && t <= to.getTime();
}

function isCompletedStatus(status: string | null | undefined): boolean {
  const normalized = (status ?? "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "downloaded") return true;
  return ["done", "complete", "completed", "closed", "resolved", "shipped"].some((token) =>
    normalized.includes(token)
  );
}
function readRowValue(
  row: CodaRow,
  columnId: string | null,
  columns: CodaColumn[]
): CodaRowCell {
  if (!columnId) return undefined;

  if (Array.isArray(row.values)) {
    const index = columns.findIndex((column) => column.id === columnId);
    if (index < 0) return undefined;
    return row.values[index];
  }

  return row.values[columnId];
}

function parseCreator(cell: CodaRowCell): { creator: string; email: string | null } {
  if (!cell) {
    return { creator: "Unknown", email: null };
  }
  if (typeof cell === "string") {
    const trimmed = cell.trim();
    if (trimmed.includes("@")) {
      return { creator: trimmed, email: normalizeEmail(trimmed) };
    }
    return { creator: normalizeName(trimmed), email: null };
  }
  if (typeof cell === "object") {
    const creator = normalizeName(cell.displayName || cell.name || cell.email);
    return {
      creator,
      email: normalizeEmail(cell.email),
    };
  }
  return { creator: "Unknown", email: null };
}

function buildCreatorWindow(
  cards: EnrichedCard[],
  windowDays: 30 | 60 | 90,
  now: Date
): CodaCreatorWindow {
  const currentWindowCards = cards.filter((card) =>
    isWithinDays(card.createdAtIso, windowDays, now)
  );
  const previousWindowCards = cards.filter((card) =>
    isWithinPreviousWindow(card.createdAtIso, windowDays, now)
  );

  const byCreatorMap = new Map<
    string,
    {
      creator: string;
      email: string | null;
      cardCount: number;
      activeDays: Set<string>;
      firstCardAt: string | null;
      lastCardAt: string | null;
    }
  >();

  for (const card of currentWindowCards) {
    const key = `${card.creator.toLowerCase()}::${card.creatorEmail ?? "unknown"}`;
    const existing = byCreatorMap.get(key) ?? {
      creator: card.creator,
      email: card.creatorEmail,
      cardCount: 0,
      activeDays: new Set<string>(),
      firstCardAt: null,
      lastCardAt: null,
    };

    existing.cardCount += 1;
    const day = toDayKey(card.createdAtIso);
    if (day) existing.activeDays.add(day);
    if (!existing.firstCardAt || (card.createdAtIso && card.createdAtIso < existing.firstCardAt)) {
      existing.firstCardAt = card.createdAtIso;
    }
    if (!existing.lastCardAt || (card.createdAtIso && card.createdAtIso > existing.lastCardAt)) {
      existing.lastCardAt = card.createdAtIso;
    }
    byCreatorMap.set(key, existing);
  }

  const byCreator: CodaCreatorBreakdown[] = [...byCreatorMap.values()]
    .map((entry) => ({
      creator: entry.creator,
      email: entry.email,
      cardCount: entry.cardCount,
      activeDays: entry.activeDays.size,
      firstCardAt: entry.firstCardAt,
      lastCardAt: entry.lastCardAt,
    }))
    .sort((a, b) => b.cardCount - a.cardCount || b.activeDays - a.activeDays);

  return {
    windowDays,
    totalCards: currentWindowCards.length,
    previousWindowTotalCards: previousWindowCards.length,
    trendDeltaPct: pctDelta(currentWindowCards.length, previousWindowCards.length),
    uniqueCreators: byCreator.length,
    byCreator,
  };
}

function buildNewCreatorFeed(cards: EnrichedCard[]): CodaNewCreatorFeedEntry[] {
  const byCreator = new Map<
    string,
    {
      creator: string;
      email: string | null;
      firstSeenAt: string | null;
      lastSeenAt: string | null;
      cardsCreated: number;
      isUnknown: boolean;
    }
  >();

  for (const card of cards) {
    const key = `${card.creator.toLowerCase()}::${card.creatorEmail ?? "unknown"}`;
    const existing = byCreator.get(key) ?? {
      creator: card.creator,
      email: card.creatorEmail,
      firstSeenAt: null,
      lastSeenAt: null,
      cardsCreated: 0,
      isUnknown: card.creator === "Unknown",
    };
    existing.cardsCreated += 1;
    if (!existing.firstSeenAt || (card.createdAtIso && card.createdAtIso < existing.firstSeenAt)) {
      existing.firstSeenAt = card.createdAtIso;
    }
    if (!existing.lastSeenAt || (card.createdAtIso && card.createdAtIso > existing.lastSeenAt)) {
      existing.lastSeenAt = card.createdAtIso;
    }
    byCreator.set(key, existing);
  }

  return [...byCreator.values()]
    .sort((a, b) => {
      if (a.firstSeenAt && b.firstSeenAt) {
        return b.firstSeenAt.localeCompare(a.firstSeenAt);
      }
      if (a.firstSeenAt) return -1;
      if (b.firstSeenAt) return 1;
      return b.cardsCreated - a.cardsCreated;
    })
    .map((entry) => ({
      creator: entry.creator,
      email: entry.email,
      firstSeenAt: entry.firstSeenAt,
      lastSeenAt: entry.lastSeenAt,
      cardsCreated: entry.cardsCreated,
      isUnknown: entry.isUnknown,
    }));
}

function buildDailyTrend(
  cards: EnrichedCard[],
  days: number
): Array<{ date: string; count: number }> {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const day = toDayKey(card.createdAtIso);
    if (!day) continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-days)
    .map(([date, count]) => ({ date, count }));
}

function detectCreatorColumn(
  columns: CodaColumn[],
  overrideName: string | undefined
): { columnId: string | null; mode: "override" | "auto_detect" | "unknown_heavy" } {
  if (overrideName?.trim()) {
    const matched = columns.find(
      (column) => column.name.trim().toLowerCase() === overrideName.trim().toLowerCase()
    );
    if (matched) {
      return { columnId: matched.id, mode: "override" };
    }
  }

  const candidates = ["created by", "creator", "author", "owner"];
  for (const candidate of candidates) {
    const matched = columns.find((column) =>
      column.name.trim().toLowerCase().includes(candidate)
    );
    if (matched) {
      return { columnId: matched.id, mode: "auto_detect" };
    }
  }

  return { columnId: null, mode: "unknown_heavy" };
}

function detectEmailColumn(columns: CodaColumn[]): string | null {
  const candidates = ["email", "e-mail"];
  for (const column of columns) {
    const name = column.name.trim().toLowerCase();
    if (candidates.some((candidate) => name === candidate)) return column.id;
  }
  for (const column of columns) {
    const name = column.name.trim().toLowerCase();
    if (candidates.some((candidate) => name.includes(candidate))) return column.id;
  }
  return null;
}

function asHeaderValue(token: string | null): Record<string, string> {
  return token ? { "X-Coda-Page-Token": token } : {};
}

function normalizeTableName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function selectBestTable(tables: CodaTable[]): CodaTable | null {
  const scored = tables
    .map((t) => {
      const name = normalizeTableName(t.name || "");
      let score = 0;
      if (name.includes("individual") && name.includes("card")) score = Math.max(score, 100);
      if (name.includes("whitepaper")) score = Math.max(score, 90);
      if (name.includes("download")) score = Math.max(score, 80);
      if (name.includes("kanban generator") || (name.includes("kanban") && name.includes("generator"))) {
        score = Math.max(score, 70);
      }
      return { t, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.score > 0 ? scored[0]!.t : null;
}

function buildDenseDailySeries(
  start: Date,
  end: Date,
  countsByDay: Map<string, number>
): Array<{ date: string; count: number }> {
  const startKey = toUtcDayKey(start);
  const endKey = toUtcDayKey(end);
  const out: Array<{ date: string; count: number }> = [];

  const cursor = new Date(`${startKey}T00:00:00.000Z`);
  const endCursor = new Date(`${endKey}T00:00:00.000Z`);

  for (let i = 0; i < 5000; i++) {
    const key = toUtcDayKey(cursor);
    out.push({ date: key, count: countsByDay.get(key) ?? 0 });
    if (key === endKey) break;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor.getTime() > endCursor.getTime() + 36 * 60 * 60 * 1000) break;
  }

  return out;
}

export async function fetchCodaData(
  apiToken: string,
  docId: string,
  options: FetchCodaDataOptions = {}
): Promise<CodaKanbanData> {
  const now = options.now ?? new Date();
  const rangeFrom = options.fromDate ?? null;
  const rangeTo = options.toDate ?? null;
  const useRange =
    Boolean(rangeFrom && rangeTo) &&
    !Number.isNaN(rangeFrom?.getTime() ?? NaN) &&
    !Number.isNaN(rangeTo?.getTime() ?? NaN) &&
    Boolean(rangeFrom && rangeTo && rangeFrom <= rangeTo);

  const rangeDays = useRange
    ? Math.max(1, Math.ceil((rangeTo!.getTime() - rangeFrom!.getTime()) / (1000 * 60 * 60 * 24)) + 1)
    : 30;

  const windowDays = Math.max(7, Math.min(120, rangeDays));
  const headers = {
    Authorization: `Bearer ${apiToken}`,
    Accept: "application/json",
  };

  const tablesUrl = `${CODA_API_BASE}/docs/${docId}/tables`;
  const tablesResponse = await fetch(tablesUrl, { headers, cache: "no-store" });

  if (!tablesResponse.ok) {
    throw new Error(
      `Failed to fetch tables: ${tablesResponse.status} ${tablesResponse.statusText}`
    );
  }

  const tablesData = await safeJson<CodaTablesResponse>(tablesResponse, "Coda tables");
  if (!tablesData.items || tablesData.items.length === 0) {
    throw new Error("No tables found in Coda document");
  }

  // Prefer the whitepaper download table ("Individual Cards") when present.
  // Otherwise, fall back to legacy behavior.
  const tasksTable = tablesData.items.find((table) => normalizeTableName(table.name) === "tasks");
  const kanbanTable = tablesData.items.find((table) => normalizeTableName(table.name) === "kanban");
  const selectedTable = selectBestTable(tablesData.items) ?? tasksTable ?? kanbanTable ?? tablesData.items[0]!;
  const tableId = selectedTable.id;

  const columnsUrl = `${CODA_API_BASE}/docs/${docId}/tables/${tableId}/columns`;
  const columnsResponse = await fetch(columnsUrl, { headers, cache: "no-store" });
  if (!columnsResponse.ok) {
    throw new Error(
      `Failed to fetch columns: ${columnsResponse.status} ${columnsResponse.statusText}`
    );
  }

  const columnsData = await safeJson<CodaColumnsResponse>(columnsResponse, "Coda columns");
  const columns = columnsData.items || [];

  const columnNameToId: Record<string, string> = {};
  for (const column of columns) {
    columnNameToId[column.name.toLowerCase()] = column.id;
  }

  const nameColumnId = columnNameToId.name ?? columnNameToId.title ?? null;
  const statusColumnId = columnNameToId.status ?? null;
  const priorityColumnId = columnNameToId.priority ?? null;
  const assigneeColumnId = columnNameToId.assignee ?? null;
  const creatorColumn = detectCreatorColumn(columns, options.creatorColumn);
  const emailColumnId = detectEmailColumn(columns);

  const rows: CodaRow[] = [];
  let nextPageToken: string | null = null;
  do {
    const rowsResponse: Response = await fetch(
      `${CODA_API_BASE}/docs/${docId}/tables/${tableId}/rows?limit=500&valueFormat=simple`,
      {
        headers: {
          ...headers,
          ...asHeaderValue(nextPageToken),
        },
        cache: "no-store",
      }
    );

    if (!rowsResponse.ok) {
      throw new Error(
        `Failed to fetch rows: ${rowsResponse.status} ${rowsResponse.statusText}`
      );
    }

    const rowsData: CodaRowsResponse = await safeJson<CodaRowsResponse>(rowsResponse, "Coda rows");
    rows.push(...(rowsData.items || []));
    nextPageToken = rowsData.nextPageToken ?? null;
  } while (nextPageToken);

  const cards: EnrichedCard[] = rows.map((row) => {
    const nameValue = readRowValue(row, nameColumnId, columns);
    const statusValue = readRowValue(row, statusColumnId, columns);
    const priorityValue = readRowValue(row, priorityColumnId, columns);
    const assigneeValue = readRowValue(row, assigneeColumnId, columns);
    const creatorValue = readRowValue(row, creatorColumn.columnId, columns);
    const emailValue = readRowValue(row, emailColumnId, columns);

    const creator = parseCreator(creatorValue);
    const emailFromEmailColumn = (() => {
      if (!emailValue) return null;
      if (typeof emailValue === "string") return normalizeEmail(emailValue);
      if (typeof emailValue === "object") {
        const candidate = (emailValue as { email?: string }).email;
        return normalizeEmail(candidate);
      }
      return null;
    })();

    const cardName =
      typeof nameValue === "string" && nameValue.trim().length > 0
        ? nameValue.trim()
        : row.name || `Card ${row.id}`;
    const status =
      typeof statusValue === "string" && statusValue.trim().length > 0
        ? statusValue.trim()
        : "Backlog";
    const createdAtIso = parseIso(row.createdAt) ?? parseIso(row.updatedAt);
    const resolvedEmail = emailFromEmailColumn ?? normalizeEmail(creator.email);
    const resolvedCreator =
      creator.creator === "Unknown" && resolvedEmail ? resolvedEmail : creator.creator;

    return {
      id: row.id,
      name: cardName,
      status,
      priority: typeof priorityValue === "string" ? priorityValue : undefined,
      assignee: typeof assigneeValue === "string" ? assigneeValue : undefined,
      creator: resolvedCreator,
      creatorEmail: resolvedEmail,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdAtIso,
    };
  });

  const shouldFilterByRange = Boolean(options.fromDate && options.toDate);
  const cardsInRange = shouldFilterByRange
    ? cards.filter((card) => isWithinRange(card.createdAtIso, options.fromDate!, options.toDate!))
    : cards;

  const statusMap = new Map<string, number>();
  for (const card of cardsInRange) {
    statusMap.set(card.status, (statusMap.get(card.status) ?? 0) + 1);
  }

  const cardsByStatus = [...statusMap.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  const recentCards = [...cardsInRange]
    .sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 10);

  const creatorWindows: CodaCreatorWindow[] = windowDays <= 30
    ? [buildCreatorWindow(cards, 30, now)]
    : windowDays <= 60
      ? [buildCreatorWindow(cards, 30, now), buildCreatorWindow(cards, 60, now)]
      : [buildCreatorWindow(cards, 30, now), buildCreatorWindow(cards, 60, now), buildCreatorWindow(cards, 90, now)];

  const unknownCards = cards.filter((card) => card.creator === "Unknown").length;
  const unknownCreatorRatio = cards.length > 0 ? (unknownCards / cards.length) * 100 : 0;
  const creatorResolutionMode =
    creatorColumn.mode === "override"
      ? "override"
      : unknownCreatorRatio >= 50
        ? "unknown_heavy"
        : "auto_detect";

  const newCreatorFeed = buildNewCreatorFeed(cards);

  const cardsCreatedTrend = buildDailyTrend(
    cards.filter((card) => isWithinDays(card.createdAtIso, windowDays, now)),
    windowDays
  );
  const creatorFirstSeenCards = cards.filter((card) => card.creator !== "Unknown");
  const byCreatorFirstSeen = new Map<string, EnrichedCard>();
  for (const card of creatorFirstSeenCards) {
    const key = `${card.creator.toLowerCase()}::${card.creatorEmail ?? "unknown"}`;
    const existing = byCreatorFirstSeen.get(key);
    if (!existing || ((card.createdAtIso ?? "") < (existing.createdAtIso ?? ""))) {
      byCreatorFirstSeen.set(key, card);
    }
  }
  const newCreatorsTrend = buildDailyTrend(
    [...byCreatorFirstSeen.values()].filter((card) => isWithinDays(card.createdAtIso, windowDays, now)),
    windowDays
  );

  const dailyTrendStart = shouldFilterByRange
    ? options.fromDate!
    : new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000);
  const dailyTrendEnd = shouldFilterByRange ? options.toDate! : now;

  const downloadsByDay = new Map<string, number>();
  const downloadersByDay = new Map<string, Set<string>>();
  for (const card of cards) {
    if (!isWithinRange(card.createdAtIso, dailyTrendStart, dailyTrendEnd)) continue;
    const day = toDayKey(card.createdAtIso);
    if (!day) continue;
    downloadsByDay.set(day, (downloadsByDay.get(day) ?? 0) + 1);
    const email = normalizeEmail(card.creatorEmail);
    if (!email) continue;
    const existing = downloadersByDay.get(day) ?? new Set<string>();
    existing.add(email);
    downloadersByDay.set(day, existing);
  }
  const downloadersCountByDay = new Map<string, number>();
  for (const [day, set] of downloadersByDay.entries()) {
    downloadersCountByDay.set(day, set.size);
  }

  const downloadsDaily = buildDenseDailySeries(dailyTrendStart, dailyTrendEnd, downloadsByDay);
  const downloadersDaily = buildDenseDailySeries(dailyTrendStart, dailyTrendEnd, downloadersCountByDay);

  const creatorsByKey = new Map<
    string,
    {
      creator: string;
      email: string;
      cards30d: number;
      cardsPrevious30d: number;
      activeDays30d: Set<string>;
      lastActivityAt: string | null;
    }
  >();

  for (const card of cards) {
    const email = normalizeEmail(card.creatorEmail);
    if (!email) continue;
    const key = `${card.creator.toLowerCase()}::${email}`;
    const existing = creatorsByKey.get(key) ?? {
      creator: card.creator,
      email,
      cards30d: 0,
      cardsPrevious30d: 0,
      activeDays30d: new Set<string>(),
      lastActivityAt: null,
    };

    if (isWithinDays(card.createdAtIso, windowDays, now)) {
      existing.cards30d += 1;
      const day = toDayKey(card.createdAtIso);
      if (day) existing.activeDays30d.add(day);
    } else if (isWithinPreviousWindow(card.createdAtIso, windowDays, now)) {
      existing.cardsPrevious30d += 1;
    }

    if (!existing.lastActivityAt || ((card.createdAtIso ?? "") > existing.lastActivityAt)) {
      existing.lastActivityAt = card.createdAtIso;
    }
    creatorsByKey.set(key, existing);
  }

  const scoredLeads = await scoreCodaEngagedLeads({
    creators: [...creatorsByKey.values()].map((creator) => ({
      creator: creator.creator,
      email: creator.email,
      cards30d: creator.cards30d,
      cardsPrevious30d: creator.cardsPrevious30d,
      activeDays30d: creator.activeDays30d.size,
      lastActivityAt: creator.lastActivityAt,
    })),
    now,
  });

  const leadEnrichment = await enrichCodaLeadFunnelStatus({
    candidates: scoredLeads,
    hubspotAccessToken: options.hubspotAccessToken,
    maxCandidates: options.maxLeadCandidates,
  });

  const hubspotMatchingErrors = 0;

  const unknownEmailCards = cardsInRange.filter((card) => !normalizeEmail(card.creatorEmail)).length;

  const submitterAgg = new Map<
    string,
    { creator: string; email: string; cardsCreated: number; firstSubmittedAt: string | null; lastSubmittedAt: string | null }
  >();

  for (const card of cardsInRange) {
    const email = normalizeEmail(card.creatorEmail);
    if (!email) continue;
    const existing = submitterAgg.get(email) ?? {
      creator: card.creator,
      email,
      cardsCreated: 0,
      firstSubmittedAt: null,
      lastSubmittedAt: null,
    };

    existing.cardsCreated += 1;
    if (!existing.firstSubmittedAt || ((card.createdAtIso ?? "") < existing.firstSubmittedAt)) {
      existing.firstSubmittedAt = card.createdAtIso ?? null;
    }
    if (!existing.lastSubmittedAt || ((card.createdAtIso ?? "") > existing.lastSubmittedAt)) {
      existing.lastSubmittedAt = card.createdAtIso ?? null;
    }

    if (existing.creator === "Unknown" && card.creator !== "Unknown") {
      existing.creator = card.creator;
    }

    submitterAgg.set(email, existing);
  }

  const submitterEntries = [...submitterAgg.values()]
    .sort((a, b) => {
      if (b.cardsCreated !== a.cardsCreated) return b.cardsCreated - a.cardsCreated;
      return String(b.lastSubmittedAt ?? "").localeCompare(String(a.lastSubmittedAt ?? ""));
    });

  const submissions = submitterEntries.length;
  const recentSubmitterLimit = Math.max(1, options.maxRecentSubmitters ?? 25);
  const recentSubmitters = submitterEntries
    .slice(0, recentSubmitterLimit)
    .map((entry) => ({
      creator: entry.creator,
      email: entry.email,
      cardsCreated: entry.cardsCreated,
      firstSubmittedAt: entry.firstSubmittedAt,
      lastSubmittedAt: entry.lastSubmittedAt,
      hubspotContact: null,
      hubspotStatus: "unknown" as const,
      hubspotSearchUrl: buildHubspotSearchUrl(entry.email),
    }));

  const cardsCompleted = cardsInRange.filter((card) => isCompletedStatus(card.status)).length;
  const incompleteCards = cardsInRange.length - cardsCompleted;
  const topDropOffStatuses = cardsByStatus
    .filter((entry) => !isCompletedStatus(entry.status))
    .map((entry) => ({
      status: entry.status,
      count: entry.count,
      sharePct: incompleteCards > 0 ? Math.round((entry.count / incompleteCards) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const funnel = {
    stages: [
      { key: "submissions" as const, label: "Submissions", count: submissions },
      { key: "cardsCreated" as const, label: "Cards Created", count: cardsInRange.length },
      { key: "cardsCompleted" as const, label: "Cards Completed", count: cardsCompleted },
    ],
    conversions: [
      {
        from: "submissions" as const,
        to: "cardsCreated" as const,
        ratePct: submissions > 0 ? Math.round((cardsInRange.length / submissions) * 1000) / 10 : null,
      },
      {
        from: "cardsCreated" as const,
        to: "cardsCompleted" as const,
        ratePct: cardsInRange.length > 0 ? Math.round((cardsCompleted / cardsInRange.length) * 1000) / 10 : null,
      },
      {
        from: "submissions" as const,
        to: "cardsCompleted" as const,
        ratePct: submissions > 0 ? Math.round((cardsCompleted / submissions) * 1000) / 10 : null,
      },
    ],
    topDropOffStatuses,
  };

  const rangeSummary = shouldFilterByRange
    ? (() => {
        const from = options.fromDate!.toISOString().slice(0, 10);
        const to = options.toDate!.toISOString().slice(0, 10);
        const cardsCreated = cardsInRange.length;

        const msPerDay = 24 * 60 * 60 * 1000;
        const days = Math.max(1, Math.round((options.toDate!.getTime() - options.fromDate!.getTime()) / msPerDay) + 1);
        const prevStart = new Date(options.fromDate!.getTime() - days * msPerDay);
        const prevEnd = new Date(options.fromDate!.getTime() - msPerDay);

        let downloadsPrev = 0;
        const previousSubmitters = new Set<string>();
        for (const card of cards) {
          if (!isWithinRange(card.createdAtIso, prevStart, prevEnd)) continue;
          downloadsPrev += 1;
          const email = normalizeEmail(card.creatorEmail);
          if (email) previousSubmitters.add(email);
        }
        const downloadersPrev = previousSubmitters.size;

        return {
          from,
          to,
          cardsCreated,
          submissions,
          unknownEmailCards,
          downloadsPrev,
          downloadersPrev,
          downloadsDeltaPct: pctDelta(cardsCreated, downloadsPrev),
          downloadersDeltaPct: pctDelta(submissions, downloadersPrev),
        };
      })()
    : undefined;

  const stripeByEmail = await enrichStripeEmails({
    apiKey: options.stripeKey,
    emails: recentSubmitters.map((entry) => entry.email),
    now,
    concurrency: 4,
    timeoutMs: 2500,
  });

  const enrichedRecentSubmitters = recentSubmitters.map((entry) => {
    return {
      ...entry,
      hubspotStatus: "unknown" as const,
      hubspotContact: null,
      stripe: stripeByEmail.get(entry.email) ?? null,
    };
  });

  return {
    totalCards: cardsInRange.length,
    cardsByStatus,
    recentCards,
    creatorWindows,
    newCreatorFeed,
    trends: {
      newCreators30d: newCreatorsTrend,
      cardsCreated90d: cardsCreatedTrend,
      downloadsDaily,
      downloadersDaily,
    },
    funnel,
    engagedLeadCandidates: leadEnrichment.candidates,
    rangeSummary,
    recentSubmitters: enrichedRecentSubmitters,
    diagnostics: {
      creatorResolutionMode,
      unknownCreatorRatio: Math.round(unknownCreatorRatio * 10) / 10,
      unknownCardCount: unknownCards,
      hubspotMatchingErrors: hubspotMatchingErrors > 0 ? hubspotMatchingErrors : leadEnrichment.hubspotMatchingErrors,
    },
    _meta: makeMeta("live"),
  };
}
