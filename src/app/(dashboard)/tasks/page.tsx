"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { LayoutGrid, PanelsTopLeft, TableProperties } from "lucide-react";
import { KanbanBoard } from "@/components/board/kanban-board";
import { TaskTableView } from "@/components/tasks/task-table-view";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";
import type { TaskStatus, UserSavedView } from "@/types";

type TaskLayout = "kanban" | "table" | "split";

type BuiltInView = "all-work" | "my-work" | "today-focus" | "table-audit";

const TASK_VIEWS_CACHE_KEY = "dashboard:tasks:views:v1";

function viewFromQuery(value: string | null): BuiltInView {
  if (value === "my-work") return "my-work";
  if (value === "today-focus") return "today-focus";
  if (value === "table-audit") return "table-audit";
  return "all-work";
}

export default function TasksPage() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  const [savedViews, setSavedViews] = useState<UserSavedView[]>([]);
  const [selectedSavedViewId, setSelectedSavedViewId] = useState<string>("");
  const [layout, setLayout] = useState<TaskLayout>("kanban");
  const [loadingViews, setLoadingViews] = useState(true);

  const builtInView = viewFromQuery(searchParams?.get("view") ?? null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const cached = readSessionCache<UserSavedView[]>(TASK_VIEWS_CACHE_KEY);

    if (cached) {
      queueMicrotask(() => {
        if (!active) return;
        setSavedViews(cached);
        const defaultView = cached.find((view) => view.isDefault) || cached[0];
        if (defaultView) {
          setSelectedSavedViewId(defaultView.id);
          const configuredLayout =
            typeof defaultView.config?.layout === "string"
              ? defaultView.config.layout
              : null;
          if (
            configuredLayout === "kanban" ||
            configuredLayout === "table" ||
            configuredLayout === "split"
          ) {
            setLayout(configuredLayout);
          }
        }
        setLoadingViews(false);
      });
    }

    fetch("/api/views?scope=tasks", { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return;
        const views = Array.isArray(payload) ? (payload as UserSavedView[]) : [];
        setSavedViews(views);
        writeSessionCache<UserSavedView[]>(TASK_VIEWS_CACHE_KEY, views);
        const defaultView = views.find((view) => view.isDefault) || views[0];
        if (defaultView) {
          setSelectedSavedViewId(defaultView.id);
          const configuredLayout =
            typeof defaultView.config?.layout === "string"
              ? defaultView.config.layout
              : null;
          if (
            configuredLayout === "kanban" ||
            configuredLayout === "table" ||
            configuredLayout === "split"
          ) {
            setLayout(configuredLayout);
          }
        }
      })
      .catch((error) => {
        if (!active || (error instanceof Error && error.name === "AbortError")) return;
      })
      .finally(() => {
        if (active) {
          setLoadingViews(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const selectedView = useMemo(
    () => savedViews.find((view) => view.id === selectedSavedViewId) || null,
    [savedViews, selectedSavedViewId]
  );
  const activeLayout: TaskLayout = builtInView === "table-audit" ? "table" : layout;

  const kanbanFilterByUser = builtInView === "my-work" ? session?.user?.id : undefined;
  const kanbanFilterByStatus: TaskStatus[] | undefined =
    builtInView === "today-focus" ? ["WORKING_ON_TODAY", "ACTIVE"] : undefined;

  const saveCurrentAsView = async () => {
    const name = window.prompt("Saved view name");
    if (!name) return;

    const payload = {
      scope: "tasks",
      name,
      config: {
        layout: activeLayout,
        builtInView,
      },
    };

    const response = await fetch("/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) return;

    const created = (await response.json()) as UserSavedView;
    setSavedViews((current) => [...current, created]);
    setSelectedSavedViewId(created.id);
  };

  const applySavedView = (viewId: string) => {
    setSelectedSavedViewId(viewId);
    const view = savedViews.find((item) => item.id === viewId);
    if (!view) return;

    const configuredLayout =
      typeof view.config?.layout === "string" ? view.config.layout : null;
    if (configuredLayout === "kanban" || configuredLayout === "table" || configuredLayout === "split") {
      setLayout(configuredLayout);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Tasks</h1>
          <p className="text-xs text-muted-foreground">
            Unified task workspace with configurable views.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedSavedViewId}
            onChange={(event) => applySavedView(event.target.value)}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground"
            disabled={loadingViews || savedViews.length === 0}
          >
            {savedViews.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
              </option>
            ))}
          </select>

          <button
            onClick={saveCurrentAsView}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Save Current as View
          </button>

          {selectedView && (
            <button
              onClick={async () => {
                await fetch(`/api/views/${selectedView.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ isDefault: true }),
                });
              }}
              className="rounded-md border border-border bg-card px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Set Default
            </button>
          )}

          <div className="ml-auto flex rounded-md border border-border bg-card">
            <button
              onClick={() => setLayout("kanban")}
              className={`px-2 py-1.5 ${activeLayout === "kanban" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              title="Kanban"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setLayout("table")}
              className={`px-2 py-1.5 ${activeLayout === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              title="Table"
            >
              <TableProperties className="h-4 w-4" />
            </button>
            <button
              onClick={() => setLayout("split")}
              className={`px-2 py-1.5 ${activeLayout === "split" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              title="Split"
            >
              <PanelsTopLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeLayout === "kanban" && (
          <KanbanBoard
            filterByUser={kanbanFilterByUser}
            filterByStatus={kanbanFilterByStatus}
          />
        )}

        {activeLayout === "table" && (
          <TaskTableView
            assigneeId={kanbanFilterByUser}
            statusFilter={kanbanFilterByStatus}
          />
        )}

        {activeLayout === "split" && (
          <div className="grid h-full grid-cols-1 gap-3 p-3 lg:grid-cols-2">
            <div className="min-h-0 rounded-lg border border-border bg-background">
              <KanbanBoard
                filterByUser={kanbanFilterByUser}
                filterByStatus={kanbanFilterByStatus}
              />
            </div>
            <div className="min-h-0 rounded-lg border border-border bg-background">
              <TaskTableView
                assigneeId={kanbanFilterByUser}
                statusFilter={kanbanFilterByStatus}
                compact
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
