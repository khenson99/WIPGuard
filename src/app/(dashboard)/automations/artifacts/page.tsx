"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { automationOperatorLabel } from "@/lib/automations/operators";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";

interface ArtifactItem {
  id: string;
  artifactType: string;
  status: string;
  title: string;
  summary: string | null;
  content: string | null;
  contentJson: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
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
  sourceDocument: {
    id: string;
    documentType: string;
    title: string | null;
  } | null;
}

const AUTOMATION_ARTIFACTS_CACHE_KEY = "dashboard:automations:artifacts:v1";

function stringifyArtifactContent(
  contentJson: Record<string, unknown> | null,
  metadata: Record<string, unknown> | null
) {
  const source = contentJson ?? metadata;
  if (!source) return null;

  try {
    return JSON.stringify(source, null, 2);
  } catch {
    return null;
  }
}

function buildArtifactPreview(artifact: ArtifactItem) {
  const content = artifact.content?.trim();
  if (content) {
    return content.length > 420 ? `${content.slice(0, 420)}...` : content;
  }

  const structured = stringifyArtifactContent(artifact.contentJson, artifact.metadata);
  if (!structured) return artifact.summary ?? "No preview available.";
  return structured.length > 420 ? `${structured.slice(0, 420)}...` : structured;
}

export default function AutomationArtifactsPage() {
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [artifactTypeFilter, setArtifactTypeFilter] = useState("all");
  const [operatorFilter, setOperatorFilter] = useState("all");

  const fetchArtifacts = async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/automations/artifacts", { signal });
      const payload = (await response.json()) as unknown;
      if (signal?.aborted) return;
      const next = Array.isArray(payload) ? (payload as ArtifactItem[]) : [];
      setArtifacts(next);
      writeSessionCache<ArtifactItem[]>(AUTOMATION_ARTIFACTS_CACHE_KEY, next);
      setError(null);
    } catch {
      if (!signal?.aborted) {
        setError("Could not fetch artifacts");
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
    const cached = readSessionCache<ArtifactItem[]>(AUTOMATION_ARTIFACTS_CACHE_KEY);

    if (cached) {
      queueMicrotask(() => {
        if (!active) return;
        setArtifacts(cached);
        setLoading(false);
      });
    }

    void fetchArtifacts(controller.signal);

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const artifactTypeOptions = useMemo(() => {
    const options = new Set<string>();
    for (const artifact of artifacts) {
      options.add(artifact.artifactType);
    }
    return ["all", ...Array.from(options).sort()];
  }, [artifacts]);

  const operatorOptions = useMemo(() => {
    const options = new Set<string>();
    for (const artifact of artifacts) {
      if (artifact.workflow.operatorKey) {
        options.add(artifact.workflow.operatorKey);
      }
    }
    return ["all", ...Array.from(options).sort()];
  }, [artifacts]);

  const filteredArtifacts = useMemo(() => {
    return artifacts.filter((artifact) => {
      if (artifactTypeFilter !== "all" && artifact.artifactType !== artifactTypeFilter) {
        return false;
      }

      if (operatorFilter !== "all" && artifact.workflow.operatorKey !== operatorFilter) {
        return false;
      }

      if (!searchQuery.trim()) {
        return true;
      }

      const query = searchQuery.trim().toLowerCase();
      return (
        artifact.title.toLowerCase().includes(query) ||
        (artifact.summary ?? "").toLowerCase().includes(query) ||
        artifact.workflow.name.toLowerCase().includes(query) ||
        (artifact.sourceDocument?.title ?? "").toLowerCase().includes(query) ||
        artifact.artifactType.toLowerCase().includes(query)
      );
    });
  }, [artifacts, artifactTypeFilter, operatorFilter, searchQuery]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Artifact Inbox</h1>
          <p className="text-xs text-muted-foreground">
            Review generated operator memos, briefs, analyses, and structured outputs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/automations/recommendations"
            className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Recommendation Inbox
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
          placeholder="Search artifacts..."
          className="rounded-md border border-border bg-secondary px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
        />
        <select
          value={artifactTypeFilter}
          onChange={(event) => setArtifactTypeFilter(event.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
        >
          {artifactTypeOptions.map((option) => (
            <option key={option} value={option}>
              {option === "all" ? "All Artifact Types" : option}
            </option>
          ))}
        </select>
        <select
          value={operatorFilter}
          onChange={(event) => setOperatorFilter(event.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
        >
          {operatorOptions.map((option) => (
            <option key={option} value={option}>
              {option === "all"
                ? "All Operators"
                : automationOperatorLabel(option as never)}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Loading artifacts...
        </div>
      ) : filteredArtifacts.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No artifacts match the current filters.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredArtifacts.map((artifact) => {
            const preview = buildArtifactPreview(artifact);
            const fullContent =
              artifact.content?.trim() ||
              stringifyArtifactContent(artifact.contentJson, artifact.metadata);

            return (
              <div
                key={artifact.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {artifact.title}
                      </p>
                      <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {artifact.status}
                      </span>
                      <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {artifact.artifactType}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {artifact.workflow.name}
                      {artifact.workflow.operatorKey
                        ? ` · ${automationOperatorLabel(artifact.workflow.operatorKey as never)}`
                        : ""}
                      {artifact.sourceDocument?.title
                        ? ` · source ${artifact.sourceDocument.title}`
                        : ""}
                    </p>
                    {artifact.summary && (
                      <p className="text-sm text-foreground">{artifact.summary}</p>
                    )}
                    <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                      {preview}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/automations/${artifact.workflow.id}`}
                      className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Open Workflow
                    </Link>
                  </div>
                </div>

                <p className="mt-3 text-[11px] text-muted-foreground">
                  Run {artifact.run.id.slice(0, 8)} · {artifact.run.status} ·{" "}
                  {new Date(artifact.createdAt).toLocaleString()}
                </p>

                {fullContent && fullContent !== preview && (
                  <details className="mt-3 rounded-lg border border-border/60 bg-background/50 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-medium text-foreground">
                      View full artifact
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                      {fullContent}
                    </pre>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
