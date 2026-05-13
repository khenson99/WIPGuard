"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Target, Pencil, X, GripVertical } from "lucide-react";

interface CompanyPriority {
  id: string;
  name: string;
  summary: string | null;
  priority: number;
  color: string | null;
  _count?: { projects: number };
}

interface PriorityForm {
  name: string;
  summary: string;
  priority: number;
  color: string;
}

const emptyForm: PriorityForm = {
  name: "",
  summary: "",
  priority: 1,
  color: "#f59e0b",
};

const PRESET_COLORS = [
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
];

export function PrioritiesTab() {
  const [priorities, setPriorities] = useState<CompanyPriority[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PriorityForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchPriorities = useCallback(async () => {
    try {
      const res = await fetch("/api/priorities");
      if (res.ok) {
        setPriorities(await res.json());
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPriorities();
  }, [fetchPriorities]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      priority: priorities.length + 1,
    });
    setShowForm(true);
  };

  const openEdit = (item: CompanyPriority) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      summary: item.summary || "",
      priority: item.priority,
      color: item.color || "#f59e0b",
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
      const body = {
        name: form.name,
        summary: form.summary || null,
        priority: form.priority,
        color: form.color,
      };

      const url = editingId
        ? `/api/priorities/${editingId}`
        : "/api/priorities";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        await fetchPriorities();
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
          <h2 className="text-base font-semibold text-foreground">
            Company Priorities
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Define your company-level priorities and the operating focus they represent.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="btn-primary-theme flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          New Priority
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
              {editingId ? "Edit Priority" : "Create Priority"}
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
                Priority Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Revenue Growth"
                className="w-full rounded border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-muted-foreground">
                Summary
              </label>
              <textarea
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                rows={2}
                placeholder="Brief description of this priority..."
                className="w-full rounded border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Priority Level
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={form.priority}
                onChange={(e) =>
                  setForm({ ...form, priority: parseInt(e.target.value) || 1 })
                }
                className="w-full rounded border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Color</label>
              <div className="flex items-center gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    className={`h-7 w-7 rounded-full border-2 transition-all ${
                      form.color === c
                        ? "border-foreground scale-110"
                        : "border-transparent opacity-60 hover:opacity-100"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="h-7 w-7 cursor-pointer rounded border border-border bg-transparent"
                />
              </div>
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
                  ? "Update Priority"
                  : "Create Priority"}
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

      {/* Priority list */}
      {priorities.length === 0 && !showForm ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center">
          <Target className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No priorities defined yet</p>
          <p className="text-xs text-muted-foreground">
            Add company priorities to organize projects hierarchically
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {priorities.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />

              {/* Color dot */}
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: item.color || "#f59e0b" }}
              />

              {/* Info */}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {item.name}
                  </span>
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    #{item.priority}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {item.summary && (
                    <span className="text-muted-foreground">{item.summary}</span>
                  )}
                  {item.summary && item._count?.projects !== undefined && " · "}
                  {item._count?.projects !== undefined &&
                    `${item._count.projects} projects`}
                </p>
              </div>

              <button
                onClick={() => openEdit(item)}
                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                title="Edit priority"
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
