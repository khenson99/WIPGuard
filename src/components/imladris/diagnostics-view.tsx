"use client";

import { useMemo, useState } from "react";
import type {
  ActivationJourneyDashboardPayload,
  ActivationJourneyMilestoneKey,
} from "@/lib/imladris/activation-journey";
import { SankeyChart, type SankeyTooltip } from "./sankey-chart";
import {
  formatCompact,
  formatHours,
  formatNumber,
  formatRate,
} from "./activation-journey-dashboard";
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

const MILESTONE_COLORS: Record<ActivationJourneyMilestoneKey, string> = {
  site_visited: "#3aa392",
  kanban_submitted: "#2f8c7a",
  cta_clicked: "#2a806e",
  demo: "#257562",
  trial: "#1f6a57",
  paid: "#18a558",
  signup: "#7d8cc0",
  tour_started: "#9aa6b8",
  video_completed: "#8693ac",
  item_created: "#6f86b0",
  card_printed: "#5f86a8",
  queue_added: "#4f8f93",
  order_placed: "#d98a3a",
  activation_completed: "#FC5A29",
};

type TaxFilter = "all" | "mapped" | "unmapped";
type DiagSubView = "funnel" | "flow";
type Segmentation = "flow" | "cohort" | "source" | "furthest";

interface DiagnosticsViewProps {
  data: ActivationJourneyDashboardPayload;
  actKey: ActivationJourneyMilestoneKey;
  activationLabel: string;
  expanded: string | null;
  taxFilter: TaxFilter;
  bViz: DiagSubView;
  showSource: boolean;
  seg: Segmentation;
  focusNode: string | null;
  onActKeyChange: (key: ActivationJourneyMilestoneKey) => void;
  onExpand: (key: string | null) => void;
  onTaxFilter: (filter: TaxFilter) => void;
  onBViz: (mode: DiagSubView) => void;
  onFocusChange: (nodeId: string | null) => void;
}

