"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";

interface RecommendationItem {
  id: string;
  recommendationType: string;
  title: string;
  summary: string;
  detail: string | null;
  actionType: string;
  requiresApproval: boolean;
  status: string;
  priority: string | null;
  decisionNote: string | null;
  executionError: string | null;
  workflow: {
    id: string;
    name: string;
    operatorKey: string | null;
  };
  run: {
    id: string;
    status: string;
    createdAt: string;
  };
  artifact: {
    id: string;
    artifactType: string;
    title: string;
  } | null;
  requestedBy: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  approver: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  executedBy: {
    id: string;
    name: string | null;
    email: string;
  } | null;
}

const AUTOMATION_RECOMMENDATIONS_CACHE_KEY =
  "dashboard:automations:recommendations:v1";

export default function AutomationRecommendationsPage() {
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingAction, setProcessingAction] = useState<
    "approve" | "reject" | "execute" | null
  >(null);

  const fetchRecommendations = async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/automations/recommendations", { signal });
      const payload = (await response.json()) as unknown;
      if (signal?.aborted) return;
      const next = Array.isArray(payload) ? (payload as RecommendationItem[]) : [];
      setRecommendations(next);
      writeSessionCache<RecommendationItem[]>(
        AUTOMATION_RECOMMENDATIONS_CACHE_KEY,
        next
      );
      setError(null);
    } catch {
      if (!signal?.aborted) {
        setError("Could not fetch recommendations");
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const cached = readSessionCache<RecommendationItem[]>(
      AUTOMATION_RECOMMENDATIONS_CACHE_KEY
    );

    if (cached) {
      queueMicrotask(() => {
        if (!active) return;
        setRecommendations(cached);
        setLoading(false);
      });
    }

    void fetchRecommendations(controller.signal);

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const actOnRecommendation = async (
    recommendationId: string,
    action: "approve" | "reject" | "execute"
  ) => {
    if (processingId) return;

    setProcessingId(recommendationId);
    setProcessingAction(action);
    try {
      const response = await fetch(
        `/api/automations/recommendations/${recommendationId}/${action}`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(payload?.error ?? "Recommendation action failed");
        return;
      }

      await fetchRecommendations();
    } finally {
      setProcessingId(null);
      setProcessingAction(null);
    }
  };

  const filteredRecommendations = useMemo(() => {
    return recommendations.filter((recommendation) => {
      if (statusFilter !== "all" && recommendation.status !== statusFilter) {
        return false;
      }

      if (!searchQuery.trim()) {
        return true;
      }

      const query = searchQuery.trim().toLowerCase();
      return (
        recommendation.title.toLowerCase().includes(query) ||
        recommendation.summary.toLowerCase().includes(query) ||
        recommendation.workflow.name.toLowerCase().includes(query) ||
        recommendation.actionType.toLowerCase().includes(query)
      );
    });
  }, [recommendations, searchQuery, statusFilter]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            Recommendation Inbox
          </h1>
          <p className="text-xs text-muted-foreground">
            Review, approve, and execute operator recommendations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/automations/approvals"
            className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Approval Inbox
          </Link>
          <Link
            href="/automations"
            className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Back to Automations
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-500">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search recommendations..."
          className="rounded-md border border-border bg-secondary px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
        >
          <option value="all">All Statuses</option>
          <option value="PENDING_APPROVAL">Pending Approval</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="EXECUTED">Executed</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Loading recommendations...
        </div>
      ) : filteredRecommendations.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No recommendations match the current filters.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRecommendations.map((recommendation) => (
            <div
              key={recommendation.id}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      {recommendation.title}
                    </p>
                    <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {recommendation.status}
                    </span>
                    {recommendation.priority && (
                      <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {recommendation.priority}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {recommendation.workflow.name}
                    {recommendation.workflow.operatorKey
                      ? ` · ${recommendation.workflow.operatorKey}`
                      : ""}
                    {recommendation.artifact
                      ? ` · from ${recommendation.artifact.title}`
                      : ""}
                  </p>
                  <p className="text-sm text-foreground">{recommendation.summary}</p>
                  {recommendation.detail && (
                    <p className="text-xs text-muted-foreground">
                      {recommendation.detail}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Action: {recommendation.actionType}
                    {recommendation.requiresApproval ? " · approval required" : ""}
                  </p>
                  {recommendation.executionError && (
                    <p className="text-[11px] text-red-500">
                      Execution error: {recommendation.executionError}
                    </p>
                  )}
                  {recommendation.decisionNote && (
                    <p className="text-[11px] text-muted-foreground">
                      Decision note: {recommendation.decisionNote}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/automations/${recommendation.workflow.id}`}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Open
                  </Link>
                  {recommendation.status === "PENDING_APPROVAL" && (
                    <>
                      <button
                        onClick={() =>
                          actOnRecommendation(recommendation.id, "reject")
                        }
                        disabled={processingId === recommendation.id}
                        className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {processingId === recommendation.id &&
                        processingAction === "reject"
                          ? "Rejecting..."
                          : "Reject"}
                      </button>
                      <button
                        onClick={() =>
                          actOnRecommendation(recommendation.id, "approve")
                        }
                        disabled={processingId === recommendation.id}
                        className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {processingId === recommendation.id &&
                        processingAction === "approve"
                          ? "Approving..."
                          : "Approve"}
                      </button>
                    </>
                  )}
                  {recommendation.status === "APPROVED" && (
                    <button
                      onClick={() =>
                        actOnRecommendation(recommendation.id, "execute")
                      }
                      disabled={processingId === recommendation.id}
                      className="rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {processingId === recommendation.id &&
                      processingAction === "execute"
                        ? "Executing..."
                        : "Execute"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
