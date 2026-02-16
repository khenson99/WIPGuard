"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

export default function AutomationApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchApprovals = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/automations/approvals", { cache: "no-store" });
      const payload = (await response.json()) as unknown;
      setApprovals(Array.isArray(payload) ? (payload as ApprovalItem[]) : []);
    } catch {
      setError("Could not fetch approvals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchApprovals();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const decide = async (approvalId: string, action: "approve" | "reject") => {
    const note = window.prompt(`${action === "approve" ? "Approve" : "Reject"} note (optional)`) || undefined;

    const response = await fetch(`/api/automations/approvals/${approvalId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error || "Decision failed");
      return;
    }

    await fetchApprovals();
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
                    onClick={() => decide(approval.id, "reject")}
                    className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-500"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => decide(approval.id, "approve")}
                    className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-600"
                  >
                    Approve
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
