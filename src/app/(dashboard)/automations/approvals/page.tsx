"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";

interface ApprovalItem {
  id: string;
  nodeKey: string;
  status: string;
  timeoutAt: string | null;
  createdAt?: string | null;
  run: {
    id: string;
    status: string;
    workflow: {
      id: string;
      name: string;
      scope: string;
    };
  };
  requestedBy: {
    id: string;
    name: string | null;
    email: string;
  } | null;
}

const AUTOMATION_APPROVALS_CACHE_KEY = "dashboard:automations:approvals:v1";

export default function AutomationApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notesFor, setNotesFor] = useState<{ id: string; action: "approve" | "reject" } | null>(null);
  const [notesText, setNotesText] = useState("");
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingAction, setProcessingAction] = useState<"approve" | "reject" | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchApprovals = async (options?: { preserveExisting?: boolean; signal?: AbortSignal }) => {
    if (!options?.preserveExisting) {
      setLoading(true);
    }
    setError(null);
    try {
      const response = await fetch("/api/automations/approvals", { signal: options?.signal });
      const payload = (await response.json()) as unknown;
      if (options?.signal?.aborted) return;
      const next = Array.isArray(payload) ? (payload as ApprovalItem[]) : [];
      setApprovals(next);
      writeSessionCache<ApprovalItem[]>(AUTOMATION_APPROVALS_CACHE_KEY, next);
    } catch {
      if (!options?.signal?.aborted) {
        setError("Could not fetch approvals");
      }
    } finally {
      if (!options?.signal?.aborted) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const cached = readSessionCache<ApprovalItem[]>(AUTOMATION_APPROVALS_CACHE_KEY);

    if (cached) {
      queueMicrotask(() => {
        if (!active) return;
        setApprovals(cached);
        setLoading(false);
      });
    } else {
      queueMicrotask(() => {
        if (!active) return;
        setLoading(true);
      });
    }

    void fetchApprovals({ preserveExisting: Boolean(cached), signal: controller.signal });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const decide = async (approvalId: string, action: "approve" | "reject", note?: string) => {
    if (processingId) return;

    setProcessingId(approvalId);
    setProcessingAction(action);
    try {
      const response = await fetch(`/api/automations/approvals/${approvalId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note || undefined }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error || "Decision failed");
        return;
      }

      setNotesFor(null);
      setNotesText("");
      await fetchApprovals({ preserveExisting: true });
    } finally {
      setProcessingId(null);
      setProcessingAction(null);
    }
  };

  const openNotes = (id: string, action: "approve" | "reject") => {
    if (processingId) return;
    setNotesFor({ id, action });
    setNotesText("");
    // Auto-focus textarea on next render
    setTimeout(() => notesRef.current?.focus(), 0);
  };

  const cancelNotes = () => {
    if (processingId) return;
    setNotesFor(null);
    setNotesText("");
  };

  const submitNotes = () => {
    if (!notesFor) return;
    void decide(notesFor.id, notesFor.action, notesText);
  };

  const filteredApprovals = useMemo(() => {
    let list = [...approvals];

    // Status filter
    if (statusFilter !== "all") {
      list = list.filter((a) => a.status === statusFilter);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (a) =>
          a.run.workflow.name.toLowerCase().includes(q) ||
          a.nodeKey.toLowerCase().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      const dateA = new Date(a.createdAt ?? 0).getTime();
      const dateB = new Date(b.createdAt ?? 0).getTime();
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });

    return list;
  }, [approvals, statusFilter, searchQuery, sortOrder]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Approvals</h1>
          <p className="text-xs text-muted-foreground">Workflow steps waiting for human approval.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/automations/artifacts"
            className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Artifact Inbox
          </Link>
          <Link
            href="/automations/recommendations"
            className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Recommendations
          </Link>
          <Link
            href="/automations"
            className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Back to Automations
          </Link>
        </div>
      </div>

      {error && <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-500">{error}</div>}

      <div role="group" aria-label="Review queue filters" className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search review items..."
          aria-label="Search review items"
          className="rounded-md border border-border bg-secondary px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
        >
          <option value="all">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
          aria-label="Sort order"
          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
        </select>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading review queue...</div>
      ) : filteredApprovals.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {statusFilter !== "all" || searchQuery.trim()
            ? "No approvals match the current filters."
            : "No approvals are waiting right now."}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredApprovals.map((approval) => (
            <div key={approval.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">{approval.run.workflow.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Node: {approval.nodeKey}
                    {approval.timeoutAt
                      ? ` · timeout ${new Date(approval.timeoutAt).toLocaleString()}`
                      : ""}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Requested by {approval.requestedBy?.name || approval.requestedBy?.email || "system"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/automations/${approval.run.workflow.id}`}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Open
                  </Link>
                  <button
                    onClick={() => openNotes(approval.id, "reject")}
                    disabled={processingId === approval.id}
                    className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processingId === approval.id && processingAction === "reject" ? (
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Rejecting…
                      </span>
                    ) : (
                      "Decline"
                    )}
                  </button>
                  <button
                    onClick={() => openNotes(approval.id, "approve")}
                    disabled={processingId === approval.id}
                    className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processingId === approval.id && processingAction === "approve" ? (
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Approving…
                      </span>
                    ) : (
                      "Approve for execution"
                    )}
                  </button>
                </div>
              </div>

              {notesFor?.id === approval.id && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  <textarea
                    ref={notesRef}
                    value={notesText}
                    onChange={(e) => setNotesText(e.target.value)}
                    placeholder="Add review notes (optional)..."
                    rows={2}
                    disabled={processingId === approval.id}
                    className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={submitNotes}
                      disabled={processingId === approval.id}
                      className={`rounded-md px-3 py-1 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
                        notesFor.action === "approve"
                          ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                          : "border border-red-500/40 bg-red-500/10 text-red-500"
                      }`}
                    >
                      {processingId === approval.id ? (
                        <span className="flex items-center gap-1">
                          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          {notesFor.action === "approve" ? "Approving…" : "Rejecting…"}
                        </span>
                      ) : (
                        notesFor.action === "approve" ? "Confirm approval" : "Confirm decline"
                      )}
                    </button>
                    <button
                      onClick={cancelNotes}
                      disabled={processingId === approval.id}
                      className="rounded-md border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
