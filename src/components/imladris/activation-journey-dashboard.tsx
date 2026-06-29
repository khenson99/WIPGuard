"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Database } from "lucide-react";
import type {
  ActivationJourneyDashboardPayload,
  ActivationJourneyMilestoneKey,
} from "@/lib/imladris/activation-journey";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";
import { JourneyFlowView } from "./journey-flow-view";
import { DiagnosticsView } from "./diagnostics-view";
import { SegmentsView } from "./segments-view";
import styles from "./activation-journey-dashboard.module.css";

// ── Constants ───────────────────────────────────────────────────────────

const MILESTONE_OPTIONS: Array<{ value: ActivationJourneyMilestoneKey; label: string }> = [
  { value: "site_visited", label: "Site visited" },
  { value: "kanban_submitted", label: "Free kanban submitted" },
  { value: "cta_clicked", label: "CTA clicked" },
  { value: "demo", label: "Demo booked" },
  { value: "trial", label: "Trial started" },
  { value: "paid", label: "Became paid" },
  { value: "signup", label: "Signed up" },
  { value: "tour_started", label: "Tour started" },
  { value: "video_completed", label: "Video completed" },
  { value: "item_created", label: "Item created" },
  { value: "card_printed", label: "Card printed" },
  { value: "queue_added", label: "Added to order queue" },
  { value: "order_placed", label: "Order placed" },
  { value: "activation_completed", label: "Activation completed" },
];

const DATE_RANGES = ["7d", "30d", "90d", "365d", "All"] as const;
type DateRange = (typeof DATE_RANGES)[number];

const VIEW_TABS = [
  { id: "flow" as const, label: "Journey flow" },
  { id: "funnel" as const, label: "Diagnostics" },
  { id: "explorer" as const, label: "Segments" },
];

// ── State ───────────────────────────────────────────────────────────────

type View = "flow" | "funnel" | "explorer";
type Segmentation = "flow" | "cohort" | "source" | "furthest";
type TaxFilter = "all" | "mapped" | "unmapped";
type SegDimension = "source" | "cohort";
type DiagSubView = "funnel" | "flow";

interface ActivationJourneyState {
  view: View;
  range: DateRange;
  customFrom: string;
  customTo: string;
  customActive: boolean;
  actKey: ActivationJourneyMilestoneKey;
  seg: Segmentation;
  showSource: boolean;
  focusA: string | null;
  focusB: string | null;
  expanded: string | null;
  taxFilter: TaxFilter;
  segDim: SegDimension;
  selActor: number | null;
  bViz: DiagSubView;
}

type Action =
  | { type: "SET_VIEW"; view: View }
  | { type: "SET_RANGE"; range: DateRange }
  | { type: "SET_CUSTOM_RANGE"; from: string; to: string }
  | { type: "SET_ACT_KEY"; actKey: ActivationJourneyMilestoneKey }
  | { type: "SET_SEG"; seg: Segmentation }
  | { type: "TOGGLE_SOURCE" }
  | { type: "SET_FOCUS_A"; nodeId: string | null }
  | { type: "SET_FOCUS_B"; nodeId: string | null }
  | { type: "SET_EXPANDED"; key: string | null }
  | { type: "SET_TAX_FILTER"; filter: TaxFilter }
  | { type: "SET_SEG_DIM"; dim: SegDimension }
  | { type: "SET_SEL_ACTOR"; index: number | null }
  | { type: "SET_BVIZ"; mode: DiagSubView };

const initialState: ActivationJourneyState = {
  view: "flow",
  range: "30d",
  customFrom: "",
  customTo: "",
  customActive: false,
  actKey: "order_placed",
  seg: "flow",
  showSource: true,
  focusA: null,
  focusB: null,
  expanded: null,
  taxFilter: "all",
  segDim: "source",
  selActor: null,
  bViz: "funnel",
};

