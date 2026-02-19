"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  LayoutGrid,
  Rows3,
  List,
  BookmarkPlus,
  FolderKanban,
  CheckCircle2,
  Circle,
  FilterX,
} from "lucide-react";
import { ProjectCard } from "./project-card";
import { useDashboardResource } from "@/components/dashboard/use-dashboard-resource";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-error-banner";
import { DashboardStaleBanner } from "@/components/dashboard/dashboard-stale-banner";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import type {
  ProjectWithDetails,
  DepartmentSummary,
  ProjectStatus,
  UserSavedView,
} from "@/types";

type ViewMode = "grid" | "swimlane" | "list";

const PROJECT_DASHBOARD_CACHE_KEY = "dashboard:projects:v2";

interface ProjectDashboardData {
  projects: ProjectWithDetails[];
  departments: DepartmentSummary[];
  savedViews: UserSavedView[];
  meta?: {
    servedAt: string;
    isPartial: boolean;
  };
}

interface ProjectsResponseWithMeta {
  items: ProjectWithDetails[];
  meta?: {
    servedAt: string;
    isPartial: boolean;
  };
}

const EMPTY_PROJECTS: ProjectWithDetails[] = [];
const EMPTY_DEPARTMENTS: DepartmentSummary[] = [];
const EMPTY_SAVED_VIEWS: UserSavedView[] = [];

const STATUS_OPTIONS: { value: ProjectStatus | ""; label: string }[] = [
  { value: "", label: "All Statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ARCHIVED", label: "Archived" },
];

function resolveViewDefaults(view: UserSavedView | undefined): {
  id: string;
  viewMode: ViewMode;
  filterStatus: ProjectStatus | "";
  filterDepartment: string;
} {
  if (!view) {
    return {
      id: "",
      viewMode: "grid",
      filterStatus: "",
      filterDepartment: "",
    };
  }

  const layout = view.config.defaultLayout;
  const nextViewMode: ViewMode =
    layout === "grid" || layout === "swimlane" || layout === "list" ? layout : "grid";

  const status = view.config.filterStatus;
  const nextStatus: ProjectStatus | "" =
    status === "ACTIVE" || status === "ON_HOLD" || status === "COMPLETED" || status === "ARCHIVED"
      ? status
      : "";

  const department = typeof view.config.filterDepartment === "string" ? view.config.filterDepartment : "";

  return {
    id: view.id,
    viewMode: nextViewMode,
    filterStatus: nextStatus,
    filterDepartment: department,
  };
}

