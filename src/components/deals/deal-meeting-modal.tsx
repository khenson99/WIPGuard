"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";
import {
  MEETING_STATUS_LABELS,
  type MeetingStatus,
  type DealListItem,
  type DealCompanySummary,
  type DealContactSummary,
} from "@/types";

const COMPANIES_CACHE_KEY = "deal-companies:v1";
const CONTACTS_CACHE_KEY = "deal-contacts:v1";

function nowISO(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function DealMeetingModal({
  open,
  onClose,
  onCreated,
  deals,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  deals: DealListItem[];
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<DealCompanySummary[]>([]);
  const [contacts, setContacts] = useState<DealContactSummary[]>([]);

  const [form, setForm] = useState(() => ({
    title: "",
    status: "SCHEDULED" as MeetingStatus,
    startAt: nowISO(),
    endAt: "",
    location: "",
    dealId: "",
    companyId: "",
    attendeeIds: [] as string[],
    expectedAttendees: "1",
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

    const cachedCompanies = readSessionCache<DealCompanySummary[]>(COMPANIES_CACHE_KEY);
    if (cachedCompanies) setCompanies(cachedCompanies);

    const cachedContacts = readSessionCache<DealContactSummary[]>(CONTACTS_CACHE_KEY);
    if (cachedContacts) setContacts(cachedContacts);

    fetch("/api/deals/companies")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed"))))
      .then((payload) => {
        const items = Array.isArray(payload) ? (payload as DealCompanySummary[]) : [];
        setCompanies(items);
        writeSessionCache(COMPANIES_CACHE_KEY, items);
      })
      .catch(() => {});

    fetch("/api/deals/contacts")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed"))))
      .then((payload) => {
        const items = Array.isArray(payload) ? (payload as DealContactSummary[]) : [];
        setContacts(items);
        writeSessionCache(CONTACTS_CACHE_KEY, items);
      })
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) {
      setError("Meeting title is required.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/deals/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          status: form.status,
          startAt: form.startAt,
          endAt: form.endAt || undefined,
          location: form.location || undefined,
          dealId: form.dealId || undefined,
          companyId: form.companyId || undefined,
          attendeeIds: form.attendeeIds.length > 0 ? form.attendeeIds : undefined,
          expectedAttendees: Number(form.expectedAttendees) || 1,
          notes: form.notes || undefined,
        }),
      });

      const payload = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !payload?.id) {
        setError(payload?.error || `Failed to create meeting (${res.status}).`);
        return;
      }

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create meeting.");
    } finally {
      setSaving(false);
    }
  };

  const toggleAttendee = (contactId: string) => {
    setForm((p) => ({
      ...p,
      attendeeIds: p.attendeeIds.includes(contactId)
        ? p.attendeeIds.filter((id) => id !== contactId)
        : [...p.attendeeIds, contactId],
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="meeting-create-title"
        tabIndex={-1}
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card shadow-lg focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 id="meeting-create-title" className="text-lg font-semibold text-foreground">New Meeting</h2>
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
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Title</label>
              <input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
                placeholder="e.g. Discovery Call"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as MeetingStatus }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
              >
                {Object.entries(MEETING_STATUS_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Expected Attendees</label>
              <input
                type="number"
                value={form.expectedAttendees}
                onChange={(e) => setForm((p) => ({ ...p, expectedAttendees: e.target.value }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
                min="0"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Start</label>
              <input
                type="datetime-local"
                value={form.startAt}
                onChange={(e) => setForm((p) => ({ ...p, startAt: e.target.value }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">End</label>
              <input
                type="datetime-local"
                value={form.endAt}
                onChange={(e) => setForm((p) => ({ ...p, endAt: e.target.value }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Location</label>
              <input
                value={form.location}
                onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
                placeholder="e.g. Zoom / Conference Room A"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Deal</label>
              <select
                value={form.dealId}
                onChange={(e) => setForm((p) => ({ ...p, dealId: e.target.value }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">None</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            <div>
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

            {contacts.length > 0 && (
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Attendees ({form.attendeeIds.length} selected)
                </label>
                <div className="max-h-32 overflow-y-auto rounded-md border border-border bg-secondary/20 p-2">
                  {contacts.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 py-1 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={form.attendeeIds.includes(c.id)}
                        onChange={() => toggleAttendee(c.id)}
                        className="rounded border-border bg-secondary text-primary focus:ring-primary"
                      />
                      {c.firstName} {c.lastName}
                      {c.company && <span className="text-xs text-muted-foreground">({c.company.name})</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
                rows={2}
                placeholder="Optional notes..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-ghost-muted rounded-lg border border-border px-4 py-2 text-sm">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary-theme rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
              {saving ? "Creating..." : "Create Meeting"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
