"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { DataTable, type DataTableColumn, fmt$ } from "@/components/analytics/dashboard-primitives";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";
import {
  DEALS_SCHEMA_MISSING_MESSAGE,
  isDealsSchemaMissingPayload,
} from "@/lib/deals/schema-state";
import {
  DEAL_STAGE_LABELS,
  DEAL_SOURCE_LABELS,
  MEETING_STATUS_LABELS,
  type DealStage,
  type DealSource,
  type MeetingStatus,
} from "@/types";

type TeamMember = { id: string; name: string | null; email: string; image: string | null };
type CompanyOption = { id: string; name: string };

interface StageHistoryEntry {
  id: string;
  fromStage: string | null;
  toStage: string;
  changedAt: string;
  changedBy: string | null;
}

interface ContactEntry {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
}

interface MeetingEntry {
  id: string;
  title: string;
  status: MeetingStatus;
  startAt: string;
  endAt: string | null;
  location: string | null;
  expectedAttendees: number;
  actualAttendees: number;
}

interface DealDetailData {
  id: string;
  name: string;
  stage: DealStage;
  amount: number;
  source: DealSource;
  expectedCloseDate: string | null;
  closedAt: string | null;
  notes: string | null;
  companyId: string | null;
  company: { id: string; name: string } | null;
  ownerId: string | null;
  owner: { id: string; name: string | null; email: string } | null;
  contacts: ContactEntry[];
  meetings: MeetingEntry[];
  stageHistory: StageHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

type Tab = "overview" | "contacts" | "meetings" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "contacts", label: "Contacts" },
  { id: "meetings", label: "Meetings" },
  { id: "history", label: "History" },
];

const STAGE_BADGE_CLASSES: Record<DealStage, string> = {
  LEAD: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  QUALIFIED: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  PROPOSAL: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  NEGOTIATION: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  CLOSED_WON: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  CLOSED_LOST: "bg-red-500/10 text-red-700 dark:text-red-300",
};

const MEETING_STATUS_BADGE: Record<MeetingStatus, string> = {
  SCHEDULED: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  COMPLETED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  CANCELED: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  NO_SHOW: "bg-red-500/10 text-red-700 dark:text-red-300",
};

