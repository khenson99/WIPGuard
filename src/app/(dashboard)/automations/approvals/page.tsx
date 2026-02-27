"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";

interface ApprovalItem {
  id: string;
  nodeKey: string;
  status: string;
  timeoutAt: string | null;
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
  };

  const openNotes = (id: string, action: "approve" | "reject") => {
    setNotesFor({ id, action });
    setNotesText("");
    // Auto-focus textarea on next render
    setTimeout(() => notesRef.current?.focus(), 0);
  };

  const cancelNotes = () => {
    setNotesFor(null);
    setNotesText("");
  };

  const submitNotes = () => {
    if (!notesFor) return;
    void decide(notesFor.id, notesFor.action, notesText);
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Approval Inbox</h1>
          <p className="text-xs text-muted-foreground">Pending workflow approval steps.</p>
        </div>
        <Link
          href="/automations"
          className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Back to Automations
        </Link>
      </div>

      {error && <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-500">{error}</div>}

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading approvals...</div>
      ) : approvals.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No pending approvals.</div>
      ) : (
        <div className="space-y-2">
          {approvals.map((approval) => (
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
                    className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-500"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => openNotes(approval.id, "approve")}
                    className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-600"
                  >
                    Approve
                  </button>
                </div>
              </div>

              {notesFor?.id === approval.id && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  <textarea
                    ref={notesRef}
                    value={notesText}
                    onChange={(e) => setNotesText(e.target.value)}
                    placeholder="Add notes (optional)..."
                    rows={2}
                    className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={submitNotes}
                      className={`rounded-md px-3 py-1 text-xs font-medium ${
                        notesFor.action === "approve"
                          ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                          : "border border-red-500/40 bg-red-500/10 text-red-500"
                      }`}
                    >
                      {notesFor.action === "approve" ? "Confirm Approve" : "Confirm Reject"}
                    </button>
                    <button
                      onClick={cancelNotes}
                      className="rounded-md border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
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
