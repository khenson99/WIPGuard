"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";
import {
  DEAL_STAGE_LABELS,
  DEAL_SOURCE_LABELS,
  type DealStage,
  type DealSource,
  type DealCompanySummary,
} from "@/types";

type TeamMember = { id: string; name: string | null; email: string; image: string | null };

const TEAM_CACHE_KEY = "team:v1";
const COMPANIES_CACHE_KEY = "deal-companies:v1";

export function DealCreateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (created: { id: string }) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [companies, setCompanies] = useState<DealCompanySummary[]>([]);

  const [form, setForm] = useState(() => ({
    name: "",
    stage: "LEAD" as DealStage,
    amount: "",
    source: "OTHER" as DealSource,
    companyId: "",
    ownerId: "",
    expectedCloseDate: "",
    notes: "",
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

    const cachedTeam = readSessionCache<TeamMember[]>(TEAM_CACHE_KEY);
    if (cachedTeam) setTeam(cachedTeam);

    const cachedCompanies = readSessionCache<DealCompanySummary[]>(COMPANIES_CACHE_KEY);
    if (cachedCompanies) setCompanies(cachedCompanies);

    fetch("/api/team")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed"))))
      .then((payload) => {
        const users = Array.isArray(payload) ? (payload as TeamMember[]) : [];
        setTeam(users);
        writeSessionCache(TEAM_CACHE_KEY, users);
      })
      .catch(() => {});

    fetch("/api/deals/companies")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed"))))
      .then((payload) => {
        const items = Array.isArray(payload) ? (payload as DealCompanySummary[]) : [];
        setCompanies(items);
        writeSessionCache(COMPANIES_CACHE_KEY, items);
      })
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError("Deal name is required.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          stage: form.stage,
          amount: Number(form.amount) || 0,
          source: form.source,
          companyId: form.companyId || undefined,
          ownerId: form.ownerId || undefined,
          expectedCloseDate: form.expectedCloseDate || undefined,
          notes: form.notes || undefined,
        }),
      });

      const payload = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !payload?.id) {
        setError(payload?.error || `Failed to create deal (${res.status}).`);
        return;
      }

      onCreated({ id: payload.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create deal.");
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
        aria-labelledby="deal-create-title"
        tabIndex={-1}
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card shadow-lg focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 id="deal-create-title" className="text-lg font-semibold text-foreground">New Deal</h2>
          <button onClick={onClose} className="icon-btn-muted rounded-md p-2" aria-label="Close dialog" title="Close">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-5 px-6 py-5">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Deal Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
                placeholder="e.g. Acme Corp - Enterprise License"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Stage</label>
              <select
                value={form.stage}
                onChange={(e) => setForm((p) => ({ ...p, stage: e.target.value as DealStage }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
              >
                {Object.entries(DEAL_STAGE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Amount ($)</label>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
                placeholder="0"
                min="0"
                step="1"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Source</label>
              <select
                value={form.source}
                onChange={(e) => setForm((p) => ({ ...p, source: e.target.value as DealSource }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
              >
                {Object.entries(DEAL_SOURCE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Expected Close</label>
              <input
                type="date"
                value={form.expectedCloseDate}
                onChange={(e) => setForm((p) => ({ ...p, expectedCloseDate: e.target.value }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Company</label>
              <select
                value={form.companyId}
                onChange={(e) => setForm((p) => ({ ...p, companyId: e.target.value }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">None</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
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
                  <option key={user.id} value={user.id}>{user.name || user.email}</option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
                rows={3}
                placeholder="Optional notes..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-ghost-muted rounded-lg border border-border px-4 py-2 text-sm">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary-theme rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
              {saving ? "Creating..." : "Create Deal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
