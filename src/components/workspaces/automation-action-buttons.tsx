"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function ActionButton({ label, url, body }: { label: string; url: string; body?: Record<string, unknown> }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Action failed.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" onClick={() => void post()} disabled={loading} className="rounded-md border border-border bg-secondary px-2.5 py-1.5 text-xs font-medium text-foreground disabled:opacity-60">
        {loading ? "Working..." : label}
      </button>
      {error ? <span className="text-[11px] text-red-600">{error}</span> : null}
    </span>
  );
}

export function ApprovalActions({ approvalId, nodeKey }: { approvalId: string; nodeKey?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton label={`Approve${nodeKey ? ` ${nodeKey}` : ""}`} url={`/api/automations/approvals/${approvalId}/approve`} />
      <ActionButton label={`Reject${nodeKey ? ` ${nodeKey}` : ""}`} url={`/api/automations/approvals/${approvalId}/reject`} />
    </div>
  );
}

export function RecommendationActions({ recommendationId, title }: { recommendationId: string; title?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton label={`Approve${title ? ` ${title}` : ""}`} url={`/api/automations/recommendations/${recommendationId}/approve`} />
      <ActionButton label={`Reject${title ? ` ${title}` : ""}`} url={`/api/automations/recommendations/${recommendationId}/reject`} />
      <ActionButton label={`Execute${title ? ` ${title}` : ""}`} url={`/api/automations/recommendations/${recommendationId}/execute`} />
    </div>
  );
}
