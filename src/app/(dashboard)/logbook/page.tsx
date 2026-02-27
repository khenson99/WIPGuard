"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
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
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const fetchIdRef = useRef(0);
  const cacheKey = `dashboard:logbook:v1:${page}:${startDate || "all"}:${endDate || "all"}`;

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
      .then((r) => r.json())
      .then((data) => {
        if (active && id === fetchIdRef.current) {
          const nextEntries = (data?.entries ?? (Array.isArray(data) ? data : [])) as LogbookEntry[];
          setEntries(nextEntries);
          writeSessionCache<LogbookEntry[]>(cacheKey, nextEntries);
          setLoading(false);
        }
      })
      .catch((error) => {
        if (!active || (error instanceof Error && error.name === "AbortError")) {
          return;
        }
        if (id === fetchIdRef.current && !cached) {
          setLoading(false);
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
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
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
