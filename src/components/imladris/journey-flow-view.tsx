"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import type {
  ActivationJourneyDashboardPayload,
  ActivationJourneyMilestoneKey,
} from "@/lib/imladris/activation-journey";
import { SankeyChart, type SankeyTooltip } from "./sankey-chart";
import {
  formatCompact,
  formatDateTime,
  formatHours,
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

const SEG_OPTIONS: Array<{ id: Segmentation; label: string }> = [
  { id: "flow", label: "Flow" },
  { id: "cohort", label: "Cohort" },
  { id: "source", label: "Source" },
  { id: "furthest", label: "Furthest" },
];

type Segmentation = "flow" | "cohort" | "source" | "furthest";

interface JourneyFlowViewProps {
  data: ActivationJourneyDashboardPayload;
  actKey: ActivationJourneyMilestoneKey;
  activationLabel: string;
  seg: Segmentation;
  showSource: boolean;
  focusNode: string | null;
  onActKeyChange: (key: ActivationJourneyMilestoneKey) => void;
  onSegChange: (seg: Segmentation) => void;
  onToggleSource: () => void;
  onFocusChange: (nodeId: string | null) => void;
}

// ── Sankey legend ───────────────────────────────────────────────────────

const SOURCE_COLORS = [
  { label: "Direct", color: "#5b6b7f" },
  { label: "Google organic", color: "#2f8f5b" },
  { label: "Google Ads", color: "#d08a1e" },
  { label: "Facebook", color: "#1877F2" },
  { label: "Instagram", color: "#E4405F" },
  { label: "LinkedIn", color: "#2f86c9" },
  { label: "Referral", color: "#1aa39a" },
  { label: "Email", color: "#8a6d3b" },
];

const COHORT_COLORS = [
  { label: "Tour completed", color: "#2f8f5b" },
  { label: "Started, not completed", color: "#d08a1e" },
  { label: "No tour observed", color: "#9aa1ac" },
];

function legendFor(seg: Segmentation): Array<{ label: string; color: string }> {
  switch (seg) {
    case "flow":
      return [
        { label: "Advancing", color: "#8aa0b8" },
        { label: "Drop-off", color: "#DC2626" },
      ];
    case "cohort":
      return [...COHORT_COLORS, { label: "Drop-off", color: "#DC2626" }];
    case "source":
      return [...SOURCE_COLORS, { label: "Drop-off", color: "#DC2626" }];
    case "furthest":
      return [
        ...MILESTONE_OPTIONS.map((m) => ({ label: m.label, color: MILESTONE_COLORS[m.value] })),
        { label: "Drop-off", color: "#DC2626" },
      ];
  }
}

// ── Component ───────────────────────────────────────────────────────────

export function JourneyFlowView({
  data,
  actKey,
  activationLabel,
  seg,
  showSource,
  focusNode,
  onActKeyChange,
  onSegChange,
  onToggleSource,
  onFocusChange,
}: JourneyFlowViewProps) {
  const [tooltip, setTooltip] = useState<SankeyTooltip | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Compute KPIs based on selected activation milestone
  const kpis = useMemo(() => {
    const ms = data.milestones.find((m) => m.key === actKey);
    const activated = ms?.actors ?? 0;
    const rate = data.summary.identifiedActors > 0 ? activated / data.summary.identifiedActors : null;
    return {
      totalEvents: data.summary.totalEvents,
      identifiedActors: data.summary.identifiedActors,
      rate,
      activated,
      medianHours: ms?.medianHoursFromFirstEvent ?? null,
    };
  }, [data, actKey]);

  // Sequential funnel rows — split into the two funnels. Conversion and bar scaling
  // are computed WITHIN each funnel (the marketing→activation hop is the bridge, not
  // a step), so each funnel reads as its own funnel starting at 100%.
  const funnelRows = useMemo(() => {
    if (!data.sequentialFunnel) return [];
    const funnelByKey = new Map(data.milestones.map((m) => [m.key, m.funnel]));
    const funnelFirsts = new Map<string, { seq: number; any: number }>();
    for (const entry of data.sequentialFunnel) {
      const funnel = funnelByKey.get(entry.milestoneKey) ?? "activation";
      if (!funnelFirsts.has(funnel)) {
        funnelFirsts.set(funnel, {
          seq: entry.sequentialActors || 1,
          any: entry.anyOrderActors || 1,
        });
      }
    }
    return data.sequentialFunnel.map((entry, i) => {
      const funnel = funnelByKey.get(entry.milestoneKey) ?? "activation";
      const prev = i === 0 ? null : data.sequentialFunnel[i - 1];
      const prevFunnel = prev ? funnelByKey.get(prev.milestoneKey) : null;
      const isFunnelStart = !prev || prevFunnel !== funnel;
      const conv =
        isFunnelStart || !prev
          ? null
          : prev.sequentialActors > 0
            ? entry.sequentialActors / prev.sequentialActors
            : 0;
      const first = funnelFirsts.get(funnel) ?? { seq: 1, any: 1 };
      const skip = entry.anyOrderActors - entry.sequentialActors;
      const pctOfStart = first.seq > 0 ? entry.sequentialActors / first.seq : 0;
      const ghostPct = first.any > 0 ? entry.anyOrderActors / first.any : 0;
      const isGoal = entry.milestoneKey === actKey;
      return {
        ...entry,
        funnel,
        isFunnelStart,
        conv,
        skip,
        pctOfStart,
        ghostPct,
        isGoal,
        barColor: isGoal ? "#FC5A29" : MILESTONE_COLORS[entry.milestoneKey],
      };
    });
  }, [data.sequentialFunnel, data.milestones, actKey]);

  // Friction rows
  const frictionRows = useMemo(() => {
    if (!data.friction) return [];
    return data.friction;
  }, [data.friction]);

  const legend = legendFor(seg);
  const traceName = focusNode ? nodeName(focusNode) : null;

  return (
    <div className={styles.canvas}>
      {/* KPI strip */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>PostHog events</span>
          <span className={styles.kpiValue}>{formatCompact(kpis.totalEvents)}</span>
          <span className={styles.kpiSub}>Last seen {formatDateTime(data.summary.lastEventAt)}</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Identified actors</span>
          <span className={styles.kpiValue}>{formatCompact(kpis.identifiedActors)}</span>
          <span className={styles.kpiSub}>
            {formatCompact(data.source.subStageMappedEvents)} sub-stage · {formatCompact(data.source.unmappedEvents)} unmapped
          </span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Activation rate</span>
          <span className={`${styles.kpiValue} ${styles.kpiAccent}`}>{formatRate(kpis.rate)}</span>
          <span className={styles.kpiSub}>at &ldquo;{activationLabel}&rdquo;</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Activated actors</span>
          <span className={styles.kpiValue}>{formatCompact(kpis.activated)}</span>
          <span className={styles.kpiSub}>reached {activationLabel.toLowerCase()}</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Median time</span>
          <span className={styles.kpiValue}>{formatHours(kpis.medianHours)}</span>
          <span className={styles.kpiSub}>first event &rarr; {activationLabel.toLowerCase()}</span>
        </div>
      </div>

      {/* Activation definition bar */}
      <div className={styles.actBar}>
        <span className={styles.actBarLabel}>Count an actor as activated when they reach</span>
        <select
          className={styles.actSelect}
          value={actKey}
          onChange={(e) => onActKeyChange(e.target.value as ActivationJourneyMilestoneKey)}
        >
          {MILESTONE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className={styles.topbarSpacer} />
        <span className={styles.actBarMeta}>
          Source: PostHog <span className={styles.mono}>distinct_id</span> · {data.window.days}d window
        </span>
      </div>

      {/* Observation chips */}
      {data.observations.length > 0 && (
        <div className={styles.obsGrid}>
          {data.observations.map((obs) => (
            <div className={styles.obsCard} key={`${obs.severity}-${obs.title}`}>
              <div className={styles.obsTitle}>
                <span className={obs.severity === "info" ? styles.obsIconInfo : styles.obsIconWarn}>
                  {obs.severity === "info" ? <Info size={14} /> : <AlertTriangle size={14} />}
                </span>
                <span>{obs.title}</span>
                <span
                  className={`${styles.obsBadge} ${obs.severity === "info" ? styles.obsBadgeInfo : styles.obsBadgeWarn}`}
                >
                  {obs.severity}
                </span>
              </div>
              <p className={styles.obsDetail}>{obs.detail}</p>
            </div>
          ))}
        </div>
      )}

      {/* Sankey chart */}
      <div className={styles.sankeyPanel}>
        <div className={styles.sankeyHeader}>
          <div>
            <div className={styles.sankeyTitle}>Acquisition &rarr; activation flow</div>
            <div className={styles.sankeySub}>
              Bands are actors. Ribbons that leap a column skipped that milestone. Red exits are drop-off.
            </div>
          </div>
          <div className={styles.sankeyControls}>
            <button
              type="button"
              className={showSource ? styles.sourceToggleOn : styles.sourceToggleOff}
              onClick={onToggleSource}
            >
              Acquisition source
            </button>
            <div className={styles.seg}>
              {SEG_OPTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={seg === s.id ? styles.segActive : undefined}
                  onClick={() => onSegChange(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div
          className={styles.sankeyBody}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          }}
          onMouseLeave={() => setTooltip(null)}
        >
          {traceName && (
            <button
              type="button"
              className={styles.tracePill}
              onClick={() => onFocusChange(null)}
            >
              Tracing: {traceName} <span className={styles.traceX}>&times;</span>
            </button>
          )}
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
          {/* Legend */}
          <div className={styles.sankeyLegend}>
            {legend.map((l) => (
              <span key={l.label} className={styles.legendItem}>
                <span className={styles.legendSwatch} style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
          {/* Tooltip */}
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
      </div>

      {/* Sequential funnel + Friction (2-column grid) */}
      <div className={styles.flowBottom}>
        {/* Sequential funnel */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <div className={styles.panelTitle}>Sequential funnel</div>
              <div className={styles.panelSub}>
                Two funnels, strict order within each. Ghost bar = out-of-order reach.
              </div>
            </div>
          </div>
          <div className={styles.funnelBody}>
            {funnelRows.map((row) => (
              <div key={row.milestoneKey}>
                {row.isFunnelStart && (
                  <>
                    {/* Non-linear bridge between the two funnels (renders above the activation funnel). */}
                    {row.funnel === "activation" && (
                      <div
                        style={{
                          margin: "10px 0",
                          padding: "8px 10px",
                          borderRadius: "8px",
                          border: "1px dashed #c7cdd6",
                          background: "#f8fafc",
                          fontSize: "11px",
                          color: "#475569",
                        }}
                      >
                        <div style={{ fontWeight: 700, color: "#334155", marginBottom: "2px" }}>
                          &#8618; Bridge · trial &cup; paid &rarr; signup
                        </div>
                        {data.bridge.commercialActors > 0 ? (
                          <div>
                            {formatCompact(data.bridge.signedUpActors)} of{" "}
                            {formatCompact(data.bridge.commercialActors)} trial/paid actors signed up
                            {data.bridge.conversionRate !== null
                              ? ` (${data.bridge.conversionRate}%)`
                              : ""}{" "}
                            · {data.bridge.signupAttribution.postPaid} post-paid ·{" "}
                            {data.bridge.signupAttribution.postTrial} post-trial ·{" "}
                            {data.bridge.signupAttribution.direct} direct
                          </div>
                        ) : (
                          <div>
                            No trial/paid events yet — <span className={styles.mono}>trial_started</span>{" "}
                            &amp; <span className={styles.mono}>subscription_paid</span> await product-app
                            instrumentation. All {formatCompact(data.bridge.signupAttribution.total)}{" "}
                            signups currently attributed as direct.
                          </div>
                        )}
                      </div>
                    )}
                    <div
                      style={{
                        marginTop: row.funnel === "marketing" ? 0 : "6px",
                        marginBottom: "6px",
                        paddingBottom: "4px",
                        borderBottom: "1px solid #e5e7eb",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        fontSize: "11px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: "#374151",
                      }}
                    >
                      <span>
                        {row.funnel === "marketing"
                          ? "Marketing website funnel"
                          : "Activation funnel"}
                      </span>
                      <span
                        style={{
                          fontWeight: 500,
                          textTransform: "none",
                          letterSpacing: 0,
                          color: "#9ca3af",
                        }}
                      >
                        {row.funnel === "marketing"
                          ? "www.arda.cards · ends at paid"
                          : "live.app.arda.cards · begins at signup"}
                      </span>
                    </div>
                  </>
                )}
                <div className={styles.funnelRowTop}>
                  <span
                    className={styles.funnelLabel}
                    style={{ color: row.isGoal ? "#B83B17" : undefined }}
                  >
                    {row.label}
                  </span>
                  <span className={styles.funnelCount}>
                    {formatCompact(row.sequentialActors)}{" "}
                    <span className={styles.funnelPct}>· {formatRate(row.pctOfStart)}</span>
                  </span>
                </div>
                <div className={styles.funnelBarRow}>
                  <div className={styles.funnelTrack}>
                    {/* Ghost bar (any-order reach, scaled within this funnel) */}
                    <div
                      className={styles.funnelGhost}
                      style={{ width: `${Math.max(0.5, row.ghostPct * 100)}%` }}
                    />
                    {/* Solid bar (sequential reach, scaled within this funnel) */}
                    <div
                      className={styles.funnelFill}
                      style={{
                        width: `${Math.max(0.5, row.pctOfStart * 100)}%`,
                        background: row.barColor,
                      }}
                    />
                  </div>
                  <span
                    className={styles.funnelNote}
                    style={{ color: row.conv !== null && row.conv < 0.5 ? "#DC2626" : undefined }}
                  >
                    {row.isFunnelStart
                      ? `${formatCompact(row.anyOrderActors)} total`
                      : `${formatRate(row.conv)}${row.skip > 0 ? ` · +${formatCompact(row.skip)} skip` : ""}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Friction by stage */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>Friction by stage</div>
            <span className={`${styles.badge} ${styles.badgeWarning}`}>live signal</span>
          </div>
          <div className={styles.frictionBody}>
            {frictionRows.map((row) => (
              <div
                key={row.milestoneKey}
                className={styles.frictionRow}
                style={{ background: row.rageClicks > 30 ? "#FFFAF2" : undefined }}
              >
                <span className={styles.frictionLabel}>{row.label}</span>
                <div className={styles.frictionTags}>
                  {row.rageClicks > 0 && (
                    <span className={styles.frictionTagRage}>{row.rageClicks} rage</span>
                  )}
                  {row.deadClicks > 0 && (
                    <span className={styles.frictionTagDead}>{row.deadClicks} dead</span>
                  )}
                  <span className={styles.frictionTagOff}>pageleave off</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

const LONG_LABELS: Record<string, string> = {
  site_visited: "Site visited",
  kanban_submitted: "Free kanban submitted",
  cta_clicked: "CTA clicked",
  demo: "Demo booked",
  trial: "Trial started",
  paid: "Became paid",
  signup: "Signed up",
  tour_started: "Tour started",
  video_completed: "Video completed",
  item_created: "Item created",
  card_printed: "Card printed",
  queue_added: "Added to order queue",
  order_placed: "Order placed",
  activation_completed: "Activation completed",
};

const SOURCE_LABELS: Record<string, string> = {
  direct: "Direct",
  google_organic: "Google organic",
  google_ads: "Google Ads",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  referral: "Referral",
  email: "Email",
};

function nodeName(id: string): string {
  if (id.startsWith("src:")) return SOURCE_LABELS[id.slice(4)] ?? id;
  if (id === "drop:no_tour") return "Never started tour";
  if (id.startsWith("drop:")) return "Dropped after " + (LONG_LABELS[id.slice(5)] ?? id.slice(5));
  if (id.startsWith("m:")) return LONG_LABELS[id.slice(2)] ?? id.slice(2);
  return id;
}
