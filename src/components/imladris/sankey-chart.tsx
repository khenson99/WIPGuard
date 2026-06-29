"use client";

import { useMemo, useCallback } from "react";
import type {
  ActorJourneySummary,
  ActivationJourneyMilestoneKey,
  AcquisitionSourceKey,
  ActorCohortKey,
} from "@/lib/imladris/activation-journey";

// ── Public types ────────────────────────────────────────────────────────

export interface SankeyTooltip {
  title: string;
  rows: Array<{ label: string; value: string }>;
}

export interface SankeyChartProps {
  actorJourneys: ActorJourneySummary[];
  showSource: boolean;
  segmentation: "flow" | "cohort" | "source" | "furthest";
  focusNode: string | null;
  onFocusChange: (nodeId: string | null) => void;
  onTooltip: (tip: SankeyTooltip | null) => void;
}

// ── Constants ───────────────────────────────────────────────────────────

const MILESTONE_ORDER: ActivationJourneyMilestoneKey[] = [
  // Marketing website funnel (ends at paid)
  "site_visited",
  "kanban_submitted",
  "cta_clicked",
  "demo",
  "trial",
  "paid",
  // Activation funnel (begins at signup)
  "signup",
  "tour_started",
  "video_completed",
  "item_created",
  "card_printed",
  "queue_added",
  "order_placed",
  "activation_completed",
];

const MILESTONE_SHORT_LABELS: Record<ActivationJourneyMilestoneKey, string> = {
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
  activation_completed: "Activated",
};

const MILESTONE_LONG_LABELS: Record<ActivationJourneyMilestoneKey, string> = {
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

const SOURCE_LABELS: Record<AcquisitionSourceKey, string> = {
  direct: "Direct",
  google_organic: "Google organic",
  google_ads: "Google Ads",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  referral: "Referral",
  email: "Email",
};

// Derived from MILESTONE_ORDER so the columns can never drift out of sync.
const COLUMN_HEADERS = ["Source", ...MILESTONE_ORDER.map((key) => MILESTONE_SHORT_LABELS[key])];

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

const SOURCE_COLORS: Record<AcquisitionSourceKey, string> = {
  direct: "#5b6b7f",
  google_organic: "#2f8f5b",
  google_ads: "#d08a1e",
  facebook: "#1877F2",
  instagram: "#E4405F",
  linkedin: "#2f86c9",
  referral: "#1aa39a",
  email: "#8a6d3b",
};

const COHORT_COLORS: Record<ActorCohortKey, string> = {
  tour_completed: "#2f8f5b",
  started_not_completed: "#d08a1e",
  no_tour: "#9aa1ac",
};

const DROP_COLOR = "#DC2626";

// ── Helpers ─────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return (k >= 100 ? Math.round(k) : Math.round(k * 10) / 10) + "k";
  }
  return "" + n;
}

// ── Internal model ──────────────────────────────────────────────────────

interface SankeyNode {
  id: string;
  column: number;
  label: string;
  longLabel: string;
  color: string;
  isDrop: boolean;
  count: number;
  // layout
  x: number;
  y: number;
  height: number;
}

interface SankeyLink {
  sourceId: string;
  targetId: string;
  segment: string;
  count: number;
  isDrop: boolean;
  // layout
  sy0: number;
  sy1: number;
  ty0: number;
  ty1: number;
  sx: number;
  tx: number;
}

type Segmentation = SankeyChartProps["segmentation"];

// ── Build graph ─────────────────────────────────────────────────────────

function getSegmentKey(
  segmentation: Segmentation,
  actor: ActorJourneySummary,
  isDrop: boolean,
): string {
  switch (segmentation) {
    case "flow":
      return isDrop ? "drop" : "adv";
    case "cohort":
      return "co:" + actor.cohort;
    case "source":
      return actor.source;
    case "furthest":
      return "fu:" + (actor.furthest ?? "none");
  }
}