function reducer(state: ActivationJourneyState, action: Action): ActivationJourneyState {
  switch (action.type) {
    case "SET_VIEW":
      return { ...state, view: action.view };
    case "SET_RANGE":
      return { ...state, range: action.range, customActive: false };
    case "SET_CUSTOM_RANGE":
      return { ...state, customFrom: action.from, customTo: action.to, customActive: true };
    case "SET_ACT_KEY":
      return { ...state, actKey: action.actKey };
    case "SET_SEG":
      return { ...state, seg: action.seg, focusA: null };
    case "TOGGLE_SOURCE":
      return { ...state, showSource: !state.showSource, focusA: null };
    case "SET_FOCUS_A":
      return { ...state, focusA: action.nodeId };
    case "SET_FOCUS_B":
      return { ...state, focusB: action.nodeId };
    case "SET_EXPANDED":
      return { ...state, expanded: state.expanded === action.key ? null : action.key };
    case "SET_TAX_FILTER":
      return { ...state, taxFilter: action.filter };
    case "SET_SEG_DIM":
      return { ...state, segDim: action.dim };
    case "SET_SEL_ACTOR":
      return { ...state, selActor: state.selActor === action.index ? null : action.index };
    case "SET_BVIZ":
      return { ...state, bViz: action.mode };
    default:
      return state;
  }
}

// ── Formatting helpers ──────────────────────────────────────────────────

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatCompact(n: number): string {
  const rounded = Math.round(n);
  if (rounded >= 1000) {
    const k = rounded / 1000;
    return (k >= 100 ? Math.round(k) : Math.round(k * 10) / 10) + "k";
  }
  return "" + rounded;
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

export function formatRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  const pct = value * 100;
  return `${pct.toFixed(pct > 0 && pct < 10 ? 1 : 0)}%`;
}

export function formatHours(value: number | null): string {
  if (value === null) return "n/a";
  if (value < 1) return `${Math.round(value * 60)}m`;
  if (value < 48) return `${value % 1 === 0 ? value : value.toFixed(1)}h`;
  return `${(value / 24).toFixed(1)}d`;
}

export function formatDateTime(value: string | null): string {
  if (!value) return "No events";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

// ── Cache key ───────────────────────────────────────────────────────────

type Selection = { range: DateRange; customActive: boolean; customFrom: string; customTo: string };

function selectionKey(s: Selection): string {
  return s.customActive ? `custom:${s.customFrom}:${s.customTo}` : s.range;
}

function cacheKey(key: string): string {
  return `imladris:aj:${key}`;
}

const PRESET_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 };

function selectionUrl(s: Selection): string {
  const base = "/api/imladris/dashboards/activation-journey";
  if (s.customActive && s.customFrom && s.customTo) {
    return `${base}?from=${s.customFrom}&to=${s.customTo}`;
  }
  if (s.range === "All") return `${base}?all=1`;
  const d = PRESET_DAYS[s.range];
  return d ? `${base}?days=${d}` : base;
}

function daysToRange(days: number): DateRange {
  if (days <= 7) return "7d";
  if (days <= 30) return "30d";
  if (days <= 90) return "90d";
  if (days <= 365) return "365d";
  return "All";
}

// ── Main component ──────────────────────────────────────────────────────

interface ActivationJourneyDashboardProps {
  initialData: ActivationJourneyDashboardPayload;
}

