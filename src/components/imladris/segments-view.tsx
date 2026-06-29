"use client";

import { useMemo } from "react";
import type {
  ActivationJourneyDashboardPayload,
  ActivationJourneyMilestoneKey,
  ActorJourneySummary,
  AcquisitionSourceKey,
  ActorCohortKey,
} from "@/lib/imladris/activation-journey";
import {
  formatCompact,
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

const MILESTONE_KEYS: ActivationJourneyMilestoneKey[] = MILESTONE_OPTIONS.map((o) => o.value);

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

const SHORT_LABELS: Record<ActivationJourneyMilestoneKey, string> = {
  site_visited: "Site",
  kanban_submitted: "Kanban",
  cta_clicked: "CTA",
  demo: "Demo",
  trial: "Trial",
  paid: "Paid",
  signup: "Signup",
  tour_started: "Tour",
  video_completed: "Video",
  item_created: "Item",
  card_printed: "Card",
  queue_added: "Queue",
  order_placed: "Order",
  activation_completed: "Active",
};

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

const SOURCE_DEFS: Array<{ key: AcquisitionSourceKey; label: string; color: string }> = [
  { key: "direct", label: "Direct", color: "#5b6b7f" },
  { key: "google_organic", label: "Google organic", color: "#2f8f5b" },
  { key: "google_ads", label: "Google Ads", color: "#d08a1e" },
  { key: "facebook", label: "Facebook", color: "#1877F2" },
  { key: "instagram", label: "Instagram", color: "#E4405F" },
  { key: "linkedin", label: "LinkedIn", color: "#2f86c9" },
  { key: "referral", label: "Referral", color: "#1aa39a" },
  { key: "email", label: "Email", color: "#8a6d3b" },
];

const COHORT_DEFS: Array<{ key: ActorCohortKey; label: string; color: string }> = [
  { key: "tour_completed", label: "Tour completed", color: "#2f8f5b" },
  { key: "started_not_completed", label: "Started, not completed", color: "#d08a1e" },
  { key: "no_tour", label: "No tour observed", color: "#9aa1ac" },
];

type SegDimension = "source" | "cohort";

interface SegmentsViewProps {
  data: ActivationJourneyDashboardPayload;
  actKey: ActivationJourneyMilestoneKey;
  activationLabel: string;
  segDim: SegDimension;
  selActor: number | null;
  onActKeyChange: (key: ActivationJourneyMilestoneKey) => void;
  onSegDim: (dim: SegDimension) => void;
  onSelActor: (index: number | null) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────

interface SegmentRow {
  key: string;
  label: string;
  color: string;
  n: number;
  stages: Array<{ key: ActivationJourneyMilestoneKey; count: number; pct: number }>;
  actRate: number | null;
  medianHours: number | null;
}

function buildSegmentRows(
  actorJourneys: ActorJourneySummary[],
  dim: SegDimension,
  actKey: ActivationJourneyMilestoneKey,
): SegmentRow[] {
  const groups =
    dim === "source"
      ? SOURCE_DEFS.map((s) => ({
          key: s.key,
          label: s.label,
          color: s.color,
          test: (a: ActorJourneySummary) => a.source === s.key,
        }))
      : COHORT_DEFS.map((c) => ({
          key: c.key,
          label: c.label,
          color: c.color,
          test: (a: ActorJourneySummary) => a.cohort === c.key,
        }));

  return groups.map((g) => {
    const sub = actorJourneys.filter(g.test);
    const n = sub.length;
    const stages = MILESTONE_KEYS.map((k) => {
      const count = sub.filter((a) => a.milestones.includes(k)).length;
      return { key: k, count, pct: n > 0 ? count / n : 0 };
    });
    const actStage = stages.find((s) => s.key === actKey);
    const actRate = actStage && n > 0 ? actStage.count / n : null;

    // Median hours — not available from actor summaries (they don't carry timestamps),
    // so we use null here. The transition times panel handles this.
    return {
      key: g.key,
      label: g.label,
      color: g.color,
      n,
      stages,
      actRate,
      medianHours: null,
    };
  });
}

// ── Component ───────────────────────────────────────────────────────────

export function SegmentsView({
  data,
  actKey,
  activationLabel,
  segDim,
  selActor,
  onActKeyChange,
  onSegDim,
  onSelActor,
}: SegmentsViewProps) {
  const segRows = useMemo(() => {
    if (!data.actorJourneys) return [];
    return buildSegmentRows(data.actorJourneys, segDim, actKey);
  }, [data.actorJourneys, segDim, actKey]);

  const maxN = Math.max(1, ...segRows.map((r) => r.n));

  // Transition times
  const t2cRows = data.transitionTimes ?? [];
  const maxT2c = Math.max(1, ...t2cRows.map((t) => t.medianHours ?? 0));

  // Actor samples
  const samples = data.actorSamples ?? [];

  return (
    <div className={styles.segLayout}>
      {/* Filter rail */}
      <div className={styles.filterRail}>
        <div>
          <div className={styles.filterLabel}>Compare by</div>
          <div className={styles.filterButtons}>
            {(["source", "cohort"] as const).map((d) => (
              <button
                key={d}
                type="button"
                className={segDim === d ? styles.filterBtnActive : styles.filterBtn}
                onClick={() => onSegDim(d)}
              >
                {d === "source" ? "Acquisition source" : "Cohort"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className={styles.filterLabel}>Activated when reaching</div>
          <select
            className={styles.filterSelect}
            value={actKey}
            onChange={(e) => onActKeyChange(e.target.value as ActivationJourneyMilestoneKey)}
          >
            {MILESTONE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterHelp}>
          Mini-funnel bars show stage reach rate per segment. Source from PostHog initial UTM / referrer.
        </div>
      </div>

      {/* Main content */}
      <div className={styles.segMain}>
        {/* Segment comparison table */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              Activation by {segDim === "source" ? "acquisition source" : "cohort"}
            </div>
            <div className={styles.panelSub}>
              rate at &ldquo;{activationLabel}&rdquo;
            </div>
          </div>
          <div className={styles.segTableWrap}>
            {/* Header */}
            <div className={styles.segTableHead}>
              <span>Segment</span>
              <span>Actors</span>
              <span>Tour &rarr; Active</span>
              <span style={{ textAlign: "right" }}>Rate</span>
              <span style={{ textAlign: "right" }}>Median</span>
            </div>
            {/* Rows */}
            {segRows.map((row) => (
              <div key={row.key} className={styles.segTableRow}>
                <span className={styles.segName}>
                  <span className={styles.segDot} style={{ background: row.color }} />
                  <span className={styles.segNameText}>{row.label}</span>
                </span>
                <div className={styles.segActors}>
                  <div className={styles.segActorBar}>
                    <div
                      className={styles.segActorFill}
                      style={{ width: `${(row.n / maxN) * 100}%` }}
                    />
                  </div>
                  <span className={styles.mono}>{formatCompact(row.n)}</span>
                </div>
                <div className={styles.segMiniFunnel}>
                  {row.stages.map((s) => (
                    <div
                      key={s.key}
                      className={styles.segMiniBar}
                      style={{
                        height: `${Math.max(2, s.pct * 28)}px`,
                        background: MILESTONE_COLORS[s.key],
                      }}
                      title={`${SHORT_LABELS[s.key]}: ${formatRate(s.pct)}`}
                    />
                  ))}
                </div>
                <span className={styles.segRate}>{formatRate(row.actRate)}</span>
                <span className={styles.segMedian}>{formatHours(row.medianHours)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Time-to-convert + Actor journeys */}
        <div className={styles.segBottom}>
          {/* Time to convert */}
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div className={styles.panelTitle}>Time to convert</div>
            </div>
            <div className={styles.t2cBody}>
              {t2cRows.map((t) => (
                <div key={`${t.from}-${t.to}`} className={styles.t2cRow}>
                  <div className={styles.t2cTop}>
                    <span className={styles.t2cLabel}>
                      {LONG_LABELS[t.from] ?? t.from} &rarr; {LONG_LABELS[t.to] ?? t.to}
                    </span>
                    <span className={styles.t2cVal}>{formatHours(t.medianHours)}</span>
                  </div>
                  <div className={styles.t2cBar}>
                    <div
                      className={styles.t2cFill}
                      style={{ width: `${Math.max(1, ((t.medianHours ?? 0) / maxT2c) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actor journeys */}
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>Actor journeys</span>
              <span className={styles.panelTag}>sample</span>
            </div>
            <div className={styles.actorList}>
              {samples.map((actor, i) => {
                const isSelected = selActor === i;
                const sourceDef = SOURCE_DEFS.find((s) => s.key === actor.source);
                const actorLinks = [
                  { label: "Replay", href: actor.sessionReplayUrl },
                  { label: "Identity", href: actor.identityUrl },
                  { label: "Analytics", href: actor.analyticsUrl },
                ].filter((link): link is { label: string; href: string } => Boolean(link.href));
                return (
                  <div
                    key={actor.actorId}
                    className={styles.actorCard}
                    style={{
                      background: isSelected ? "#FEF7F5" : undefined,
                      borderColor: isSelected ? "#FD9C80" : undefined,
                    }}
                    onClick={() => onSelActor(i)}
                  >
                    <div className={styles.actorTop}>
                      <span className={styles.actorId}>{actor.actorId.slice(0, 8)}</span>
                      <span className={styles.actorSource}>
                        <span
                          className={styles.actorSrcDot}
                          style={{ background: sourceDef?.color ?? "#888" }}
                        />
                        {sourceDef?.label ?? actor.source}
                      </span>
                      <span className={styles.actorFurthest}>
                        &rarr; {actor.furthestMilestone ? LONG_LABELS[actor.furthestMilestone] ?? actor.furthestMilestone : "No milestone"}
                      </span>
                    </div>
                    <div className={styles.actorChips}>
                      {actor.milestones.map((mk) => (
                        <span
                          key={mk}
                          className={styles.actorChip}
                          style={{ background: MILESTONE_COLORS[mk] }}
                        >
                          {SHORT_LABELS[mk]}
                        </span>
                      ))}
                    </div>
                    {actorLinks.length > 0 ? (
                      <div className={styles.actorActions}>
                        {actorLinks.map((link) => (
                          <a
                            key={link.label}
                            className={styles.actorAction}
                            href={link.href}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {link.label}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
