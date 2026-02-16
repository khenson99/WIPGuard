"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";

interface RunStep {
  id: string;
  nodeKey: string;
  nodeType: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

interface RunApproval {
  id: string;
  nodeKey: string;
  status: string;
  approverId: string | null;
  timeoutAt: string | null;
  resolvedAt: string | null;
}

interface WorkflowRun {
  id: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  steps: RunStep[];
  approvals: RunApproval[];
}

export default function AutomationRunsPage() {
  const params = useParams<{ id: string }>();
  const workflowId = params?.id ?? "";
  const cacheKey = `dashboard:automations:runs:v1:${workflowId}`;

  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workflowId) return;

    let active = true;
    const controller = new AbortController();
    const cached = readSessionCache<WorkflowRun[]>(cacheKey);

    if (cached) {
      queueMicrotask(() => {
        if (!active) return;
        setRuns(cached);
        setLoading(false);
      });
    } else {
      queueMicrotask(() => {
        if (!active) return;
        setLoading(true);
      });
    }

    fetch(`/api/automations/${workflowId}/runs`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return;
        const next = Array.isArray(payload) ? (payload as WorkflowRun[]) : [];
        setRuns(next);
        writeSessionCache<WorkflowRun[]>(cacheKey, next);
      })
      .catch((error) => {
        if (!active || (error instanceof Error && error.name === "AbortError")) return;
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [cacheKey, workflowId]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Workflow Run History</h1>
          <p className="text-xs text-muted-foreground">Execution traces for this workflow.</p>
        </div>
        <Link
          href={`/automations/${workflowId}`}
          className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Back to Builder
        </Link>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading runs...</div>
      ) : runs.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No runs yet.</div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <div key={run.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">Run {run.id.slice(0, 8)}</p>
                <span className="text-xs text-muted-foreground">{run.status}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Created {new Date(run.createdAt).toLocaleString()}
                {run.error ? ` · Error: ${run.error}` : ""}
              </p>

              <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                <div>
                  <h3 className="text-xs font-semibold text-foreground">Steps</h3>
                  <div className="mt-1 space-y-1">
                    {run.steps.map((step) => (
                      <div key={step.id} className="rounded-md border border-border/60 px-2 py-1.5 text-xs text-muted-foreground">
                        {step.nodeKey} ({step.nodeType}) · {step.status}
                        {step.error ? ` · ${step.error}` : ""}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-foreground">Approvals</h3>
                  <div className="mt-1 space-y-1">
                    {run.approvals.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No approvals.</p>
                    ) : (
                      run.approvals.map((approval) => (
                        <div key={approval.id} className="rounded-md border border-border/60 px-2 py-1.5 text-xs text-muted-foreground">
                          {approval.nodeKey} · {approval.status}
                          {approval.timeoutAt ? ` · timeout ${new Date(approval.timeoutAt).toLocaleString()}` : ""}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
