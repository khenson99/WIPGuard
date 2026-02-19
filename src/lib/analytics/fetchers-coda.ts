import type { CodaCard, CodaKanbanData, AnalyticsTimestamp } from "./types";

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

interface CodaRow {
  id: string;
  name?: string;
  createdAt?: string;
  updatedAt?: string;
  values: Record<string, string | number | boolean | null | undefined>;
}

interface CodaTablesResponse {
  items: CodaTable[];
}

interface CodaColumnsResponse {
  items: CodaColumn[];
}

interface CodaRowsResponse {
  items: CodaRow[];
}

export async function fetchCodaData(
  apiToken: string,
  docId: string
): Promise<CodaKanbanData> {
  const headers = {
    Authorization: `Bearer ${apiToken}`,
    Accept: "application/json",
  };

  // Step 1: Get all tables in the doc
  const tablesUrl = `${CODA_API_BASE}/docs/${docId}/tables`;
  const tablesResponse = await fetch(tablesUrl, { headers });

  if (!tablesResponse.ok) {
    throw new Error(
      `Failed to fetch tables: ${tablesResponse.status} ${tablesResponse.statusText}`
    );
  }

  const tablesData = (await tablesResponse.json()) as CodaTablesResponse;

  if (!tablesData.items || tablesData.items.length === 0) {
    throw new Error("No tables found in Coda document");
  }

  // Step 2: Find the first table, or prefer one named "Tasks" or "Kanban"
  let selectedTable = tablesData.items[0];
  const tasksTable = tablesData.items.find(
    (t) => t.name.toLowerCase() === "tasks"
  );
  const kanbanTable = tablesData.items.find(
    (t) => t.name.toLowerCase() === "kanban"
  );

  if (tasksTable) {
    selectedTable = tasksTable;
  } else if (kanbanTable) {
    selectedTable = kanbanTable;
  }

  const tableId = selectedTable.id;

  // Step 3: Get columns to build a lookup from column name to column ID
  const columnsUrl = `${CODA_API_BASE}/docs/${docId}/tables/${tableId}/columns`;
  const columnsResponse = await fetch(columnsUrl, { headers });

  if (!columnsResponse.ok) {
    throw new Error(
      `Failed to fetch columns: ${columnsResponse.status} ${columnsResponse.statusText}`
    );
  }

  const columnsData = (await columnsResponse.json()) as CodaColumnsResponse;
  const columns = columnsData.items || [];

  // Build a map from lowercased column name -> column ID
  const columnNameToId: Record<string, string> = {};
  columns.forEach((col) => {
    columnNameToId[col.name.toLowerCase()] = col.id;
  });

  // Identify special column IDs
  const nameColumnId = columnNameToId["name"] ?? columnNameToId["title"] ?? null;
  const statusColumnId = columnNameToId["status"] ?? null;
  const priorityColumnId = columnNameToId["priority"] ?? null;
  const assigneeColumnId = columnNameToId["assignee"] ?? null;

  // Step 4: Fetch all rows (values keyed by column ID)
  const rowsUrl = `${CODA_API_BASE}/docs/${docId}/tables/${tableId}/rows?limit=500&valueFormat=simple`;
  const rowsResponse = await fetch(rowsUrl, { headers });

  if (!rowsResponse.ok) {
    throw new Error(
      `Failed to fetch rows: ${rowsResponse.status} ${rowsResponse.statusText}`
    );
  }

  const rowsData = (await rowsResponse.json()) as CodaRowsResponse;
  const rows = rowsData.items || [];

  // Step 5: Map rows to CodaCard objects via column ID lookups
  const cards: CodaCard[] = rows.map((row) => {
    const values = row.values || {};

    const name = nameColumnId
      ? String(values[nameColumnId] ?? "") || row.name || `Card ${row.id}`
      : row.name || `Card ${row.id}`;

    const status = statusColumnId
      ? String(values[statusColumnId] ?? "") || "Backlog"
      : "Backlog";

    const priority = priorityColumnId
      ? values[priorityColumnId] != null
        ? String(values[priorityColumnId])
        : undefined
      : undefined;

    const assignee = assigneeColumnId
      ? values[assigneeColumnId] != null
        ? String(values[assigneeColumnId])
        : undefined
      : undefined;

    return {
      id: row.id,
      name,
      status,
      priority,
      assignee,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });

  // Step 6: Aggregate by status
  const statusMap = new Map<string, number>();
  cards.forEach((card) => {
    const count = statusMap.get(card.status) || 0;
    statusMap.set(card.status, count + 1);
  });

  const cardsByStatus = Array.from(statusMap.entries()).map(
    ([status, count]) => ({
      status,
      count,
    })
  );

  // Step 7: Get 10 most recently updated cards
  const recentCards = [...cards]
    .sort((a, b) => {
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return timeB - timeA;
    })
    .slice(0, 10);

  return {
    totalCards: cards.length,
    cardsByStatus,
    recentCards,
    _meta: makeMeta("live"),
  };
}
