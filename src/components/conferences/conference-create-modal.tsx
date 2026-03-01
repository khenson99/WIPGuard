"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";
import {
  CONFERENCE_TYPE_LABELS,
  type ConferenceType,
} from "@/types";

type TeamMember = { id: string; name: string | null; email: string; image: string | null };

const TEAM_CACHE_KEY = "team:v1";

function resolveBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ConferenceCreateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (created: { id: string }, opts: { seedPlaybook: boolean }) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);

  const [form, setForm] = useState(() => ({
    name: "",
    startDate: todayISO(),
    endDate: todayISO(),
    timezone: resolveBrowserTimezone(),
    type: "EXHIBIT" as ConferenceType,
    ownerId: "",
    websiteUrl: "",
    city: "",
    region: "",
    country: "",
    venue: "",
    seedPlaybook: true,
  }));

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    const cached = readSessionCache<TeamMember[]>(TEAM_CACHE_KEY);
    if (cached) {
      setTeam(cached);
    }

    fetch("/api/team")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Team request failed (${res.status})`))))
      .then((payload) => {
        const users = Array.isArray(payload) ? (payload as TeamMember[]) : [];
        setTeam(users);
        writeSessionCache(TEAM_CACHE_KEY, users);
      })
      .catch(() => {
        // Non-fatal; owner selection can remain empty.
      });
  }, [open]);

  const typeOptions = useMemo(() => {
    return Object.entries(CONFERENCE_TYPE_LABELS).map(([value, label]) => ({
      value: value as ConferenceType,
      label,
    }));
  }, []);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError("Conference name is required.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/conferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          startDate: form.startDate,
          endDate: form.endDate,
          timezone: form.timezone,
          type: form.type,
          ownerId: form.ownerId || undefined,
          websiteUrl: form.websiteUrl || undefined,
          city: form.city || undefined,
          region: form.region || undefined,
          country: form.country || undefined,
          venue: form.venue || undefined,
        }),
      });

      const payload = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !payload?.id) {
        setError(payload?.error || `Failed to create conference (${res.status}).`);
        return;
      }

      onCreated({ id: payload.id }, { seedPlaybook: form.seedPlaybook });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create conference.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="conference-create-title"
        tabIndex={-1}
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card shadow-lg focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 id="conference-create-title" className="text-lg font-semibold text-foreground">
            New Conference
          </h2>
          <button
            onClick={onClose}
            className="icon-btn-muted rounded-md p-2 focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close dialog"
            title="Close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-5 px-6 py-5">
          {error ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
                placeholder="e.g. SaaStr Annual"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">End Date</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Timezone</label>
              <input
                value={form.timezone}
                onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
                placeholder="America/Los_Angeles"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as ConferenceType }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
              >
                {typeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Owner</label>
              <select
                value={form.ownerId}
                onChange={(e) => setForm((p) => ({ ...p, ownerId: e.target.value }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">Default to me</option>
                {team.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name || user.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Website</label>
              <input
                value={form.websiteUrl}
                onChange={(e) => setForm((p) => ({ ...p, websiteUrl: e.target.value }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
                placeholder="https://..."
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">City</label>
              <input
                value={form.city}
                onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Region</label>
              <input
                value={form.region}
                onChange={(e) => setForm((p) => ({ ...p, region: e.target.value }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Country</label>
              <input
                value={form.country}
                onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Venue</label>
              <input
                value={form.venue}
                onChange={(e) => setForm((p) => ({ ...p, venue: e.target.value }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.seedPlaybook}
              onChange={(e) => setForm((p) => ({ ...p, seedPlaybook: e.target.checked }))}
              className="rounded border-border bg-secondary text-primary focus:ring-primary"
            />
            Seed playbook (projects, tasks, deadlines, budget)
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost-muted rounded-lg border border-border px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary-theme rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create Conference"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

