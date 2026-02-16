"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Bot, Filter, PlusCircle, ShieldCheck } from "lucide-react";

type WorkflowListItem = {
  id: string;
  name: string;
  scope: "PRIVATE" | "SHARED";
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ERROR" | "ARCHIVED";
  providers: string[];
  updatedAt: string;
  owner: { id: string; name: string | null; email: string };
  runs: Array<{ id: string; status: string; createdAt: string; error: string | null }>;
};

type TemplateItem = {
  key: string;
  name: string;
  description: string;
  providers: string[];
  graph: Record<string, unknown>;
};

interface AutomationsResponse {
  workflows: WorkflowListItem[];
  templates: TemplateItem[];
  systemManagedRecipes: Array<{
    id: string;
    source: string;
    key: string;
    provider: string;
    status: string;
    updatedAt: string;
    lastRunAt: string | null;
    lastError: string | null;
  }>;
}

export default function AutomationsPage() {
  const router = useRouter();
  const [data, setData] = useState<AutomationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [scopeFilter, setScopeFilter] = useState<"all" | "PRIVATE" | "SHARED">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | WorkflowListItem["status"]>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [healthFilter, setHealthFilter] = useState<"all" | "healthy" | "needs-attention" | "never-run">("all");

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/automations", { cache: "no-store" });
      const payload = (await response.json()) as AutomationsResponse;
      setData(payload);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const providerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const workflow of data?.workflows ?? []) {
      for (const provider of workflow.providers) {
        set.add(provider);
      }
    }
    return ["all", ...Array.from(set).sort()];
  }, [data]);

  const filteredWorkflows = useMemo(() => {
    return (data?.workflows ?? []).filter((workflow) => {
      if (scopeFilter !== "all" && workflow.scope !== scopeFilter) return false;
      if (statusFilter !== "all" && workflow.status !== statusFilter) return false;
      if (providerFilter !== "all" && !workflow.providers.includes(providerFilter)) return false;
      if (healthFilter !== "all") {
        const latest = workflow.runs[0];
        if (healthFilter === "never-run" && latest) return false;
        if (healthFilter === "healthy" && latest?.status !== "SUCCEEDED") return false;
        if (
          healthFilter === "needs-attention" &&
          (!latest || latest.status === "SUCCEEDED")
        ) {
          return false;
        }
      }
      return true;
    });
  }, [data, scopeFilter, statusFilter, providerFilter, healthFilter]);

  const createBlankWorkflow = async () => {
    const response = await fetch("/api/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "New Workflow",
        scope: "PRIVATE",
        graph: {
          nodes: [
            {
              key: "trigger_1",
              type: "TRIGGER",
              label: "Trigger",
              config: {},
              positionX: 80,
              positionY: 80,
            },
          ],
          edges: [],
        },
      }),
    });

    if (!response.ok) return;
    const created = (await response.json()) as { id: string };
    router.push(`/automations/${created.id}`);
  };

  const createFromTemplate = async (template: TemplateItem) => {
    const response = await fetch("/api/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: template.name,
        description: template.description,
        providers: template.providers,
        graph: template.graph,
      }),
    });

    if (!response.ok) return;
    const created = (await response.json()) as { id: string };
    router.push(`/automations/${created.id}`);
  };

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Automations</h1>
          <p className="text-xs text-muted-foreground">
            Build trigger-based workflows across Google, HubSpot, Slack, Coda, Reddit, and WIPGuard.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/automations/approvals"
            className="rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Approval Inbox
          </Link>
          <button
            onClick={createBlankWorkflow}
            className="btn-primary-theme flex items-center gap-1.5 rounded-md px-3 py-2 text-sm"
          >
            <PlusCircle className="h-4 w-4" />
            New Workflow
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-3">
        <Filter className="h-4 w-4 text-muted-foreground" />

        <select
          value={scopeFilter}
          onChange={(event) => setScopeFilter(event.target.value as typeof scopeFilter)}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
        >
          <option value="all">All Scopes</option>
          <option value="PRIVATE">Private</option>
          <option value="SHARED">Shared</option>
        </select>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
        >
          <option value="all">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="ACTIVE">Active</option>
          <option value="PAUSED">Paused</option>
          <option value="ERROR">Error</option>
          <option value="ARCHIVED">Archived</option>
        </select>

        <select
          value={providerFilter}
          onChange={(event) => setProviderFilter(event.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
        >
          {providerOptions.map((provider) => (
            <option key={provider} value={provider}>
              {provider === "all" ? "All Providers" : provider}
            </option>
          ))}
        </select>

        <select
          value={healthFilter}
          onChange={(event) => setHealthFilter(event.target.value as typeof healthFilter)}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
        >
          <option value="all">All Health</option>
          <option value="healthy">Healthy</option>
          <option value="needs-attention">Needs Attention</option>
          <option value="never-run">Never Run</option>
        </select>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Workflows</h2>
        {loading ? (
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Loading automations...
          </div>
        ) : filteredWorkflows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            No workflows match current filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {filteredWorkflows.map((workflow) => (
              <Link
                key={workflow.id}
                href={`/automations/${workflow.id}`}
                className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <div className="mb-1 flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">{workflow.name}</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  {workflow.scope} · {workflow.status} · {workflow.providers.join(", ") || "No providers"}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Owner: {workflow.owner.name || workflow.owner.email}
                </p>
                {workflow.runs[0] && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Last run: {workflow.runs[0].status} · {new Date(workflow.runs[0].createdAt).toLocaleString()}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Template Gallery</h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {(data?.templates ?? []).map((template) => (
            <div key={template.key} className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground">{template.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">{template.providers.join(", ")}</p>
              <button
                onClick={() => createFromTemplate(template)}
                className="mt-3 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Use Template
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">System-Managed Recipes</h2>
        <div className="rounded-xl border border-border bg-card p-4">
          {(data?.systemManagedRecipes ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No legacy integration recipes detected.</p>
          ) : (
            <div className="space-y-2">
              {data?.systemManagedRecipes.map((recipe) => (
                <div key={recipe.id} className="rounded-lg border border-border/60 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{recipe.key}</p>
                    <span className="text-[11px] text-muted-foreground">{recipe.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {recipe.provider} · {recipe.lastError ? `Error: ${recipe.lastError}` : "Healthy"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" />
          Shared workflows are editable by roles defined in workflow role policy.
        </p>
      </div>
    </div>
  );
}
