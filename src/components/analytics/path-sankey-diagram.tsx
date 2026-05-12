"use client";

import { useMemo, useState } from "react";
import { computeSankeyLayout, type PathData } from "@/lib/analytics/sankey-layout";

const DIAGRAM_WIDTH = 800;
const DIAGRAM_HEIGHT = 360;
const NODE_WIDTH = 20;
const NODE_PADDING = 14;

const STAGE_COLORS: Record<string, string> = {
  "Google Ads": "hsl(210, 70%, 55%)",
  "Meta Ads": "hsl(220, 75%, 60%)",
  "Reddit Ads": "hsl(25, 85%, 58%)",
  "Organic Traffic": "hsl(145, 60%, 45%)",
  "Sales Pipeline": "hsl(45, 80%, 52%)",
  "Billing/Trial": "hsl(270, 60%, 60%)",
  "Lead Magnet": "hsl(330, 65%, 58%)",
  "Support (Pylon)": "hsl(190, 65%, 50%)",
};

function getStageColor(stage: string): string {
  if (STAGE_COLORS[stage]) return STAGE_COLORS[stage];
  const hash = stage.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return `hsl(${hash % 360}, 60%, 52%)`;
}

interface PathSankeyDiagramProps {
  paths: PathData[];
  topN?: number;
  onPathClick?: (stages: string[]) => void;
  className?: string;
}

export function PathSankeyDiagram({
  paths,
  topN = 10,
  onPathClick,
  className,
}: PathSankeyDiagramProps) {
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      computeSankeyLayout(paths, {
        width: DIAGRAM_WIDTH,
        height: DIAGRAM_HEIGHT,
        nodeWidth: NODE_WIDTH,
        nodePadding: NODE_PADDING,
        topN,
      }),
    [paths, topN],
  );

  if (!paths.length || !layout.nodes.length) {
    return (
      <div
        className={`flex items-center justify-center h-48 text-sm text-muted-foreground ${className ?? ""}`}
      >
        <p>No path data available to visualize.</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`}
        width="100%"
        role="img"
        aria-label="Flow diagram showing top deal paths through pipeline stages"
        className="overflow-visible"
      >
        {/* Links */}
        {layout.links.map((link) => {
          const isHovered = hoveredLink === link.id;
          const color = getStageColor(link.sourceLabel);
          return (
            <g key={link.id}>
              <path
                d={link.path}
                fill={color}
                fillOpacity={isHovered ? 0.55 : 0.25}
                stroke={color}
                strokeOpacity={0}
                style={{ cursor: onPathClick ? "pointer" : "default", transition: "fill-opacity 0.15s" }}
                onMouseEnter={() => setHoveredLink(link.id)}
                onMouseLeave={() => setHoveredLink(null)}
                onClick={() => {
                  if (onPathClick) {
                    onPathClick([link.sourceLabel, link.targetLabel]);
                  }
                }}
              >
                <title>
                  {link.sourceLabel} → {link.targetLabel}: {link.value} deal{link.value !== 1 ? "s" : ""}
                </title>
              </path>
            </g>
          );
        })}

        {/* Nodes */}
        {layout.nodes.map((node) => {
          const color = getStageColor(node.label);
          return (
            <g key={node.id}>
              <rect
                x={node.x}
                y={node.y}
                width={NODE_WIDTH}
                height={Math.max(node.height, 4)}
                fill={color}
                rx={3}
                ry={3}
              />
              {/* Label to the right for last column, left for others */}
              <text
                x={node.column === 0 ? node.x + NODE_WIDTH + 6 : node.x - 6}
                y={node.y + Math.max(node.height, 4) / 2}
                dominantBaseline="middle"
                textAnchor={node.column === 0 ? "start" : "end"}
                fontSize={11}
                fill="currentColor"
                className="text-foreground"
                style={{ userSelect: "none" }}
              >
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