export function DiagnosticsView({
  data,
  actKey,
  expanded,
  taxFilter,
  bViz,
  showSource,
  seg,
  focusNode,
  onActKeyChange,
  onExpand,
  onTaxFilter,
  onBViz,
  onFocusChange,
}: DiagnosticsViewProps) {
  const [tooltip, setTooltip] = useState<SankeyTooltip | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Health strip
  const totalEvents = data.summary.totalEvents;
  const unmapped = data.source.unmappedEvents;
  const mapped = totalEvents - unmapped;
  const liveMs = data.milestones.filter((m) => m.actors > 0).length;

  // Filtered taxonomy
  const taxRows = useMemo(() => {
    return data.eventTaxonomy.filter((row) => {
      const isMapped = Boolean(row.mappedMilestone) || row.mappedSubStages.length > 0;
      if (taxFilter === "mapped") return isMapped;
      if (taxFilter === "unmapped") return !isMapped;
      return true;
    });
  }, [data.eventTaxonomy, taxFilter]);

  // Drop-off ranking (where it leaks)
  const dropRank = useMemo(() => {
    const ms = data.milestones;
    const lost: Array<{ from: string; to: string; lost: number; pct: number }> = [];
    for (let i = 1; i < ms.length; i++) {
      const diff = Math.max(0, ms[i - 1].actors - ms[i].actors);
      lost.push({
        from: ms[i - 1].label,
        to: ms[i].label,
        lost: diff,
        pct: ms[i - 1].actors > 0 ? diff / ms[i - 1].actors : 0,
      });
    }
    lost.sort((a, b) => b.lost - a.lost);
    return lost.slice(0, 4);
  }, [data.milestones]);
  const maxLost = Math.max(1, ...dropRank.map((d) => d.lost));

  const firstMsActors = data.milestones[0]?.actors ?? 1;

  // Transition times indexed by toKey
  const t2cByTo = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const t of data.transitionTimes ?? []) {
      map.set(t.to, t.medianHours);
    }
    return map;
  }, [data.transitionTimes]);

  return (
    <div className={styles.canvas}>
      {/* Health strip */}
      <div className={styles.healthGrid}>
        <div className={styles.healthCard}>
          <div className={styles.healthLabel}>Mapped events</div>
          <div className={styles.healthValue} style={{ color: "#166534" }}>{formatCompact(mapped)}</div>
          <div className={styles.healthSub}>
            {totalEvents > 0 ? formatRate(mapped / totalEvents) : "n/a"} of volume
          </div>
        </div>
        <div className={styles.healthCard}>
          <div className={styles.healthLabel}>Unmapped events</div>
          <div className={styles.healthValue} style={{ color: "#DC2626" }}>{formatCompact(unmapped)}</div>
          <div className={styles.healthSub}>no milestone or sub-stage</div>
        </div>
        <div className={styles.healthCard}>
          <div className={styles.healthLabel}>Live milestones</div>
          <div className={styles.healthValue}>{liveMs}/10</div>
          <div className={styles.healthSub}>firing in this window</div>
        </div>
        <div className={styles.healthCard}>
          <div className={styles.healthLabel}>$pageleave</div>
          <div className={styles.healthValue} style={{ color: "#737373" }}>off</div>
          <div className={styles.healthSub}>drop-off sub-stages empty</div>
        </div>
      </div>

      {/* Milestone diagnostics panel */}
      <div className={styles.diagPanel}>
        <div className={styles.diagHeader}>
          <div>
            <div className={styles.panelTitle}>Milestone diagnostics</div>
            <div className={styles.panelSub}>
              Per-stage conversion, time-to-convert, and live friction. Click a stage for sub-stages.
            </div>
          </div>
          <div className={styles.diagControls}>
            <select
              className={styles.actSelect}
              value={actKey}
              onChange={(e) => onActKeyChange(e.target.value as ActivationJourneyMilestoneKey)}
            >
              {MILESTONE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <div className={styles.seg}>
              {(["funnel", "flow"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={bViz === m ? styles.segActive : undefined}
                  onClick={() => onBViz(m)}
                >
                  {m === "funnel" ? "Funnel" : "Flow"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {bViz === "funnel" ? (
          <div className={styles.diagRows}>
            {data.milestones.map((ms, i) => {
              // Use the data layer's PER-FUNNEL conversion (null at each funnel's first
              // milestone) so we never divide signup by paid across the funnel boundary.
              const conv = ms.conversionFromPrevious === null ? null : ms.conversionFromPrevious / 100;
              const isGoal = ms.key === actKey;
              const isExpanded = expanded === ms.key;
              const frictionData = data.friction?.find((f) => f.milestoneKey === ms.key);
              const t2c = t2cByTo.get(ms.key);

              return (
                <div key={ms.key} className={styles.diagRow}>
                  <div
                    className={styles.diagRowHead}
                    style={{ background: isGoal ? "#FEF7F5" : undefined }}
                    onClick={() => onExpand(ms.key)}
                  >
                    <span className={styles.diagIndex}>{i + 1}</span>
                    <div className={styles.diagInfo}>
                      <div
                        className={styles.diagLabel}
                        style={{ color: isGoal ? "#B83B17" : undefined }}
                      >
                        {ms.label}
                      </div>
                      <div className={styles.diagEv}>{milestoneEventName(ms.key)}</div>
                    </div>
                    <div className={styles.diagBar}>
                      <div className={styles.diagBarTrack}>
                        <div
                          className={styles.diagBarFill}
                          style={{
                            width: `${Math.max(1, (ms.actors / Math.max(1, firstMsActors)) * 100)}%`,
                            background: MILESTONE_COLORS[ms.key],
                          }}
                        />
                      </div>
                      <span className={styles.diagActors}>{formatCompact(ms.actors)}</span>
                    </div>
                    <span
                      className={styles.diagConv}
                      style={{
                        color:
                          conv !== null && conv < 0.5
                            ? "#DC2626"
                            : conv === null
                              ? "#737373"
                              : "#166534",
                      }}
                    >
                      {conv === null ? "entry" : formatRate(conv)}
                    </span>
                    <span className={styles.diagT2c}>{t2c !== undefined ? formatHours(t2c) : "—"}</span>
                    <div className={styles.diagFriction}>
                      {frictionData && frictionData.rageClicks > 0 && (
                        <span className={styles.frictionTagRage}>{frictionData.rageClicks} rage</span>
                      )}
                      {frictionData && frictionData.deadClicks > 0 && (
                        <span className={styles.frictionTagDead}>{frictionData.deadClicks} dead</span>
                      )}
                    </div>
                    <span
                      className={styles.diagChevron}
                      style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
                    >
                      &#9662;
                    </span>
                  </div>
                  {isExpanded && ms.subStages.length > 0 && (
                    <div className={styles.diagSubs}>
                      {ms.subStages.map((sub) => (
                        <div key={sub.key} className={styles.diagSubRow}>
                          <span
                            className={styles.diagSubDot}
                            style={{ background: sub.eventCount > 0 ? "#16a34a" : "#cbd1da" }}
                          />
                          <span
                            className={styles.diagSubLabel}
                            style={{ color: sub.eventCount === 0 ? "#737373" : undefined }}
                          >
                            {sub.label}
                          </span>
                          <span className={styles.diagSubKind}>{sub.kind.replace("_", " ")}</span>
                          <span className={styles.diagSubMetric}>
                            {sub.eventCount > 0
                              ? `${formatCompact(sub.eventCount)} ev · ${formatCompact(sub.actors)} actors`
                              : "no events yet"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Flow mode — reuses the Sankey chart */
          <div
            className={styles.sankeyBody}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
            }}
            onMouseLeave={() => setTooltip(null)}
          >
            {data.actorJourneys && (
              <SankeyChart
                actorJourneys={data.actorJourneys}
                showSource={showSource}
                segmentation={seg}
                focusNode={focusNode}
                onFocusChange={onFocusChange}
                onTooltip={setTooltip}
              />
            )}
            {tooltip && (
              <div
                className={styles.sankeyTip}
                style={{ left: mousePos.x + 14, top: mousePos.y + 14 }}
              >
                <div className={styles.tipTitle}>{tooltip.title}</div>
                {tooltip.rows.map((r) => (
                  <div key={r.label} className={styles.tipRow}>
                    <span>{r.label}</span>
                    <span className={styles.tipVal}>{r.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Event taxonomy + Where it leaks */}
      <div className={styles.diagBottom}>
        {/* Event taxonomy table */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>Event taxonomy</div>
            <div className={styles.seg}>
              {(["all", "mapped", "unmapped"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={taxFilter === f ? styles.segActive : undefined}
                  onClick={() => onTaxFilter(f)}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.taxScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Mapping</th>
                  <th style={{ textAlign: "right" }}>Events</th>
                  <th style={{ textAlign: "right" }}>Actors</th>
                </tr>
              </thead>
              <tbody>
                {taxRows.map((row) => {
                  const isMilestone = Boolean(row.mappedMilestone);
                  const isSub = row.mappedSubStages.length > 0;
                  let mapLabel: string;
                  let mapClass: string;
                  if (isMilestone) {
                    mapLabel = row.mappedMilestone!.replace(/_/g, " ");
                    mapClass = styles.taxMapMs;
                  } else if (isSub) {
                    mapLabel = row.mappedSubStages[0].replace(/_/g, " ");
                    mapClass = styles.taxMapSub;
                  } else {
                    mapLabel = "Unmapped";
                    mapClass = styles.taxMapNone;
                  }
                  return (
                    <tr key={row.event}>
                      <td className={styles.eventName}>{row.event}</td>
                      <td>
                        <span className={mapClass}>{mapLabel}</span>
                      </td>
                      <td style={{ textAlign: "right" }} className={styles.mono}>
                        {formatNumber(row.count)}
                      </td>
                      <td style={{ textAlign: "right", color: "#737373" }} className={styles.mono}>
                        {formatNumber(row.actors)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Where it leaks */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>Where it leaks</div>
          </div>
          <div className={styles.leakBody}>
            {dropRank.map((d) => (
              <div key={`${d.from}-${d.to}`} className={styles.leakRow}>
                <div className={styles.leakTop}>
                  <span className={styles.leakLabel}>{d.from} &rarr; {d.to}</span>
                  <span className={styles.leakLost}>{formatCompact(d.lost)}</span>
                </div>
                <div className={styles.leakBar}>
                  <div
                    className={styles.leakFill}
                    style={{ width: `${(d.lost / maxLost) * 100}%` }}
                  />
                </div>
                <div className={styles.leakPct}>{formatRate(d.pct)} drop-off</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

const EVENT_NAMES: Record<ActivationJourneyMilestoneKey, string> = {
  site_visited: "marketing_site_visited",
  kanban_submitted: "$autocapture (submit on /create-free-kanban-cards)",
  cta_clicked: "marketing_cta_clicked",
  demo: "marketing_demo_requested",
  trial: "trial_started (awaiting product-app instrumentation)",
  paid: "subscription_paid (awaiting product-app instrumentation)",
  signup: "user_signed_up",
  tour_started: "onboarding_tour_started",
  video_completed: "walkthrough_video_completed",
  item_created: "item_created",
  card_printed: "card_printed",
  queue_added: "card_added_to_order_queue",
  order_placed: "order_placed",
  activation_completed: "cards_received",
};

function milestoneEventName(key: ActivationJourneyMilestoneKey): string {
  return EVENT_NAMES[key] ?? key;
}