export function ProjectDashboard() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | "">("");
  const [filterDepartment, setFilterDepartment] = useState("");
  const [selectedViewId, setSelectedViewId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const resource = useDashboardResource<ProjectDashboardData>({
    cacheKey: PROJECT_DASHBOARD_CACHE_KEY,
    deps: [],
    load: async ({ signal, refresh }) => {
      const [projectsRes, departmentsRes, viewsRes] = await Promise.all([
        fetch("/api/projects?meta=true", {
          signal,
          cache: refresh ? "no-store" : "default",
        }),
        fetch("/api/departments", {
          signal,
          cache: refresh ? "no-store" : "default",
        }),
        fetch("/api/views?scope=projects", {
          signal,
          cache: refresh ? "no-store" : "default",
        }),
      ]);

      if (!projectsRes.ok) throw new Error(`Projects request failed (${projectsRes.status})`);
      if (!departmentsRes.ok) throw new Error(`Departments request failed (${departmentsRes.status})`);
      if (!viewsRes.ok) throw new Error(`Views request failed (${viewsRes.status})`);

      const projectsPayload = (await projectsRes.json()) as ProjectWithDetails[] | ProjectsResponseWithMeta;
      const departmentsPayload = (await departmentsRes.json()) as DepartmentSummary[];
      const viewsPayload = (await viewsRes.json()) as UserSavedView[];

      const projects = Array.isArray(projectsPayload)
        ? projectsPayload
        : Array.isArray(projectsPayload.items)
          ? projectsPayload.items
          : [];

      const meta = Array.isArray(projectsPayload) ? undefined : projectsPayload.meta;

      return {
        projects,
        departments: departmentsPayload,
        savedViews: viewsPayload,
        meta,
      };
    },
    getLastUpdatedAt: (payload) => payload.meta?.servedAt ?? null,
    mapError: (error) => {
      if (error instanceof Error && error.message.trim().length > 0) return error.message;
      return "Could not load projects dashboard.";
    },
  });

  const projects = resource.data?.projects ?? EMPTY_PROJECTS;
  const departments = resource.data?.departments ?? EMPTY_DEPARTMENTS;
  const savedViews = resource.data?.savedViews ?? EMPTY_SAVED_VIEWS;

  useEffect(() => {
    if (!resource.data) return;

    const activeViewExists = selectedViewId && savedViews.some((view) => view.id === selectedViewId);
    if (activeViewExists) return;

    const defaultView = savedViews.find((view) => view.isDefault) || savedViews[0];
    const defaults = resolveViewDefaults(defaultView);

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setSelectedViewId(defaults.id);
      setViewMode(defaults.viewMode);
      setFilterStatus(defaults.filterStatus);
      setFilterDepartment(defaults.filterDepartment);
    });

    return () => {
      cancelled = true;
    };
  }, [resource.data, savedViews, selectedViewId]);

  const filteredProjects = useMemo(() => {
    let list = projects;
    if (filterStatus) list = list.filter((project) => project.status === filterStatus);
    if (filterDepartment) list = list.filter((project) => project.departmentId === filterDepartment);
    return list;
  }, [projects, filterDepartment, filterStatus]);

  const stats = useMemo(() => {
    const total = projects.length;
    const active = projects.filter((project) => project.status === "ACTIVE").length;
    const completed = projects.filter((project) => project.status === "COMPLETED").length;
    const onHold = projects.filter((project) => project.status === "ON_HOLD").length;
    return { total, active, completed, onHold };
  }, [projects]);

  const swimLanes = useMemo(() => {
    const grouped = new Map<string, { department: DepartmentSummary | null; projects: ProjectWithDetails[] }>();

    for (const department of departments) {
      grouped.set(department.id, { department, projects: [] });
    }
    grouped.set("__none__", { department: null, projects: [] });

    for (const project of filteredProjects) {
      const key = project.departmentId || "__none__";
      const lane = grouped.get(key);
      if (lane) {
        lane.projects.push(project);
      } else {
        grouped.set(key, { department: project.department, projects: [project] });
      }
    }

    return Array.from(grouped.values()).filter((lane) => lane.projects.length > 0);
  }, [departments, filteredProjects]);

  const hasFilters = Boolean(filterStatus || filterDepartment);

  const applySavedView = (viewId: string) => {
    setActionError(null);
    setSelectedViewId(viewId);

    const view = savedViews.find((item) => item.id === viewId);
    if (!view) {
      setActionError("Selected view could not be loaded.");
      return;
    }

    const defaults = resolveViewDefaults(view);
    setViewMode(defaults.viewMode);
    setFilterStatus(defaults.filterStatus);
    setFilterDepartment(defaults.filterDepartment);
  };

  const saveCurrentAsView = async () => {
    setActionError(null);
    const name = window.prompt("Saved view name");
    if (!name) return;

    const response = await fetch("/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: "projects",
        name,
        config: {
          defaultLayout: viewMode,
          filterStatus: filterStatus || null,
          filterDepartment: filterDepartment || null,
        },
      }),
    });

    if (!response.ok) {
      setActionError(`Could not save view (${response.status}).`);
      return;
    }

    await resource.refresh();
  };

  if (resource.loading && !resource.data) {
    return <DashboardLoadingState message="Loading projects dashboard..." className="h-[50vh]" />;
  }

  if (!resource.data) {
    return (
      <DashboardEmptyState
        title="Projects dashboard unavailable"
        message={resource.error ?? "No project data available."}
        actionLabel="Refresh now"
        onAction={resource.refresh}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage and track all projects across departments
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Last updated: {resource.lastUpdatedAt ? new Date(resource.lastUpdatedAt).toLocaleString() : "Unknown"}
            {resource.fromCache ? " (cache warm start)" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resource.refresh}
            disabled={resource.refreshing}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-70"
          >
            {resource.refreshing ? "Refreshing..." : "Refresh now"}
          </button>
          <button
            onClick={() => router.push("/settings?tab=projects")}
            className="btn-primary-theme flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            New Project
          </button>
        </div>
      </div>

      {resource.stale ? (
        <DashboardStaleBanner
          lastUpdatedAt={resource.lastUpdatedAt}
          onRefresh={resource.refresh}
          refreshing={resource.refreshing}
          label="Showing cached projects while refresh retries."
        />
      ) : null}

      {resource.error ? (
        <DashboardErrorBanner message={resource.error} onRetry={resource.refresh} />
      ) : null}

      {actionError ? (
        <DashboardErrorBanner message={actionError} onRetry={() => setActionError(null)} retryLabel="Dismiss" />
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total", value: stats.total, icon: FolderKanban, color: "var(--primary)" },
          { label: "Active", value: stats.active, icon: Circle, color: "#22c55e" },
          { label: "Completed", value: stats.completed, icon: CheckCircle2, color: "#3b82f6" },
          { label: "On Hold", value: stats.onHold, icon: Circle, color: "#eab308" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${stat.color}18` }}
            >
              <stat.icon className="h-4 w-4" style={{ color: stat.color }} />
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedViewId}
          onChange={(event) => applySavedView(event.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          disabled={savedViews.length === 0}
        >
          {savedViews.map((view) => (
            <option key={view.id} value={view.id}>
              {view.name}
            </option>
          ))}
        </select>

        <button
          onClick={saveCurrentAsView}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <BookmarkPlus className="h-3.5 w-3.5" />
          Save View
        </button>

        <select
          value={filterStatus}
          onChange={(event) => setFilterStatus(event.target.value as ProjectStatus | "")}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={filterDepartment}
          onChange={(event) => setFilterDepartment(event.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
        >
          <option value="">All Departments</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>

        {hasFilters ? (
          <button
            onClick={() => {
              setFilterStatus("");
              setFilterDepartment("");
            }}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <FilterX className="h-3.5 w-3.5" />
            Clear
          </button>
        ) : null}

        <div className="ml-auto flex rounded-lg border border-border">
          <button
            onClick={() => setViewMode("grid")}
            className={`rounded-l-lg px-3 py-2 text-sm ${
              viewMode === "grid"
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground"
            }`}
            title="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("swimlane")}
            className={`px-3 py-2 text-sm ${
              viewMode === "swimlane"
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground"
            }`}
            title="Swim lane view"
          >
            <Rows3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`rounded-r-lg px-3 py-2 text-sm ${
              viewMode === "list"
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground"
            }`}
            title="List view"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <DashboardEmptyState
          title={hasFilters ? "No projects match filters" : "No projects yet"}
          message={hasFilters ? "Adjust filters or refresh data." : "Create a project to get started."}
        />
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => router.push(`/projects/${project.id}`)}
            />
          ))}
        </div>
      ) : viewMode === "swimlane" ? (
        <div className="space-y-6">
          {swimLanes.map((lane) => (
            <div key={lane.department?.id || "__none__"}>
              <div className="mb-3 flex items-center gap-2">
                {lane.department?.color ? (
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: lane.department.color }}
                  />
                ) : null}
                <h2 className="text-sm font-semibold text-foreground">
                  {lane.department?.name || "Unassigned"}
                </h2>
                <span className="text-xs text-muted-foreground">
                  ({lane.projects.length})
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {lane.projects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onClick={() => router.push(`/projects/${project.id}`)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-secondary/50">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Project</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Department</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tasks</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredProjects.map((project) => (
                <tr
                  key={project.id}
                  onClick={() => router.push(`/projects/${project.id}`)}
                  className="cursor-pointer hover:bg-secondary/40"
                >
                  <td className="px-4 py-2.5 font-medium text-foreground">{project.name}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{project.status}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {project.department?.name || "Unassigned"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{project._count.tasks}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {new Date(project.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
