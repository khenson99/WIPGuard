"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, FolderOpen, Pencil, X } from "lucide-react";
import type { ProjectStatus, ProjectType } from "@/types";

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  projectType: ProjectType;
  businessFunction: string | null;
  companyPriorityId: string | null;
  companyPriority?: { id: string; name: string } | null;
  _count?: { tasks: number };
}

interface PrioritySummary {
  id: string;
  name: string;
}

interface ProjectForm {
  name: string;
  description: string;
  status: ProjectStatus;
  projectType: ProjectType;
  businessFunction: string;
  companyPriorityId: string;
}

const emptyForm: ProjectForm = {
  name: "",
  description: "",
  status: "ACTIVE",
  projectType: "ONE_OFF",
  businessFunction: "",
  companyPriorityId: "",
};

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ARCHIVED", label: "Archived" },
];

const TYPE_OPTIONS: { value: ProjectType; label: string }[] = [
  { value: "ONE_OFF", label: "One-Off" },
  { value: "RECURRING", label: "Recurring" },
  { value: "PERPETUAL", label: "Perpetual" },
];

const STATUS_COLORS: Record<ProjectStatus, string> = {
  ACTIVE: "bg-[var(--success)]/10 text-[var(--success)]",
  ON_HOLD: "bg-[var(--warning)]/10 text-[var(--warning)]",
  COMPLETED: "bg-[var(--link)]/10 text-[var(--link)]",
  ARCHIVED: "bg-secondary text-muted-foreground",
};

export function ProjectsTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [priorities, setPriorities] = useState<PrioritySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [projRes, priRes] = await Promise.all([
        fetch("/api/projects"),
        fetch("/api/priorities"),
      ]);
      if (projRes.ok) setProjects(await projRes.json());
      if (priRes.ok) {
        const priData = await priRes.json();
        setPriorities(priData.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (project: Project) => {
    setEditingId(project.id);
    setForm({
      name: project.name,
      description: project.description || "",
      status: project.status,
      projectType: project.projectType,
      businessFunction: project.businessFunction || "",
      companyPriorityId: project.companyPriorityId || "",
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        description: form.description || null,
        status: form.status,
        projectType: form.projectType,
        businessFunction: form.businessFunction || null,
        companyPriorityId: form.companyPriorityId || null,
      };

      const url = editingId ? `/api/projects/${editingId}` : "/api/projects";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        await fetchData();
        handleCancel();
      }
    } catch {
      // Handle silently
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Projects</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Manage projects and link them to company priorities.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="btn-primary-theme flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          New Project
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-lg border border-border bg-card p-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">
              {editingId ? "Edit Project" : "Create Project"}
            </h3>
            <button
              type="button"
              onClick={handleCancel}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-muted-foreground">
                Project Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Q1 Product Launch"
                className="w-full rounded border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-muted-foreground">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={2}
                className="w-full rounded border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Status</label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as ProjectStatus })
                }
                className="w-full rounded border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Type</label>
              <select
                value={form.projectType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    projectType: e.target.value as ProjectType,
                  })
                }
                className="w-full rounded border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Company Priority
              </label>
              <select
                value={form.companyPriorityId}
                onChange={(e) =>
                  setForm({ ...form, companyPriorityId: e.target.value })
                }
                className="w-full rounded border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
              >
                <option value="">None</option>
                {priorities.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Business Function
              </label>
              <input
                type="text"
                value={form.businessFunction}
                onChange={(e) =>
                  setForm({ ...form, businessFunction: e.target.value })
                }
                placeholder="e.g. Marketing"
                className="w-full rounded border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="btn-primary-theme rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : editingId
                  ? "Update Project"
                  : "Create Project"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="btn-ghost-muted rounded-lg border border-border px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Project list */}
      {projects.length === 0 && !showForm ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center">
          <FolderOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No projects yet</p>
          <p className="text-xs text-muted-foreground">
            Create a project to organize your tasks
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((project) => (
            <div
              key={project.id}
              className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {project.name}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[project.status]}`}
                  >
                    {project.status.replace("_", " ")}
                  </span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                    {project.projectType.replace("_", " ")}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {project.companyPriority?.name && (
                    <span className="text-primary">
                      {project.companyPriority.name}
                    </span>
                  )}
                  {project.companyPriority?.name &&
                    project._count?.tasks !== undefined &&
                    " · "}
                  {project._count?.tasks !== undefined &&
                    `${project._count.tasks} tasks`}
                  {project.description && (
                    <span className="ml-2 text-muted-foreground">
                      — {project.description}
                    </span>
                  )}
                </p>
              </div>

              <button
                onClick={() => openEdit(project)}
                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                title="Edit project"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
