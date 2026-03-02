/**
 * Shared CSV export utility for analytics drilldown panels.
 */

function escapeCsvValue(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Build a CSV string from headers and row data. */
export function buildCsvString(headers: string[], rows: string[][]): string {
  const lines = [
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) => row.map(escapeCsvValue).join(",")),
  ];
  return lines.join("\n");
}

function normalizeCsvFilename(filename: string): string {
  return filename.toLowerCase().endsWith(".csv") ? filename : `${filename}.csv`;
}

/** Trigger a browser file download for the given CSV content. */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: string[][],
): void {
  const csv = buildCsvString(headers, rows);
  // Prepend UTF-8 BOM for Excel compatibility.
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = normalizeCsvFilename(filename);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
