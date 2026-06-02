"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Building2, Pencil, Trash2, X } from "lucide-react";

interface Department {
  id: string;
  name: string;
  color: string | null;
}

interface DepartmentForm {
  name: string;
  color: string;
}

const emptyForm: DepartmentForm = { name: "", color: "" };

const PRESET_COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#6366f1", "#a855f7", "#14b8a6", "#64748b",
];

export function DepartmentsTab() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DepartmentForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/departments");
      if (res.ok) setDepartments(await res.json());
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

  const openEdit = (dept: Department) => {
    setEditingId(dept.id);
    setForm({ name: dept.name, color: dept.color || "" });
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
      const url = editingId ? `/api/departments/${editingId}` : "/api/departments";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          color: form.color || null,
        }),
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

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this department?")) return;
    try {
      const res = await fetch(`/api/departments/${id}`, { method: "DELETE" });
      if (res.ok) {
        await fetchData();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete");
      }
    } catch {
      // Handle silently
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
            Departments
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Define business departments for Imladris operating dashboards.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="btn-primary-theme flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          New Department
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
              {editingId ? "Edit Department" : "Create Department"}
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
                Department Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Engineering"
                className="w-full rounded border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-muted-foreground">
                Color
              </label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: c,
                      borderColor: form.color === c ? "var(--foreground)" : "transparent",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="btn-primary-theme rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {saving ? "Saving..." : editingId ? "Update" : "Create"}
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

      {/* Department list */}
      {departments.length === 0 && !showForm ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center">
          <Building2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No departments yet</p>
          <p className="text-xs text-muted-foreground">
            Create departments to organize operating metrics
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {departments.map((dept) => (
            <div
              key={dept.id}
              className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3"
            >
              {dept.color && (
                <div
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: dept.color }}
                />
              )}
              <div className="flex-1">
                <span className="text-sm font-medium text-foreground">
                  {dept.name}
                </span>
              </div>

              <button
                onClick={() => openEdit(dept)}
                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                title="Edit"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleDelete(dept.id)}
                className="icon-btn-delete rounded p-1.5"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