export function ActivationJourneyDashboard({ initialData }: ActivationJourneyDashboardProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [data, setData] = useReducer(
    (_prev: ActivationJourneyDashboardPayload, next: ActivationJourneyDashboardPayload) => next,
    initialData,
  );
  const fetchingRef = useRef(false);
  const lastKeyRef = useRef<string>(daysToRange(initialData.window.days));
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");

  // Fetch data when the selected window (preset / All / custom) changes
  const fetchData = useCallback(async (sel: Selection) => {
    if (fetchingRef.current) return;
    const key = selectionKey(sel);

    // Check session cache first
    const cached = readSessionCache<ActivationJourneyDashboardPayload>(cacheKey(key));
    if (cached) {
      setData(cached);
      return;
    }

    fetchingRef.current = true;
    try {
      const res = await fetch(selectionUrl(sel));
      if (!res.ok) return;
      const json = await res.json();
      writeSessionCache(cacheKey(key), json);
      setData(json);
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const sel: Selection = {
      range: state.range,
      customActive: state.customActive,
      customFrom: state.customFrom,
      customTo: state.customTo,
    };
    const key = selectionKey(sel);
    if (key !== lastKeyRef.current) {
      lastKeyRef.current = key;
      fetchData(sel);
    }
  }, [state.range, state.customActive, state.customFrom, state.customTo, fetchData]);

  // Cache the initial data under its initial range key
  useEffect(() => {
    writeSessionCache(cacheKey(daysToRange(initialData.window.days)), initialData);
  }, [initialData]);

  const sourceStatusClass =
    data.source.status === "ready"
      ? styles.badgeSuccess
      : data.source.status === "partial"
        ? styles.badgeWarning
        : styles.badgeDanger;

  const activationLabel = useMemo(
    () => MILESTONE_OPTIONS.find((o) => o.value === state.actKey)?.label ?? "Order placed",
    [state.actKey],
  );

  return (
    <div className={styles.root}>
      {/* ── Topbar ── */}
      <header className={styles.topbar}>
        <div className={styles.titleBlock}>
          <span className={styles.eyebrow}>Imladris · Product analytics</span>
          <h1>Activation Journey</h1>
        </div>
        <div className={styles.topbarSpacer} />

        {/* View toggle */}
        <div className={styles.seg}>
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={state.view === tab.id ? styles.segActive : undefined}
              onClick={() => dispatch({ type: "SET_VIEW", view: tab.id })}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Date range presets */}
        <div className={`${styles.seg} ${styles.segLight}`}>
          {DATE_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              className={!state.customActive && state.range === r ? styles.segActive : undefined}
              onClick={() => dispatch({ type: "SET_RANGE", range: r })}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Custom date range — back to whenever data starts */}
        <div className={`${styles.seg} ${styles.segLight}`} style={{ gap: 4, alignItems: "center" }}>
          <input
            type="date"
            aria-label="From date"
            value={draftFrom}
            max={draftTo || undefined}
            onChange={(e) => setDraftFrom(e.target.value)}
            style={{ fontSize: 12, padding: "2px 4px", border: "none", background: "transparent", color: "inherit" }}
          />
          <span style={{ color: "#9ca3af", fontSize: 12 }}>→</span>
          <input
            type="date"
            aria-label="To date"
            value={draftTo}
            min={draftFrom || undefined}
            onChange={(e) => setDraftTo(e.target.value)}
            style={{ fontSize: 12, padding: "2px 4px", border: "none", background: "transparent", color: "inherit" }}
          />
          <button
            type="button"
            className={state.customActive ? styles.segActive : undefined}
            disabled={!draftFrom || !draftTo}
            onClick={() => dispatch({ type: "SET_CUSTOM_RANGE", from: draftFrom, to: draftTo })}
          >
            Apply
          </button>
        </div>

        {/* Source badge */}
        <span className={`${styles.badge} ${sourceStatusClass}`}>
          <Database size={12} />
          PostHog {data.source.status}
        </span>
      </header>

      {/* ── View content ── */}
      <div className={styles.scroll}>
        {state.view === "flow" && (
          <div className={styles.viewPane}>
            <JourneyFlowView
              data={data}
              actKey={state.actKey}
              activationLabel={activationLabel}
              seg={state.seg}
              showSource={state.showSource}
              focusNode={state.focusA}
              onActKeyChange={(k) => dispatch({ type: "SET_ACT_KEY", actKey: k })}
              onSegChange={(s) => dispatch({ type: "SET_SEG", seg: s })}
              onToggleSource={() => dispatch({ type: "TOGGLE_SOURCE" })}
              onFocusChange={(id) => dispatch({ type: "SET_FOCUS_A", nodeId: id })}
            />
          </div>
        )}
        {state.view === "funnel" && (
          <div className={styles.viewPane}>
            <DiagnosticsView
              data={data}
              actKey={state.actKey}
              activationLabel={activationLabel}
              expanded={state.expanded}
              taxFilter={state.taxFilter}
              bViz={state.bViz}
              showSource={state.showSource}
              seg={state.seg}
              focusNode={state.focusB}
              onActKeyChange={(k) => dispatch({ type: "SET_ACT_KEY", actKey: k })}
              onExpand={(k) => dispatch({ type: "SET_EXPANDED", key: k })}
              onTaxFilter={(f) => dispatch({ type: "SET_TAX_FILTER", filter: f })}
              onBViz={(m) => dispatch({ type: "SET_BVIZ", mode: m })}
              onFocusChange={(id) => dispatch({ type: "SET_FOCUS_B", nodeId: id })}
            />
          </div>
        )}
        {state.view === "explorer" && (
          <div className={styles.viewPane}>
            <SegmentsView
              data={data}
              actKey={state.actKey}
              activationLabel={activationLabel}
              segDim={state.segDim}
              selActor={state.selActor}
              onActKeyChange={(k) => dispatch({ type: "SET_ACT_KEY", actKey: k })}
              onSegDim={(d) => dispatch({ type: "SET_SEG_DIM", dim: d })}
              onSelActor={(i) => dispatch({ type: "SET_SEL_ACTOR", index: i })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