function segmentColor(segment: string, segmentation: Segmentation): string {
  switch (segmentation) {
    case "flow":
      return segment === "drop" ? DROP_COLOR : "#8aa0b8";
    case "cohort": {
      const cohortKey = segment.slice(3) as ActorCohortKey;
      return COHORT_COLORS[cohortKey] ?? "#9aa1ac";
    }
    case "source":
      return SOURCE_COLORS[segment as AcquisitionSourceKey] ?? "#5b6b7f";
    case "furthest": {
      const furthestKey = segment.slice(3);
      if (furthestKey === "none") return "#9aa1ac";
      return MILESTONE_COLORS[furthestKey as ActivationJourneyMilestoneKey] ?? "#9aa6b8";
    }
  }
}

interface BuiltSankey {
  nodes: SankeyNode[];
  links: SankeyLink[];
  viewBoxHeight: number;
}

function buildSankey(
  actorJourneys: ActorJourneySummary[],
  showSource: boolean,
  segmentation: Segmentation,
): BuiltSankey {
  const WIDTH = 1100;
  const viewBoxHeight = showSource ? 440 : 420;
  const NODE_WIDTH = 10;
  const PAD_TOP = 32;
  const PAD_BOTTOM = 16;
  const availableHeight = viewBoxHeight - PAD_TOP - PAD_BOTTOM;

  // ── Determine columns ──────────────────────────────────────────────
  const startCol = showSource ? 0 : 1;
  const totalCols = COLUMN_HEADERS.length - startCol;
  const colX = (col: number): number => {
    const idx = col - startCol;
    const gap = (WIDTH - 80) / (totalCols - 1);
    return 40 + idx * gap;
  };

  // ── Count links ────────────────────────────────────────────────────
  // linkKey: "sourceId|targetId|segment" -> count
  const linkMap = new Map<string, { sourceId: string; targetId: string; segment: string; count: number; isDrop: boolean }>();
  const nodeCountMap = new Map<string, number>();

  function addLink(sourceId: string, targetId: string, segment: string, isDrop: boolean): void {
    const key = `${sourceId}|${targetId}|${segment}`;
    const existing = linkMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      linkMap.set(key, { sourceId, targetId, segment, count: 1, isDrop });
    }
    nodeCountMap.set(sourceId, (nodeCountMap.get(sourceId) ?? 0) + 1);
    nodeCountMap.set(targetId, (nodeCountMap.get(targetId) ?? 0) + 1);
  }

  for (const actor of actorJourneys) {
    const srcId = "src:" + actor.source;
    const reachedMilestones = MILESTONE_ORDER.filter((m) => actor.milestones.includes(m));
    const isDrop = (specific: boolean) => getSegmentKey(segmentation, actor, specific);

    if (reachedMilestones.length === 0) {
      // Actor didn't reach any milestone
      if (showSource) {
        addLink(srcId, "drop:none", isDrop(true), true);
      }
      continue;
    }

    // Build chain: source -> m1 -> m2 -> ... -> drop:furthest
    const chain: string[] = [];
    if (showSource) chain.push(srcId);
    for (const m of reachedMilestones) {
      chain.push("m:" + m);
    }
    // Add drop-off node if not fully activated
    if (!actor.milestones.includes("activation_completed")) {
      const furthest = reachedMilestones[reachedMilestones.length - 1];
      chain.push("drop:" + furthest);
    }

    for (let i = 0; i < chain.length - 1; i++) {
      const isDropLink = chain[i + 1].startsWith("drop:");
      addLink(chain[i], chain[i + 1], getSegmentKey(segmentation, actor, isDropLink), isDropLink);
    }
  }

  // ── Build node set ─────────────────────────────────────────────────
  const ALL_SOURCES: AcquisitionSourceKey[] = ["direct", "google_organic", "google_ads", "facebook", "instagram", "linkedin", "referral", "email"];

  // Determine which nodes actually have traffic
  const nodesById = new Map<string, SankeyNode>();

  // Source nodes (column 0)
  if (showSource) {
    for (const src of ALL_SOURCES) {
      const id = "src:" + src;
      const count = nodeCountMap.get(id) ?? 0;
      if (count > 0) {
        nodesById.set(id, {
          id,
          column: 0,
          label: SOURCE_LABELS[src],
          longLabel: SOURCE_LABELS[src],
          color: SOURCE_COLORS[src],
          isDrop: false,
          count: count / 2, // each actor counted in both source and target, normalize
          x: 0, y: 0, height: 0,
        });
      }
    }
  }

  // Milestone nodes (columns 1-7)
  for (let i = 0; i < MILESTONE_ORDER.length; i++) {
    const key = MILESTONE_ORDER[i];
    const id = "m:" + key;
    // Count = sum of outgoing + incoming (but actually we want actor count entering)
    // Better: count unique actors at this node
    const count = actorJourneys.filter((a) => a.milestones.includes(key)).length;
    if (count > 0) {
      nodesById.set(id, {
        id,
        column: i + 1,
        label: MILESTONE_SHORT_LABELS[key],
        longLabel: MILESTONE_LONG_LABELS[key],
        color: MILESTONE_COLORS[key],
        isDrop: false,
        count,
        x: 0, y: 0, height: 0,
      });
    }
  }

  // Drop-off nodes
  const dropMilestones: Array<{ dropId: string; column: number; afterKey: ActivationJourneyMilestoneKey | null }> = [
    { dropId: "drop:none", column: 1, afterKey: null },
    ...MILESTONE_ORDER.map((key, i) => ({
      dropId: "drop:" + key,
      column: i + 2, // drop at the NEXT column position
      afterKey: key,
    })),
  ];

  // Fix drop column positions: drop:no_tour is in column 1, drop:tour_started in col 2, etc.
  // But drop:tour_started means they stopped AT tour, so the drop is between tour (col 1) and video (col 2)
  // Actually, drop nodes sit in the column AFTER the milestone they stopped at.
  // drop:no_tour -> column 1 (same column as tour, below it)
  // drop:tour_started -> column 2 (same column as video, below it)
  // etc.

  for (const { dropId, column } of dropMilestones) {
    const count = nodeCountMap.get(dropId);
    if (count && count > 0) {
      const afterKey = dropId === "drop:none" ? null : dropId.slice(5) as ActivationJourneyMilestoneKey;
      const label = dropId === "drop:none"
        ? "No milestone"
        : "Dropped at " + (MILESTONE_SHORT_LABELS[afterKey!] ?? afterKey);
      nodesById.set(dropId, {
        id: dropId,
        column: Math.min(column, 10), // clamp
        label: formatCount(count), // drop labels just show count
        longLabel: label,
        color: DROP_COLOR,
        isDrop: true,
        count,
        x: 0, y: 0, height: 0,
      });
    }
  }

  // Recompute node counts properly using link flows
  // For source nodes: count = total outgoing links
  // For milestone/drop nodes: count = total incoming links
  for (const node of nodesById.values()) {
    if (node.id.startsWith("src:")) {
      let total = 0;
      for (const link of linkMap.values()) {
        if (link.sourceId === node.id) total += link.count;
      }
      node.count = total;
    } else {
      let total = 0;
      for (const link of linkMap.values()) {
        if (link.targetId === node.id) total += link.count;
      }
      // For milestone nodes that also act as sources, use the max of in/out
      if (!node.isDrop) {
        let outTotal = 0;
        for (const link of linkMap.values()) {
          if (link.sourceId === node.id) outTotal += link.count;
        }
        total = Math.max(total, outTotal);
      }
      if (total > 0) node.count = total;
    }
  }

  // ── Layout: compute heights ────────────────────────────────────────
  // Group nodes by column
  const columns = new Map<number, SankeyNode[]>();
  for (const node of nodesById.values()) {
    const col = columns.get(node.column) ?? [];
    col.push(node);
    columns.set(node.column, col);
  }

  // Sort within columns: milestone nodes first, then drop nodes
  for (const col of columns.values()) {
    col.sort((a, b) => {
      if (a.isDrop !== b.isDrop) return a.isDrop ? 1 : -1;
      return 0;
    });
  }

  // Find max column total for proportional scaling
  let maxColTotal = 0;
  for (const col of columns.values()) {
    const total = col.reduce((sum, n) => sum + n.count, 0);
    if (total > maxColTotal) maxColTotal = total;
  }
  if (maxColTotal === 0) maxColTotal = 1;

  const NODE_GAP = 8;

  for (const [colIdx, col] of columns.entries()) {
    const colTotal = col.reduce((sum, n) => sum + n.count, 0);
    const totalGap = (col.length - 1) * NODE_GAP;
    const scaleHeight = availableHeight - totalGap;
    const scaleFactor = colTotal > 0 ? scaleHeight / maxColTotal : 0;

    let currentY = PAD_TOP;
    // Center vertically
    const usedHeight = col.reduce((sum, n) => sum + n.count * scaleFactor, 0) + totalGap;
    currentY = PAD_TOP + (availableHeight - usedHeight) / 2;

    for (const node of col) {
      node.x = colX(colIdx);
      node.height = Math.max(3, node.count * scaleFactor);
      node.y = currentY;
      currentY += node.height + NODE_GAP;
    }
  }

  // ── Layout: compute link positions ─────────────────────────────────
  // Track port offsets for each node
  const sourcePortOffset = new Map<string, number>();
  const targetPortOffset = new Map<string, number>();

  const links: SankeyLink[] = [];

  // Sort links for consistent ordering: group by source, then by target column
  const sortedLinks = [...linkMap.values()].sort((a, b) => {
    const na = nodesById.get(a.sourceId);
    const nb = nodesById.get(b.sourceId);
    if (!na || !nb) return 0;
    if (na.column !== nb.column) return na.column - nb.column;
    if (na.y !== nb.y) return na.y - nb.y;
    const ta = nodesById.get(a.targetId);
    const tb = nodesById.get(b.targetId);
    if (!ta || !tb) return 0;
    if (ta.column !== tb.column) return ta.column - tb.column;
    return ta.y - tb.y;
  });

  for (const linkData of sortedLinks) {
    const sourceNode = nodesById.get(linkData.sourceId);
    const targetNode = nodesById.get(linkData.targetId);
    if (!sourceNode || !targetNode) continue;

    const sOffset = sourcePortOffset.get(linkData.sourceId) ?? 0;
    const tOffset = targetPortOffset.get(linkData.targetId) ?? 0;

    const linkHeight = sourceNode.count > 0
      ? (linkData.count / sourceNode.count) * sourceNode.height
      : 0;
    const targetLinkHeight = targetNode.count > 0
      ? (linkData.count / targetNode.count) * targetNode.height
      : 0;

    links.push({
      sourceId: linkData.sourceId,
      targetId: linkData.targetId,
      segment: linkData.segment,
      count: linkData.count,
      isDrop: linkData.isDrop,
      sx: sourceNode.x + NODE_WIDTH,
      sy0: sourceNode.y + sOffset,
      sy1: sourceNode.y + sOffset + linkHeight,
      tx: targetNode.x,
      ty0: targetNode.y + tOffset,
      ty1: targetNode.y + tOffset + targetLinkHeight,
    });

    sourcePortOffset.set(linkData.sourceId, sOffset + linkHeight);
    targetPortOffset.set(linkData.targetId, tOffset + targetLinkHeight);
  }

  return {
    nodes: [...nodesById.values()],
    links,
    viewBoxHeight,
  };
}

