"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, BookOpen, Calendar, ChevronDown, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";

interface LogbookEntry {
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

export default function LogbookPage() {
  const [entries, setEntries] = useState<LogbookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const fetchIdRef = useRef(0);
  const cacheKey = `dashboard:logbook:v1:${page}:${startDate || "all"}:${endDate || "all"}`;

  const exportFilename = useCallback(
    (ext: string) => {
      if (startDate && endDate) return `logbook-${startDate}-to-${endDate}.${ext}`;
      if (startDate) return `logbook-from-${startDate}.${ext}`;
      if (endDate) return `logbook-to-${endDate}.${ext}`;
      return `logbook-all.${ext}`;
    },
    [startDate, endDate],
  );

  const escapeCsvField = useCallback((value: string | null): string => {
    if (value === null || value === undefined) return "";
    const str = String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }, []);

  const downloadBlob = useCallback((content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, []);

  const handleExport = useCallback(
    (format: "csv" | "json") => {
      setExportOpen(false);
      if (entries.length === 0) return;

      if (format === "json") {
        const json = JSON.stringify(entries, null, 2);
        downloadBlob(json, exportFilename("json"), "application/json");
        return;
      }

      const columns: (keyof LogbookEntry)[] = [
        "id",
        "taskTitle",
        "taskNotes",
        "projectName",
        "sprintName",
        "priority",
        "status",
        "responsible",
        "accountable",
        "completedOn",
        "archivedAt",
      ];
      const header = columns.join(",");
      const rows = entries.map((entry) =>
        columns.map((col) => escapeCsvField(entry[col])).join(","),
      );
      const csv = [header, ...rows].join("\n");
      downloadBlob(csv, exportFilename("csv"), "text/csv");
    },
    [entries, downloadBlob, escapeCsvField, exportFilename],
  );

  /* Close export dropdown on outside click */
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    if (exportOpen) {
      document.addEventListener("mousedown", onClickOutside);
      return () => document.removeEventListener("mousedown", onClickOutside);
    }
  }, [exportOpen]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const id = ++fetchIdRef.current;
    const cached = readSessionCache<LogbookEntry[]>(cacheKey);

    if (cached) {
      queueMicrotask(() => {
        if (!active) return;
        setEntries(cached);
        setLoading(false);
      });
    } else {
      queueMicrotask(() => {
        if (!active) return;
        setLoading(true);
      });
    }

    const params = new URLSearchParams({
      page: page.toString(),
      limit: "25",
    });
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);

    fetch(`/api/logbook?${params}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch");
        return r.json();
      })
      .then((data) => {
        if (active && id === fetchIdRef.current) {
          const nextEntries = (data?.entries ?? (Array.isArray(data) ? data : [])) as LogbookEntry[];
          setEntries(nextEntries);
          setError(null);
          writeSessionCache<LogbookEntry[]>(cacheKey, nextEntries);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!active || (err instanceof Error && err.name === "AbortError")) {
          return;
        }
        if (id === fetchIdRef.current) {
          setError("Failed to load log entries");
          console.error("Logbook fetch failed:", err);
          if (!cached) {
            setLoading(false);
          }
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [cacheKey, endDate, page, startDate]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <BookOpen className="h-5 w-5 text-primary" />
              Logbook
            </h1>
            <p className="text-xs text-muted-foreground">
              Completed task archive with full audit trail
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <input
              type="date"
              aria-label="Start date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="rounded-md border border-border bg-secondary px-2 py-1 text-xs text-foreground"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              aria-label="End date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="rounded-md border border-border bg-secondary px-2 py-1 text-xs text-foreground"
            />
            <div ref={exportRef} className="relative ml-2">
              <button
                aria-label="Export entries"
                aria-expanded={exportOpen}
                aria-haspopup="true"
                onClick={() => setExportOpen((prev) => !prev)}
                disabled={entries.length === 0}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2.5 py-1 text-xs text-foreground hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="h-3.5 w-3.5" />
                Export
                <ChevronDown className="h-3 w-3" />
              </button>
              {exportOpen && (
                <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-md border border-border bg-card py-1 shadow-lg">
                  <button
                    onClick={() => handleExport("csv")}
                    className="flex w-full items-center px-3 py-1.5 text-xs text-foreground hover:bg-secondary"
                  >
                    Export as CSV
                  </button>
                  <button
                    onClick={() => handleExport("json")}
                    className="flex w-full items-center px-3 py-1.5 text-xs text-foreground hover:bg-secondary"
                  >
                    Export as JSON
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <AlertTriangle className="h-8 w-8 text-yellow-500" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                fetchIdRef.current++;
                const retryParams = new URLSearchParams({
                  page: page.toString(),
                  limit: "25",
                });
                if (startDate) retryParams.set("startDate", startDate);
                if (endDate) retryParams.set("endDate", endDate);
                const retryId = fetchIdRef.current;
                fetch(`/api/logbook?${retryParams}`)
                  .then((r) => {
                    if (!r.ok) throw new Error("Failed to fetch");
                    return r.json();
                  })
                  .then((data) => {
                    if (retryId === fetchIdRef.current) {
                      const nextEntries = (data?.entries ?? (Array.isArray(data) ? data : [])) as LogbookEntry[];
                      setEntries(nextEntries);
                      setError(null);
                      writeSessionCache<LogbookEntry[]>(cacheKey, nextEntries);
                      setLoading(false);
                    }
                  })
                  .catch((err) => {
                    if (retryId === fetchIdRef.current) {
                      setError("Failed to load log entries");
                      console.error("Logbook fetch failed:", err);
                      setLoading(false);
                    }
                  });
              }}
              className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
            >
              Retry
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="mt-12 text-center text-sm text-muted-foreground">
            No completed tasks in this date range.
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-foreground">
                      {entry.taskTitle}
                    </h3>
                    {entry.taskNotes && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {entry.taskNotes}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.completedOn).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  {entry.projectName && (
                    <span className="rounded bg-secondary px-1.5 py-0.5">
                      {entry.projectName}
                    </span>
                  )}
                  {entry.sprintName && <span>{entry.sprintName}</span>}
                  <span>{entry.priority}</span>
                  {entry.responsible && (
                    <span>Owner: {entry.responsible}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-center gap-3">
          <button
            aria-label="Previous page"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span aria-live="polite" className="text-xs text-muted-foreground">Page {page}</span>
          <button
            aria-label="Next page"
            onClick={() => setPage(page + 1)}
            disabled={entries.length < 25}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>
      </div>
    </div>
  );
}
