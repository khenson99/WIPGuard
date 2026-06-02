"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Play, Save, Send, Plus, Trash2 } from "lucide-react";
import { validateWorkflowGraph } from "@/lib/automations/graph";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";

type WorkflowNode = {
  key: string;
  type: "TRIGGER" | "CONDITION" | "ACTION" | "APPROVAL" | "DELAY";
  label: string;
  config: Record<string, unknown>;
  positionX: number;
  positionY: number;
};

type WorkflowEdge = {
  source: string;
  target: string;
  conditionLabel?: string;
  priority?: number;
};

type WorkflowDetail = {
  id: string;
  name: string;
  description: string | null;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ERROR" | "ARCHIVED";
  scope: "PRIVATE" | "SHARED";
  providers: string[];
  graphVersion: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

function defaultNode(): WorkflowNode {
  return {
    key: `node_${Math.random().toString(16).slice(2, 8)}`,
    type: "ACTION",
    label: "Generate Recommendation",
    config: { actionType: "ai_generate" },
    positionX: 200,
    positionY: 200,
  };
}

export default function AutomationBuilderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const workflowId = params?.id ?? "";
  const cacheKey = `dashboard:automations:workflow:v1:${workflowId}`;

  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<"PRIVATE" | "SHARED">("PRIVATE");
  const [providers, setProviders] = useState<string[]>([]);
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [deleteConfirm, setDeleteConfirm] = useState<{nodeId: string; nodeName: string} | null>(null);
  const [editingNodeField, setEditingNodeField] = useState<{nodeId: string, field: string, value: string} | null>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);

  const validation = useMemo(
    () =>
      validateWorkflowGraph({
        nodes: nodes.map((node) => ({
          key: node.key,
          type: node.type,
          label: node.label,
          config: node.config,
          positionX: node.positionX,
          positionY: node.positionY,
        })),
        edges,
      }),
    [nodes, edges]
  );

  useEffect(() => {
    if (!workflowId) return;
    let active = true;
    const controller = new AbortController();
    const cached = readSessionCache<WorkflowDetail>(cacheKey);

    if (cached) {
      queueMicrotask(() => {
        if (!active) return;
        setWorkflow(cached);
        setName(cached.name || "");
        setDescription(cached.description || "");
        setScope(cached.scope || "PRIVATE");
        setProviders(Array.isArray(cached.providers) ? cached.providers : []);
        setNodes(Array.isArray(cached.nodes) ? cached.nodes : []);
        setEdges(Array.isArray(cached.edges) ? cached.edges : []);
      });
    }

    fetch(`/api/automations/${workflowId}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return;
        setWorkflow(payload as WorkflowDetail);
        setName(payload.name || "");
        setDescription(payload.description || "");
        setScope(payload.scope || "PRIVATE");
        setProviders(Array.isArray(payload.providers) ? payload.providers : []);
        setNodes(
          Array.isArray(payload.nodes)
            ? payload.nodes.map((node: WorkflowNode) => ({
                ...node,
                config: node.config || {},
                positionX: Number.isFinite(node.positionX) ? node.positionX : 0,
                positionY: Number.isFinite(node.positionY) ? node.positionY : 0,
              }))
            : []
        );
        setEdges(Array.isArray(payload.edges) ? payload.edges : []);
        writeSessionCache<WorkflowDetail>(cacheKey, payload as WorkflowDetail);
      })
      .catch((error) => {
        if (!active || (error instanceof Error && error.name === "AbortError")) return;
        setWorkflow(null);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [cacheKey, workflowId]);

  useEffect(() => {
    if (editingNodeField && inlineInputRef.current) {
      inlineInputRef.current.focus();
    }
  }, [editingNodeField]);

  const selectedNode = nodes.find((node) => node.key === selectedNodeKey) || null;

  const addNode = () => {
    const node = defaultNode();
    setNodes((current) => [...current, node]);
    setSelectedNodeKey(node.key);
  };

  const addEdge = () => {
    if (nodes.length < 2) return;
    const source = nodes[0].key;
    const target = nodes[nodes.length - 1].key;
    setEdges((current) => [...current, { source, target, priority: current.length }]);
  };

  const removeNode = (nodeKey: string) => {
    setNodes((current) => current.filter((node) => node.key !== nodeKey));
    setEdges((current) => current.filter((edge) => edge.source !== nodeKey && edge.target !== nodeKey));
    if (selectedNodeKey === nodeKey) setSelectedNodeKey(null);
  };

  const saveWorkflow = async () => {
    if (!workflowId) return;
    const response = await fetch(`/api/automations/${workflowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        scope,
        providers,
        graph: {
          nodes: nodes.map((node) => ({
            key: node.key,
            type: node.type,
            label: node.label,
            config: node.config,
            positionX: node.positionX,
            positionY: node.positionY,
          })),
          edges,
        },
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setSaveMessage(payload?.error || "Save failed");
      return;
    }

    setSaveMessage("Saved");
  };

  const publishWorkflow = async () => {
    if (!workflowId) return;
    const response = await fetch(`/api/automations/${workflowId}/publish`, { method: "POST" });
    if (!response.ok) {
      setSaveMessage("Publish failed");
      return;
    }
    setSaveMessage("Published");
    const refreshed = (await response.json()) as WorkflowDetail;
    setWorkflow(refreshed);
    writeSessionCache<WorkflowDetail>(cacheKey, refreshed);
  };

  const runTest = async () => {
    if (!workflowId) return;
    const response = await fetch(`/api/automations/${workflowId}/test-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "manual.test",
        payload: {
          source: "builder",
          startedAt: new Date().toISOString(),
        },
      }),
    });

    if (!response.ok) {
      setSaveMessage("Test run failed");
      return;
    }

    setSaveMessage("Test run created");
  };

  if (!workflow) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading workflow...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Workflow Builder</h1>
            <p className="text-xs text-muted-foreground">
              Visual DAG editor with trigger, condition, action, approval, and delay nodes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/pipelines/${workflowId}/runs`}
              className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Run History
            </Link>
            <button
              onClick={saveWorkflow}
              className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <Save className="mr-1 inline h-3.5 w-3.5" /> Save
            </button>
            <button
              onClick={publishWorkflow}
              className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <Send className="mr-1 inline h-3.5 w-3.5" /> Publish
            </button>
            <button
              onClick={runTest}
              className="btn-primary-theme rounded-md px-3 py-2 text-xs"
            >
              <Play className="mr-1 inline h-3.5 w-3.5" /> Test Run
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-4">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
            placeholder="Workflow name"
          />
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground lg:col-span-2"
            placeholder="Description"
          />
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as "PRIVATE" | "SHARED")}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
          >
            <option value="PRIVATE">PRIVATE</option>
            <option value="SHARED">SHARED</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {editingNodeField?.nodeId === "providers" && editingNodeField?.field === "providers" ? (
            <input
              ref={inlineInputRef}
              type="text"
              value={editingNodeField.value}
              onChange={(event) =>
                setEditingNodeField((prev) =>
                  prev ? { ...prev, value: event.target.value } : prev
                )
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  const next = editingNodeField.value
                    .split(",")
                    .map((item) => item.trim().toUpperCase())
                    .filter(Boolean);
                  setProviders(Array.from(new Set(next)));
                  setEditingNodeField(null);
                } else if (event.key === "Escape") {
                  setEditingNodeField(null);
                }
              }}
              onBlur={() => setEditingNodeField(null)}
              className="rounded-md border border-primary bg-card px-2 py-1 text-xs text-foreground outline-none"
              placeholder="e.g. SLACK,HUBSPOT"
              autoFocus
            />
          ) : (
            <>
              {providers.length > 0 ? `Providers: ${providers.join(", ")}` : "No providers selected"}
              <button
                onClick={() =>
                  setEditingNodeField({
                    nodeId: "providers",
                    field: "providers",
                    value: providers.join(","),
                  })
                }
                className="rounded-md border border-border bg-card px-2 py-1 hover:text-foreground"
              >
                Edit Providers
              </button>
            </>
          )}
          {saveMessage && <span className="text-primary">{saveMessage}</span>}
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden p-3 lg:grid-cols-[1fr_320px]">
        <section className="relative overflow-auto rounded-xl border border-border bg-card p-3">
          <div className="mb-3 flex items-center gap-2">
            <button
              onClick={addNode}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="mr-1 inline h-3.5 w-3.5" /> Add Node
            </button>
            <button
              onClick={addEdge}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Add Edge
            </button>
          </div>

          <div className="relative min-h-[520px] rounded-lg border border-border/60 bg-background">
            <svg className="absolute inset-0 h-full w-full">
              {edges.map((edge, index) => {
                const source = nodes.find((node) => node.key === edge.source);
                const target = nodes.find((node) => node.key === edge.target);
                if (!source || !target) return null;
                return (
                  <line
                    key={`${edge.source}-${edge.target}-${index}`}
                    x1={source.positionX + 120}
                    y1={source.positionY + 26}
                    x2={target.positionX}
                    y2={target.positionY + 26}
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="text-border"
                  />
                );
              })}
            </svg>

            {nodes.map((node) => (
              <button
                key={node.key}
                onClick={() => setSelectedNodeKey(node.key)}
                className={`absolute w-48 rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                  selectedNodeKey === node.key
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card"
                }`}
                style={{ left: node.positionX, top: node.positionY }}
              >
                <p className="font-semibold text-foreground">{node.label}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{node.type}</p>
                <p className="mt-1 truncate text-[10px] text-muted-foreground">{node.key}</p>
              </button>
            ))}
          </div>

          <div className="mt-3 rounded-md border border-border/60 bg-background p-2">
            <h3 className="text-xs font-semibold text-foreground">Edges</h3>
            {edges.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">No edges yet.</p>
            ) : (
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {edges.map((edge, index) => (
                  <div key={`${edge.source}-${edge.target}-${index}`} className="flex items-center justify-between gap-2">
                    <span>
                      {edge.source} → {edge.target}
                      {edge.conditionLabel ? ` (${edge.conditionLabel})` : ""}
                    </span>
                    <button
                      onClick={() =>
                        setEdges((current) => current.filter((_item, edgeIndex) => edgeIndex !== index))
                      }
                      className="rounded border border-border px-1.5 py-0.5 hover:text-foreground"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-3 overflow-auto">
          <section className="rounded-xl border border-border bg-card p-3">
            <h3 className="text-xs font-semibold text-foreground">Validation</h3>
            {validation.valid ? (
              <p className="mt-1 text-xs text-emerald-600">Graph is valid</p>
            ) : (
              <ul className="mt-1 space-y-1 text-xs text-red-500">
                {validation.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-3">
            <h3 className="text-xs font-semibold text-foreground">Node Inspector</h3>
            {!selectedNode ? (
              <p className="mt-1 text-xs text-muted-foreground">Select a node from canvas.</p>
            ) : (
              <div className="mt-2 space-y-2">
                <label htmlFor="node-label" className="text-[11px] font-medium text-muted-foreground">Label</label>
                <input
                  id="node-label"
                  aria-label="Node label"
                  value={selectedNode.label}
                  onChange={(event) =>
                    setNodes((current) =>
                      current.map((node) =>
                        node.key === selectedNode.key ? { ...node, label: event.target.value } : node
                      )
                    )
                  }
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                  placeholder="Node label"
                />

                <label htmlFor="node-type" className="text-[11px] font-medium text-muted-foreground">Type</label>
                <select
                  id="node-type"
                  aria-label="Node type"
                  value={selectedNode.type}
                  onChange={(event) =>
                    setNodes((current) =>
                      current.map((node) =>
                        node.key === selectedNode.key
                          ? {
                              ...node,
                              type: event.target.value as WorkflowNode["type"],
                            }
                          : node
                      )
                    )
                  }
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                >
                  <option value="TRIGGER">TRIGGER</option>
                  <option value="CONDITION">CONDITION</option>
                  <option value="ACTION">ACTION</option>
                  <option value="APPROVAL">APPROVAL</option>
                  <option value="DELAY">DELAY</option>
                </select>

                <p className="text-[11px] font-medium text-muted-foreground">Position</p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    aria-label="X position"
                    value={selectedNode.positionX}
                    onChange={(event) =>
                      setNodes((current) =>
                        current.map((node) =>
                          node.key === selectedNode.key
                            ? { ...node, positionX: Number(event.target.value) }
                            : node
                        )
                      )
                    }
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                    placeholder="X"
                  />
                  <input
                    type="number"
                    aria-label="Y position"
                    value={selectedNode.positionY}
                    onChange={(event) =>
                      setNodes((current) =>
                        current.map((node) =>
                          node.key === selectedNode.key
                            ? { ...node, positionY: Number(event.target.value) }
                            : node
                        )
                      )
                    }
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                    placeholder="Y"
                  />
                </div>

                <label htmlFor="node-config" className="text-[11px] font-medium text-muted-foreground">Configuration (JSON)</label>
                <textarea
                  id="node-config"
                  aria-label="Node configuration JSON"
                  value={JSON.stringify(selectedNode.config || {}, null, 2)}
                  onChange={(event) => {
                    try {
                      const parsed = JSON.parse(event.target.value) as Record<string, unknown>;
                      setNodes((current) =>
                        current.map((node) =>
                          node.key === selectedNode.key ? { ...node, config: parsed } : node
                        )
                      );
                    } catch {
                      // keep last valid state
                    }
                  }}
                  className="h-48 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                />

                <button
                  onClick={() => setDeleteConfirm({ nodeId: selectedNode.key, nodeName: selectedNode.label })}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-red-500 hover:text-red-400"
                >
                  Delete Node
                </button>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
            <p>Status: {workflow.status}</p>
            <p>Scope: {workflow.scope}</p>
            <p>Graph Version: {workflow.graphVersion}</p>
            <button
              onClick={() => router.push("/pipelines")}
              className="mt-2 rounded border border-border px-2 py-1 hover:text-foreground"
            >
              Back to automations
            </button>
          </section>
        </aside>
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-lg">
            <h2 className="text-sm font-semibold text-foreground">Delete this node?</h2>
            <p className="mt-2 text-xs text-muted-foreground">
              This will remove <span className="font-medium text-foreground">{deleteConfirm.nodeName}</span> and
              disconnect any linked nodes.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  removeNode(deleteConfirm.nodeId);
                  setDeleteConfirm(null);
                }}
                className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/20"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