// ── BFS trace for focus ─────────────────────────────────────────────────

function traceFocus(
  focusNode: string,
  links: SankeyLink[],
): { nodes: Set<string>; linkKeys: Set<string> } {
  const tracedNodes = new Set<string>([focusNode]);
  const tracedLinks = new Set<string>();

  // BFS forward
  const forwardQueue = [focusNode];
  while (forwardQueue.length > 0) {
    const current = forwardQueue.shift()!;
    for (const link of links) {
      if (link.sourceId === current) {
        const key = `${link.sourceId}|${link.targetId}|${link.segment}`;
        if (!tracedLinks.has(key)) {
          tracedLinks.add(key);
          if (!tracedNodes.has(link.targetId)) {
            tracedNodes.add(link.targetId);
            forwardQueue.push(link.targetId);
          }
        }
      }
    }
  }

  // BFS backward
  const backwardQueue = [focusNode];
  while (backwardQueue.length > 0) {
    const current = backwardQueue.shift()!;
    for (const link of links) {
      if (link.targetId === current) {
        const key = `${link.sourceId}|${link.targetId}|${link.segment}`;
        if (!tracedLinks.has(key)) {
          tracedLinks.add(key);
          if (!tracedNodes.has(link.sourceId)) {
            tracedNodes.add(link.sourceId);
            backwardQueue.push(link.sourceId);
          }
        }
      }
    }
  }

  return { nodes: tracedNodes, linkKeys: tracedLinks };
}

