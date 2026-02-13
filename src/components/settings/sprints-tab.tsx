"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Calendar, Check, Pencil } from "lucide-react";

interface Sprint {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  _count?: { tasks: number };
}

interface SprintForm {
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

const emptyForm: SprintForm = {
  name: "",
  startDate: "",
  endDate: "",
  isActive: false,
};

export function SprintsTab() {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SprintForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchSprints = useCallback(async () => {
    try {
      const res = await fetch("/api/sprints");
      if (res.ok) {
        const data = await res.json();
        setSprints(data);
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSprints();
  }, [fetchSprints]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (sprint: Sprint) => {
    setEditingId(sprint.id);
    setForm({
      name: sprint.name,
      startDate: sprint.startDate.split("T")[0],
      endDate: sprint.endDate.split("T")[0],
      isActive: sprint.isActive,
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
    if (!form.name || !form.startDate || !form.endDate) return;

    setSaving(true);
    try {
      const url = editingId ? `/api/sprints/${editingId}` : "/api/sprints";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        await fetchSprints();
        handleCancel();
      }
    } catch {
      // Handle error silently
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (sprint: Sprint) => {
    try {
      await fetch(`/api/sprints/${sprint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !sprint.isActive }),
      });
      await fetchSprints();
    } catch {
      // Silently handle
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getSprintStatus = (sprint: Sprint) => {
    const now = new Date();
    const start = new Date(sprint.startDate);
    const end = new Date(sprint.endDate);

    if (sprint.isActive && now >= start && now <= end) return "current";
    if (now > end) return "past";
    if (now < start) return "upcoming";
    return "inactive";
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
          <h2 className="text-base font-semibold text-foreground">
            Sprint Management
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Manage your sprints. Only one sprint can be active at a time.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="btn-primary-theme flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          New Sprint
        </button>
      </div>

      {/* Sprint form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-lg border border-border bg-card p-4"
        >
          <h3 className="text-sm font-medium text-foreground">
            {editingId ? "Edit Sprint" : "Create Sprint"}
          </h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-muted-foreground">
                Sprint Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Sprint 12"
                className="w-full rounded border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Start Date
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) =>
                  setForm({ ...form, startDate: e.target.value })
                }
                className="w-full rounded border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                End Date
              </label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full rounded border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
                required
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) =>
                setForm({ ...form, isActive: e.target.checked })
              }
              className="rounded border-border bg-secondary text-primary focus:ring-primary"
            />
            Set as active sprint
          </label>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="btn-primary-theme rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : editingId
                  ? "Update Sprint"
                  : "Create Sprint"}
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

      {/* Sprint list */}
      {sprints.length === 0 && !showForm ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center">
          <Calendar className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No sprints created yet</p>
          <p className="text-xs text-muted-foreground">
            Create your first sprint to start organizing work
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sprints.map((sprint) => {
            const status = getSprintStatus(sprint);
            return (
              <div
                key={sprint.id}
                className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3"
              >
                {/* Status indicator */}
                <div
                  className={`h-2.5 w-2.5 rounded-full ${
                    status === "current"
                      ? "bg-[var(--success)]"
                      : status === "upcoming"
                        ? "bg-[var(--link)]"
                        : "bg-muted-foreground"
                  }`}
                  title={status}
                />

                {/* Sprint info */}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {sprint.name}
                    </span>
                    {sprint.isActive && (
                      <span className="rounded-full bg-[var(--success)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--success)]">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(sprint.startDate)} –{" "}
                    {formatDate(sprint.endDate)}
                    {sprint._count?.tasks !== undefined && (
                      <span className="ml-2 text-muted-foreground">
                        · {sprint._count.tasks} tasks
                      </span>
                    )}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleActive(sprint)}
                    className={`rounded p-1.5 transition-colors ${
                      sprint.isActive
                        ? "text-[var(--success)] hover:bg-secondary hover:text-[var(--success)]"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                    title={
                      sprint.isActive ? "Deactivate sprint" : "Set as active"
                    }
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => openEdit(sprint)}
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    title="Edit sprint"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