const TEAM_CACHE_KEY = "team:v1";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DealDetail({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [deal, setDeal] = useState<DealDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [saving, setSaving] = useState(false);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);

  // Editable form state
  const [form, setForm] = useState({
    name: "",
    stage: "LEAD" as DealStage,
    amount: "",
    source: "OTHER" as DealSource,
    expectedCloseDate: "",
    notes: "",
    companyId: "",
    ownerId: "",
  });

  const loadDeal = useCallback(async () => {
    try {
      const res = await fetch(`/api/deals/${dealId}`);
      const payload = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        if (res.status === 503 && isDealsSchemaMissingPayload(payload)) {
          throw new Error(payload.error);
        }
        const errorMessage =
          payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : `Failed to load deal (${res.status})`;
        throw new Error(errorMessage);
      }
      const data = payload as DealDetailData;
      setDeal(data);
      setForm({
        name: data.name,
        stage: data.stage,
        amount: String(data.amount),
        source: data.source,
        expectedCloseDate: data.expectedCloseDate ? data.expectedCloseDate.slice(0, 10) : "",
        notes: data.notes || "",
        companyId: data.companyId || "",
        ownerId: data.ownerId || "",
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deal.");
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    void loadDeal();

    const cachedTeam = readSessionCache<TeamMember[]>(TEAM_CACHE_KEY);
    if (cachedTeam) setTeam(cachedTeam);

    fetch("/api/team")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed"))))
      .then((payload) => {
        const users = Array.isArray(payload) ? (payload as TeamMember[]) : [];
        setTeam(users);
        writeSessionCache(TEAM_CACHE_KEY, users);
      })
      .catch(() => {});

    fetch("/api/deals/companies")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed"))))
      .then((payload) => {
        const items = Array.isArray(payload) ? (payload as CompanyOption[]) : [];
        setCompanies(items);
      })
      .catch(() => {});
  }, [loadDeal]);

  const saveDeal = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          stage: form.stage,
          amount: Number(form.amount) || 0,
          source: form.source,
          expectedCloseDate: form.expectedCloseDate || null,
          notes: form.notes || null,
          companyId: form.companyId || null,
          ownerId: form.ownerId || null,
        }),
      });
      const payload = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        const errorMessage =
          res.status === 503 && isDealsSchemaMissingPayload(payload)
            ? payload.error
            : payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
              ? (payload as { error: string }).error
              : "Failed to save";
        throw new Error(errorMessage);
      }
      await loadDeal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save deal.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <DashboardLoadingState message="Loading deal..." className="h-[50vh]" />;
  if (!deal) {
    const setupRequired = error === DEALS_SCHEMA_MISSING_MESSAGE;
    return (
      <DashboardEmptyState
        title={setupRequired ? "Deals setup required" : "Deal not found"}
        message={error ?? "This deal could not be loaded."}
        actionLabel="Back to Deals"
        onAction={() => router.push("/deals")}
      />
    );
  }

  const contactColumns: DataTableColumn<ContactEntry>[] = [
    { key: "name", header: "Name", render: (r) => `${r.firstName} ${r.lastName}` },
    { key: "email", header: "Email", render: (r) => r.email || "—" },
    { key: "phone", header: "Phone", render: (r) => r.phone || "—" },
    { key: "title", header: "Title", render: (r) => r.title || "—" },
  ];

  const meetingColumns: DataTableColumn<MeetingEntry>[] = [
    { key: "title", header: "Title" },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${MEETING_STATUS_BADGE[r.status]}`}>
          {MEETING_STATUS_LABELS[r.status]}
        </span>
      ),
    },
    { key: "startAt", header: "Date", render: (r) => formatDateTime(r.startAt) },
    { key: "location", header: "Location", render: (r) => r.location || "—" },
    {
      key: "attendance",
      header: "Attendance",
      align: "center",
      render: (r) => `${r.actualAttendees}/${r.expectedAttendees}`,
    },
  ];

  return (
    <div className="space-y-6" data-testid="deal-detail-page">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/deals"
          className="icon-btn-muted rounded-md p-2"
          aria-label="Back to deals"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1
            className="truncate text-xl font-bold text-foreground"
            data-testid="deal-detail-title"
          >
            {deal.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STAGE_BADGE_CLASSES[deal.stage]}`}>
              {DEAL_STAGE_LABELS[deal.stage]}
            </span>
            <span className="text-sm font-semibold tabular-nums text-foreground">{fmt$(deal.amount)}</span>
            {deal.company && (
              <span className="text-sm text-muted-foreground">{deal.company.name}</span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.id === "contacts" && deal.contacts.length > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">({deal.contacts.length})</span>
            )}
            {t.id === "meetings" && deal.meetings.length > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">({deal.meetings.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === "overview" && (
        <div className="rounded-xl border border-border bg-card p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
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
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Stage</label>
              <select
                value={form.stage}
                onChange={(e) => setForm((p) => ({ ...p, stage: e.target.value as DealStage }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
                aria-label="Deal stage"
                data-testid="deal-stage-select"
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
                min="0"
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

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Owner</label>
              <select
                value={form.ownerId}
                onChange={(e) => setForm((p) => ({ ...p, ownerId: e.target.value }))}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">Unassigned</option>
                {team.map((u) => (
                  <option key={u.id} value={u.id}>{u.name || u.email}</option>
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
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Created {formatDate(deal.createdAt)} &middot; Updated {formatDate(deal.updatedAt)}
              {deal.closedAt && ` · Closed ${formatDate(deal.closedAt)}`}
            </p>
            <button
              onClick={saveDeal}
              disabled={saving}
              className="btn-primary-theme flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
              aria-label="Save deal changes"
              data-testid="save-deal-changes"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      {/* Contacts Tab */}
      {tab === "contacts" && (
        <div className="rounded-xl border border-border bg-card p-4">
          <DataTable columns={contactColumns} rows={deal.contacts} emptyMessage="No contacts associated with this deal." />
        </div>
      )}

      {/* Meetings Tab */}
      {tab === "meetings" && (
        <div className="rounded-xl border border-border bg-card p-4">
          <DataTable columns={meetingColumns} rows={deal.meetings} emptyMessage="No meetings for this deal." />
        </div>
      )}

      {/* History Tab */}
      {tab === "history" && (
        <div className="rounded-xl border border-border bg-card p-6">
          {deal.stageHistory.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No stage history recorded.</p>
          ) : (
            <div className="relative space-y-0">
              {deal.stageHistory.map((entry, i) => (
                <div key={entry.id} className="flex gap-4 pb-6 last:pb-0">
                  <div className="relative flex flex-col items-center">
                    <div className="h-3 w-3 rounded-full border-2 border-primary bg-card" />
                    {i < deal.stageHistory.length - 1 && (
                      <div className="absolute top-3 h-full w-px bg-border" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pb-2">
                    <p className="text-sm text-foreground">
                      {entry.fromStage ? (
                        <>
                          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STAGE_BADGE_CLASSES[entry.fromStage as DealStage] || ""}`}>
                            {DEAL_STAGE_LABELS[entry.fromStage as DealStage] || entry.fromStage}
                          </span>
                          {" → "}
                        </>
                      ) : (
                        "Created as "
                      )}
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STAGE_BADGE_CLASSES[entry.toStage as DealStage] || ""}`}>
                        {DEAL_STAGE_LABELS[entry.toStage as DealStage] || entry.toStage}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(entry.changedAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