// ── Component ───────────────────────────────────────────────────────────

export function SankeyChart({
  actorJourneys,
  showSource,
  segmentation,
  focusNode,
  onFocusChange,
  onTooltip,
}: SankeyChartProps) {
  const sankey = useMemo(
    () => buildSankey(actorJourneys, showSource, segmentation),
    [actorJourneys, showSource, segmentation],
  );

  const trace = useMemo(() => {
    if (!focusNode) return null;
    return traceFocus(focusNode, sankey.links);
  }, [focusNode, sankey.links]);

  const totalActors = actorJourneys.length;

  const handleNodeClick = useCallback(
    (nodeId: string, isDrop: boolean) => {
      if (isDrop) return; // don't focus drop nodes
      onFocusChange(focusNode === nodeId ? null : nodeId);
    },
    [focusNode, onFocusChange],
  );

  const handleNodeHover = useCallback(
    (node: SankeyNode) => {
      onTooltip({
        title: node.longLabel,
        rows: [
          { label: "Actors", value: formatCount(node.count) },
          ...(totalActors > 0
            ? [{ label: "of total", value: ((node.count / totalActors) * 100).toFixed(1) + "%" }]
            : []),
        ],
      });
    },
    [onTooltip, totalActors],
  );

  const handleLinkHover = useCallback(
    (link: SankeyLink) => {
      const sourceNode = sankey.nodes.find((n) => n.id === link.sourceId);
      const targetNode = sankey.nodes.find((n) => n.id === link.targetId);
      if (!sourceNode || !targetNode) return;
      onTooltip({
        title: `${sourceNode.longLabel} → ${targetNode.longLabel}`,
        rows: [
          { label: "Actors", value: formatCount(link.count) },
          ...(totalActors > 0
            ? [{ label: "of total", value: ((link.count / totalActors) * 100).toFixed(1) + "%" }]
            : []),
        ],
      });
    },
    [onTooltip, sankey.nodes, totalActors],
  );

  const handleMouseLeave = useCallback(() => {
    onTooltip(null);
  }, [onTooltip]);

  const startCol = showSource ? 0 : 1;

  return (
    <svg
      viewBox={`0 0 1100 ${sankey.viewBoxHeight}`}
      style={{ width: "100%", height: "auto", display: "block", userSelect: "none" }}
    >
      {/* Column headers */}
      {COLUMN_HEADERS.map((header, i) => {
        if (i < startCol) return null;
        const totalCols = COLUMN_HEADERS.length - startCol;
        const idx = i - startCol;
        const gap = (1100 - 80) / (totalCols - 1);
        const x = 40 + idx * gap + 5; // center on node
        return (
          <text
            key={header}
            x={x}
            y={16}
            textAnchor="middle"
            style={{
              fontSize: "9px",
              fontWeight: 700,
              textTransform: "uppercase" as const,
              fill: "#94a3b8",
              letterSpacing: "0.05em",
            }}
          >
            {header}
          </text>
        );
      })}

      {/* Links (ribbons) */}
      {sankey.links.map((link) => {
        const key = `${link.sourceId}|${link.targetId}|${link.segment}`;
        const color = segmentColor(link.segment, segmentation);
        const isTracing = trace !== null;
        const isTraced = trace?.linkKeys.has(key) ?? false;

        let opacity: number;
        if (isTracing) {
          if (isTraced) {
            opacity = link.isDrop ? 0.50 : 0.46;
          } else {
            opacity = 0.05;
          }
        } else {
          opacity = link.isDrop ? 0.26 : 0.20;
        }

        const mx = (link.sx + link.tx) / 2;
        const d = [
          `M ${link.sx},${link.sy0}`,
          `C ${mx},${link.sy0} ${mx},${link.ty0} ${link.tx},${link.ty0}`,
          `L ${link.tx},${link.ty1}`,
          `C ${mx},${link.ty1} ${mx},${link.sy1} ${link.sx},${link.sy1}`,
          "Z",
        ].join(" ");

        return (
          <path
            key={key}
            d={d}
            fill={color}
            opacity={opacity}
            style={{ transition: "opacity 0.12s" }}
            onMouseEnter={() => handleLinkHover(link)}
            onMouseLeave={handleMouseLeave}
          />
        );
      })}

      {/* Nodes */}
      {sankey.nodes.map((node) => {
        const isTracing = trace !== null;
        const isTraced = trace?.nodes.has(node.id) ?? false;
        const nodeOpacity = isTracing && !isTraced ? 0.25 : 1;

        return (
          <g
            key={node.id}
            style={{ transition: "opacity 0.12s", opacity: nodeOpacity, cursor: node.isDrop ? "default" : "pointer" }}
            onClick={() => handleNodeClick(node.id, node.isDrop)}
            onMouseEnter={() => handleNodeHover(node)}
            onMouseLeave={handleMouseLeave}
          >
            {/* Node bar */}
            <rect
              x={node.x}
              y={node.y}
              width={10}
              height={node.height}
              rx={2}
              ry={2}
              fill={node.color}
            />

            {/* Labels */}
            {node.id.startsWith("src:") ? (
              <>
                {/* Source label: left of node */}
                <text
                  x={node.x - 6}
                  y={node.y + node.height / 2 - (node.height > 26 ? 4 : 0)}
                  textAnchor="end"
                  dominantBaseline="central"
                  style={{
                    fontSize: "10.5px",
                    fontWeight: 600,
                    fill: "#475569",
                  }}
                >
                  {node.label}
                </text>
                {node.height > 26 && (
                  <text
                    x={node.x - 6}
                    y={node.y + node.height / 2 + 10}
                    textAnchor="end"
                    dominantBaseline="central"
                    style={{
                      fontSize: "9px",
                      fontFamily: "monospace",
                      fill: "#94a3b8",
                    }}
                  >
                    {formatCount(node.count)}
                  </text>
                )}
              </>
            ) : node.isDrop ? (
              <>
                {/* Drop label: right of node, red */}
                {node.height > 13 && (
                  <text
                    x={node.x + 16}
                    y={node.y + node.height / 2}
                    dominantBaseline="central"
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      fill: DROP_COLOR,
                    }}
                  >
                    {formatCount(node.count)}
                  </text>
                )}
              </>
            ) : (
              <>
                {/* Milestone label: right of node */}
                {node.height > 13 && (
                  <>
                    <text
                      x={node.x + 16}
                      y={node.y + node.height / 2 - (node.height > 26 ? 4 : 0)}
                      dominantBaseline="central"
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        fill: node.color,
                      }}
                    >
                      {node.label}
                    </text>
                    {node.height > 26 && (
                      <text
                        x={node.x + 16}
                        y={node.y + node.height / 2 + 10}
                        dominantBaseline="central"
                        style={{
                          fontSize: "9px",
                          fontFamily: "monospace",
                          fill: "#94a3b8",
                        }}
                      >
                        {formatCount(node.count)}
                      </text>
                    )}
                  </>
                )}
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
