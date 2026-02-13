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
  ACTIVE: "bg-green-900/50 text-green-400",
  ON_HOLD: "bg-yellow-900/50 text-yellow-400",
  COMPLETED: "bg-blue-900/50 text-blue-400",
  ARCHIVED: "bg-zinc-800 text-zinc-500",
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

      // For create, use POST to /api/projects
      // For edit, we need a PATCH endpoint — fallback to POST for now
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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Projects</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Manage projects and link them to company priorities.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500"
        >
          <Plus className="h-4 w-4" />
          New Project
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-lg border border-zinc-700 bg-zinc-900/80 p-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-white">
              {editingId ? "Edit Project" : "Create Project"}
            </h3>
            <button
              type="button"
              onClick={handleCancel}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-zinc-400">
                Project Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Q1 Product Launch"
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-zinc-400">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={2}
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">Status</label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as ProjectStatus })
                }
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">Type</label>
              <select
                value={form.projectType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    projectType: e.target.value as ProjectType,
                  })
                }
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">
                Company Priority
              </label>
              <select
                value={form.companyPriorityId}
                onChange={(e) =>
                  setForm({ ...form, companyPriorityId: e.target.value })
                }
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
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
              <label className="mb-1 block text-xs text-zinc-400">
                Business Function
              </label>
              <input
                type="text"
                value={form.businessFunction}
                onChange={(e) =>
                  setForm({ ...form, businessFunction: e.target.value })
                }
                placeholder="e.g. Marketing"
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
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
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Project list */}
      {projects.length === 0 && !showForm ? (
        <div className="rounded-lg border border-dashed border-zinc-700 py-12 text-center">
          <FolderOpen className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
          <p className="text-sm text-zinc-500">No projects yet</p>
          <p className="text-xs text-zinc-600">
            Create a project to organize your tasks
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((project) => (
            <div
              key={project.id}
              className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-200">
                    {project.name}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[project.status]}`}
                  >
                    {project.status.replace("_", " ")}
                  </span>
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
                    {project.projectType.replace("_", " ")}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {project.companyPriority?.name && (
                    <span className="text-amber-600">
                      {project.companyPriority.name}
                    </span>
                  )}
                  {project.companyPriority?.name &&
                    project._count?.tasks !== undefined &&
                    " · "}
                  {project._count?.tasks !== undefined &&
                    `${project._count.tasks} tasks`}
                  {project.description && (
                    <span className="ml-2 text-zinc-600">
                      — {project.description}
                    </span>
                  )}
                </p>
              </div>

              <button
                onClick={() => openEdit(project)}
                className="rounded p-1.5 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-400"
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
