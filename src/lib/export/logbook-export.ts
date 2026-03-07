/**
 * Pure utility functions for serializing logbook entries to CSV/JSON.
 * No DOM dependency in serialization functions — only downloadCSV/downloadJSON touch the DOM.
 */

export interface LogbookEntry {
  id: string;
  taskTitle: string;
  taskNotes: string | null;
  projectName: string | null;
  sprintName: string | null;
  priority: string;
  status: string;
  responsible: string | null;
  accountable: string | null;
  completedOn: string;
  archivedAt: string;
}

export const CSV_COLUMNS: {
  header: string;
  accessor: (e: LogbookEntry) => string;
}[] = [
  { header: "ID", accessor: (e) => e.id },
  { header: "Task", accessor: (e) => e.taskTitle },
  { header: "Notes", accessor: (e) => e.taskNotes ?? "" },
  { header: "Project", accessor: (e) => e.projectName ?? "" },
  { header: "Sprint", accessor: (e) => e.sprintName ?? "" },
  { header: "Priority", accessor: (e) => e.priority },
  { header: "Status", accessor: (e) => e.status },
  { header: "Responsible", accessor: (e) => e.responsible ?? "" },
  { header: "Accountable", accessor: (e) => e.accountable ?? "" },
  { header: "Completed On", accessor: (e) => e.completedOn ? new Date(e.completedOn).toISOString() : "" },
  { header: "Archived At", accessor: (e) => e.archivedAt ? new Date(e.archivedAt).toISOString() : "" },
];

function escapeCSVCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Serialize entries to CSV with UTF-8 BOM (\uFEFF) prepended.
 * BOM ensures Excel on Windows auto-detects UTF-8 encoding.
 * Uses CRLF (\r\n) line endings per RFC 4180.
 */
export function serializeToCSV(entries: LogbookEntry[]): string {
  const BOM = "\uFEFF";
  const header = CSV_COLUMNS.map((c) => c.header).join(",");
  const rows = entries.map((entry) =>
    CSV_COLUMNS.map((col) => escapeCSVCell(String(col.accessor(entry)))).join(",")
  );
  return BOM + [header, ...rows].join("\r\n");
}

export function serializeToJSON(entries: LogbookEntry[]): string {
  const data = entries.map((entry) => {
    const obj: Record<string, string> = {};
    CSV_COLUMNS.forEach((col) => {
      obj[col.header] = String(col.accessor(entry));
    });
    return obj;
  });
  return JSON.stringify(data, null, 2);
}

function buildFilename(ext: string, dateRange?: { from: Date; to: Date } | null): string {
  const base = "the-mother-node-logbook";
  if (dateRange) {
    const from = dateRange.from.toISOString().slice(0, 10);
    const to = dateRange.to.toISOString().slice(0, 10);
    return `${base}_${from}_${to}.${ext}`;
  }
  return `${base}_${new Date().toISOString().slice(0, 10)}.${ext}`;
}

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadCSV(
  entries: LogbookEntry[],
  dateRange?: { from: Date; to: Date } | null
): void {
  const content = serializeToCSV(entries);
  triggerDownload(content, buildFilename("csv", dateRange), "text/csv;charset=utf-8;");
}

export function downloadJSON(
  entries: LogbookEntry[],
  dateRange?: { from: Date; to: Date } | null
): void {
  const content = serializeToJSON(entries);
  triggerDownload(content, buildFilename("json", dateRange), "application/json;charset=utf-8;");
}
