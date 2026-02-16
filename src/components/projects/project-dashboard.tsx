"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";
import type {
  ProjectWithDetails,
  DepartmentSummary,
  ProjectStatus,
  UserSavedView,
} from "@/types";

type ViewMode = "grid" | "swimlane" | "list";

const PROJECT_DASHBOARD_CACHE_KEY = "dashboard:projects:v1";

interface ProjectDashboardCache {
  projects: ProjectWithDetails[];
  departments: DepartmentSummary[];
  savedViews: UserSavedView[];
  selectedViewId: string;
  viewMode: ViewMode;
  filterStatus: ProjectStatus | "";
  filterDepartment: string;
}

const STATUS_OPTIONS: { value: ProjectStatus | ""; label: string }[] = [
  { value: "", label: "All Statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ARCHIVED", label: "Archived" },
];

export function ProjectDashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectWithDetails[]>([]);
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | "">("");
  const [filterDepartment, setFilterDepartment] = useState("");
  const [savedViews, setSavedViews] = useState<UserSavedView[]>([]);
  const [selectedViewId, setSelectedViewId] = useState("");

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      const [projRes, deptRes, viewsRes] = await Promise.all([
        fetch("/api/projects", { signal }),
        fetch("/api/departments", { signal }),
        fetch("/api/views?scope=projects", { signal }),
      ]);

      const nextProjects = projRes.ok ? ((await projRes.json()) as ProjectWithDetails[]) : [];
      const nextDepartments = deptRes.ok ? ((await deptRes.json()) as DepartmentSummary[]) : [];
      const nextViews = viewsRes.ok ? ((await viewsRes.json()) as UserSavedView[]) : [];

      if (signal?.aborted) return;

      setProjects(nextProjects);
      setDepartments(nextDepartments);
      setSavedViews(nextViews);

      const defaultView = nextViews.find((view) => view.isDefault) || nextViews[0];
      let nextViewMode: ViewMode = "grid";
      let nextFilterStatus: ProjectStatus | "" = "";
      let nextFilterDepartment = "";

      if (defaultView) {
        setSelectedViewId(defaultView.id);
        if (typeof defaultView.config.defaultLayout === "string") {
          const layout = defaultView.config.defaultLayout;
          if (layout === "grid" || layout === "swimlane" || layout === "list") {
            nextViewMode = layout;
            setViewMode(layout);
          }
        }
        if (typeof defaultView.config.filterStatus === "string") {
          const status = defaultView.config.filterStatus as ProjectStatus;
          if (status === "ACTIVE" || status === "ON_HOLD" || status === "COMPLETED" || status === "ARCHIVED") {
            nextFilterStatus = status;
            setFilterStatus(status);
          }
        }
        if (typeof defaultView.config.filterDepartment === "string") {
          nextFilterDepartment = defaultView.config.filterDepartment;
          setFilterDepartment(defaultView.config.filterDepartment);
        }
      }

      writeSessionCache<ProjectDashboardCache>(PROJECT_DASHBOARD_CACHE_KEY, {
        projects: nextProjects,
        departments: nextDepartments,
        savedViews: nextViews,
        selectedViewId: defaultView?.id ?? "",
        viewMode: nextViewMode,
        filterStatus: nextFilterStatus,
        filterDepartment: nextFilterDepartment,
      });
    } catch {
      // Silently handle
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const cached = readSessionCache<ProjectDashboardCache>(PROJECT_DASHBOARD_CACHE_KEY);

    if (cached) {
      queueMicrotask(() => {
        if (!active) return;
        setProjects(cached.projects);
        setDepartments(cached.departments);
        setSavedViews(cached.savedViews);
        setSelectedViewId(cached.selectedViewId);
        setViewMode(cached.viewMode);
        setFilterStatus(cached.filterStatus);
        setFilterDepartment(cached.filterDepartment);
        setLoading(false);
      });
    } else {
      queueMicrotask(() => {
        if (!active) return;
        setLoading(true);
      });
    }

    void fetchData(controller.signal);

    return () => {
      active = false;
      controller.abort();
    };
  }, [fetchData]);

  const filteredProjects = useMemo(() => {
    let list = projects;
    if (filterStatus) list = list.filter((p) => p.status === filterStatus);
    if (filterDepartment)
      list = list.filter((p) => p.departmentId === filterDepartment);
    return list;
  }, [projects, filterStatus, filterDepartment]);

  // Stats
  const stats = useMemo(() => {
    const total = projects.length;
    const active = projects.filter((p) => p.status === "ACTIVE").length;
    const completed = projects.filter((p) => p.status === "COMPLETED").length;
    const onHold = projects.filter((p) => p.status === "ON_HOLD").length;
    return { total, active, completed, onHold };
  }, [projects]);

  // Swim lane grouping
  const swimLanes = useMemo(() => {
    const grouped = new Map<
      string,
      { department: DepartmentSummary | null; projects: ProjectWithDetails[] }
    >();

    // Add a lane for each department
    for (const dept of departments) {
      grouped.set(dept.id, { department: dept, projects: [] });
    }
    // Add an "Unassigned" lane
    grouped.set("__none__", { department: null, projects: [] });

    for (const proj of filteredProjects) {
      const key = proj.departmentId || "__none__";
      const lane = grouped.get(key);
      if (lane) {
        lane.projects.push(proj);
      } else {
        // Dept exists in project but not in loaded departments list
        grouped.set(key, { department: proj.department, projects: [proj] });
      }
    }

    // Return lanes that have projects, with non-empty lanes first
    return Array.from(grouped.values()).filter(
      (lane) => lane.projects.length > 0,
    );
  }, [filteredProjects, departments]);

  const hasFilters = filterStatus || filterDepartment;

  const applySavedView = (viewId: string) => {
    setSelectedViewId(viewId);
    const view = savedViews.find((item) => item.id === viewId);
    if (!view) return;

    const layout = view.config.defaultLayout;
    if (layout === "grid" || layout === "swimlane" || layout === "list") {
      setViewMode(layout);
    }

    const status = view.config.filterStatus;
    if (
      status === "ACTIVE" ||
      status === "ON_HOLD" ||
      status === "COMPLETED" ||
      status === "ARCHIVED"
    ) {
      setFilterStatus(status);
    } else {
      setFilterStatus("");
    }

    const department = view.config.filterDepartment;
    if (typeof department === "string") {
      setFilterDepartment(department);
    } else {
      setFilterDepartment("");
    }
  };

  const saveCurrentAsView = async () => {
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

    if (!response.ok) return;
    const created = (await response.json()) as UserSavedView;
    setSavedViews((current) => [...current, created]);
    setSelectedViewId(created.id);
  };

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage and track all projects across departments
          </p>
        </div>
        <button
          onClick={() => router.push("/settings?tab=projects")}
          className="btn-primary-theme flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          New Project
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: "Total",
            value: stats.total,
            icon: FolderKanban,
            color: "var(--primary)",
          },
          {
            label: "Active",
            value: stats.active,
            icon: Circle,
            color: "#22c55e",
          },
          {
            label: "Completed",
            value: stats.completed,
            icon: CheckCircle2,
            color: "#3b82f6",
          },
          {
            label: "On Hold",
            value: stats.onHold,
            icon: Circle,
            color: "#eab308",
          },
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

      {/* Filters & view toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedViewId}
          onChange={(e) => applySavedView(e.target.value)}
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
          onChange={(e) =>
            setFilterStatus(e.target.value as ProjectStatus | "")
          }
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={filterDepartment}
          onChange={(e) => setFilterDepartment(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        {hasFilters && (
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
        )}

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

      {/* Content */}
      {filteredProjects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <FolderKanban className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {hasFilters ? "No projects match filters" : "No projects yet"}
          </p>
        </div>
      ) : viewMode === "grid" ? (
        /* Grid view */
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
        /* Swim lane view */
        <div className="space-y-6">
          {swimLanes.map((lane) => (
            <div key={lane.department?.id || "__none__"}>
              <div className="mb-3 flex items-center gap-2">
                {lane.department?.color && (
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: lane.department.color }}
                  />
                )}
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
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Project
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Department
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Tasks
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Updated
                </th>
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
