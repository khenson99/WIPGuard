import {
  buildHubspotSearchUrl,
  scoreCodaEngagedLeads,
  resolveHubspotContactsByEmail,
} from "@/lib/analytics/coda-lead-intelligence";
import type {
  AnalyticsTimestamp,
  CodaCard,
  CodaCreatorBreakdown,
  CodaCreatorWindow,
  CodaKanbanData,
  CodaNewCreatorFeedEntry,
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

  const now = options.now ?? options.toDate ?? new Date();
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

  const tablesData = (await tablesResponse.json()) as CodaTablesResponse;
  if (!tablesData.items || tablesData.items.length === 0) {
    throw new Error("No tables found in Coda document");
  }

  let selectedTable = tablesData.items[0];
  const tasksTable = tablesData.items.find((table) => table.name.toLowerCase() === "tasks");
  const kanbanTable = tablesData.items.find((table) => table.name.toLowerCase() === "kanban");
  if (tasksTable) {
    selectedTable = tasksTable;
  } else if (kanbanTable) {
    selectedTable = kanbanTable;
  }
  const tableId = selectedTable.id;

  const columnsUrl = `${CODA_API_BASE}/docs/${docId}/tables/${tableId}/columns`;
  const columnsResponse = await fetch(columnsUrl, { headers, cache: "no-store" });
  if (!columnsResponse.ok) {
    throw new Error(
      `Failed to fetch columns: ${columnsResponse.status} ${columnsResponse.statusText}`
    );
  }

  const columnsData = (await columnsResponse.json()) as CodaColumnsResponse;
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

  const rows: CodaRow[] = [];
  let nextPageToken: string | null = null;
  do {
    const rowsResponse = await fetch(
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

    const rowsData = (await rowsResponse.json()) as CodaRowsResponse;
    rows.push(...(rowsData.items || []));
    nextPageToken = rowsData.nextPageToken ?? null;
  } while (nextPageToken);

  const cards: EnrichedCard[] = rows.map((row) => {
    const nameValue = readRowValue(row, nameColumnId, columns);
    const statusValue = readRowValue(row, statusColumnId, columns);
    const priorityValue = readRowValue(row, priorityColumnId, columns);
    const assigneeValue = readRowValue(row, assigneeColumnId, columns);
    const creatorValue = readRowValue(row, creatorColumn.columnId, columns);

    const creator = parseCreator(creatorValue);
    const cardName =
      typeof nameValue === "string" && nameValue.trim().length > 0
        ? nameValue.trim()
        : row.name || `Card ${row.id}`;
    const status =
      typeof statusValue === "string" && statusValue.trim().length > 0
        ? statusValue.trim()
        : "Backlog";
    const createdAtIso = parseIso(row.createdAt) ?? parseIso(row.updatedAt);

    return {
      id: row.id,
      name: cardName,
      status,
      priority: typeof priorityValue === "string" ? priorityValue : undefined,
      assignee: typeof assigneeValue === "string" ? assigneeValue : undefined,
      creator: creator.creator,
      creatorEmail: creator.email,
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

  const maxLeadCandidates = Math.max(1, options.maxLeadCandidates ?? 25);
  const topLeadCandidates = scoredLeads.slice(0, maxLeadCandidates);

  let hubspotMatchingErrors = 0;
  const hubspotLookup =
    options.hubspotAccessToken && (recentSubmitters.length > 0 || topLeadCandidates.length > 0)
      ? await resolveHubspotContactsByEmail({
          accessToken: options.hubspotAccessToken,
          emails: [
            ...recentSubmitters.map((entry) => entry.email),
            ...topLeadCandidates.map((entry) => entry.email),
          ],
        })
      : null;

  if (hubspotLookup) {
    hubspotMatchingErrors = hubspotLookup.errors;
  }

  const engagedLeadCandidates = scoredLeads.map((candidate) => {
    const result = hubspotLookup?.results.get(candidate.email);
    return {
      ...candidate,
      funnelStatus: result?.status ?? "unknown",
      hubspotContact: result?.contact ?? null,
    };
  });

  const enrichedRecentSubmitters = recentSubmitters.map((entry) => {
    const result = hubspotLookup?.results.get(entry.email);
    return {
      ...entry,
      hubspotStatus: result?.status ?? "unknown",
      hubspotContact: result?.contact ?? null,
    };
  });

  return {
    totalCards: cardsInRange.length,
    cardsByStatus,
    recentCards,
    creatorWindows,
    newCreatorFeed,
    trends: {
      newCreators30d,
      cardsCreated90d,
    },
    engagedLeadCandidates,
    rangeSummary,
    recentSubmitters: enrichedRecentSubmitters,
    diagnostics: {
      creatorResolutionMode,
      unknownCreatorRatio: Math.round(unknownCreatorRatio * 10) / 10,
      unknownCardCount: unknownCards,
      hubspotMatchingErrors,
    },
    _meta: makeMeta("live"),
  };
}
