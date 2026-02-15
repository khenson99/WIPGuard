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
  createdAt?: string;
  updatedAt?: string;
  values: (string | number | boolean | null | undefined)[];
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

  // Step 3: Get columns to map names
  const columnsUrl = `${CODA_API_BASE}/docs/${docId}/tables/${tableId}/columns`;
  const columnsResponse = await fetch(columnsUrl, { headers });

  if (!columnsResponse.ok) {
    throw new Error(
      `Failed to fetch columns: ${columnsResponse.status} ${columnsResponse.statusText}`
    );
  }

  const columnsData = (await columnsResponse.json()) as CodaColumnsResponse;
  const columns = columnsData.items || [];

  // Build column index map
  const columnIndexMap: Record<string, number> = {};
  columns.forEach((col, index) => {
    columnIndexMap[col.name.toLowerCase()] = index;
  });

  // Identify special columns
  const nameColumnIndex =
    columnIndexMap["name"] ?? columnIndexMap["title"] ?? 0;
  const statusColumnIndex = columnIndexMap["status"] ?? -1;
  const priorityColumnIndex = columnIndexMap["priority"] ?? -1;
  const assigneeColumnIndex = columnIndexMap["assignee"] ?? -1;

  // Step 4: Fetch all rows
  const rowsUrl = `${CODA_API_BASE}/docs/${docId}/tables/${tableId}/rows?limit=500`;
  const rowsResponse = await fetch(rowsUrl, { headers });

  if (!rowsResponse.ok) {
    throw new Error(
      `Failed to fetch rows: ${rowsResponse.status} ${rowsResponse.statusText}`
    );
  }

  const rowsData = (await rowsResponse.json()) as CodaRowsResponse;
  const rows = rowsData.items || [];

  // Step 5: Map rows to CodaCard objects
  const cards: CodaCard[] = rows.map((row) => {
    const name =
      (row.values[nameColumnIndex] as string | undefined) || `Card ${row.id}`;
    const status =
      statusColumnIndex >= 0
        ? (row.values[statusColumnIndex] as string | undefined) || "Backlog"
        : "Backlog";
    const priority =
      priorityColumnIndex >= 0
        ? (row.values[priorityColumnIndex] as string | undefined)
        : undefined;
    const assignee =
      assigneeColumnIndex >= 0
        ? (row.values[assigneeColumnIndex] as string | undefined)
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
