"use client";

import { useEffect, useState, useCallback } from "react";
import { Save, RotateCcw, AlertTriangle, X } from "lucide-react";
import { COLUMN_ORDER, COLUMN_LABELS } from "@/types";
import type { TaskStatus } from "@/types";

interface BoardSetting {
  id?: string;
  columnName: string;
  wipLimit: number;
  columnOrder: number;
  color: string | null;
}

const DEFAULT_COLORS: Record<TaskStatus, string> = {
  BACKLOG: "#71717a",
  QUEUED: "#3b82f6",
  WORKING_ON_TODAY: "#f59e0b",
  ACTIVE: "#22c55e",
  NOT_DONE: "#ef4444",
  DONE: "#6b7280",
};

export function BoardSettingsTab() {
  const [settings, setSettings] = useState<BoardSetting[]>(
    COLUMN_ORDER.map((status, i) => ({
      columnName: status,
      wipLimit: status === "WORKING_ON_TODAY" ? 3 : status === "ACTIVE" ? 1 : 0,
      columnOrder: i,
      color: DEFAULT_COLORS[status],
    }))
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/board-settings");
      if (res.ok) {
        const data = await res.json();
        if (data.length > 0) {
          setSettings(data);
        }
      }
    } catch (err) {
      setError("Failed to load settings");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateWipLimit = (columnName: string, value: number) => {
    setSettings((prev) =>
      prev.map((s) =>
        s.columnName === columnName ? { ...s, wipLimit: Math.max(0, value) } : s
      )
    );
    setSaved(false);
  };

  const updateColor = (columnName: string, color: string) => {
    setSettings((prev) =>
      prev.map((s) => (s.columnName === columnName ? { ...s, color } : s))
    );
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/board-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          settings.map((s) => ({
            columnName: s.columnName,
            wipLimit: s.wipLimit,
            columnOrder: s.columnOrder,
            color: s.color,
          }))
        ),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      setError("Failed to save settings");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(
      COLUMN_ORDER.map((status, i) => ({
        columnName: status,
        wipLimit:
          status === "WORKING_ON_TODAY" ? 3 : status === "ACTIVE" ? 1 : 0,
        columnOrder: i,
        color: DEFAULT_COLORS[status],
      }))
    );
    setSaved(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm text-destructive">{error}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setError(null);
                if (error === "Failed to load settings") {
                  setLoading(true);
                  fetchSettings();
                } else {
                  handleSave();
                }
              }}
              className="rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/20"
            >
              Retry
            </button>
            <button
              onClick={() => setError(null)}
              className="rounded-md p-1 text-destructive hover:bg-destructive/20"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-base font-semibold text-foreground">
          WIP Limits & Column Settings
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Set work-in-progress limits for each column. A limit of 0 means
          unlimited. When exceeded, the column header turns red and a
          confirmation is required to add more tasks.
        </p>
      </div>

      <div className="space-y-3">
        {settings
          .sort((a, b) => a.columnOrder - b.columnOrder)
          .map((setting) => (
            <div
              key={setting.columnName}
              className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3"
            >
              {/* Color picker */}
              <input
                type="color"
                value={setting.color || "#71717a"}
                onChange={(e) =>
                  updateColor(setting.columnName, e.target.value)
                }
                className="h-8 w-8 cursor-pointer rounded border border-border bg-transparent"
                title="Column color"
              />

              {/* Column name */}
              <div className="flex-1">
                <span className="text-sm font-medium text-foreground">
                  {COLUMN_LABELS[setting.columnName as TaskStatus] ||
                    setting.columnName}
                </span>
              </div>

              {/* WIP limit */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">WIP Limit</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={setting.wipLimit}
                  onChange={(e) =>
                    updateWipLimit(
                      setting.columnName,
                      parseInt(e.target.value) || 0
                    )
                  }
                  className="w-16 rounded border border-border bg-secondary px-2 py-1.5 text-center text-sm text-foreground focus:border-ring focus:outline-none"
                />
              </div>
            </div>
          ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary-theme flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : saved ? "Saved ✓" : "Save Changes"}
        </button>
        <button
          onClick={handleReset}
          className="btn-ghost-muted flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium"
        >
          <RotateCcw className="h-4 w-4" />
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}
