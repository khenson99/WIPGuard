"use client";

/**
 * SVG chart primitives for the Imladris dashboards.
 * Hand-rolled (ported from `prototype/app/charts.jsx`) for pixel fidelity and
 * zero new chart dependencies. Clean, flat, single-accent.
 */

import { useId } from "react";
import { monthShort } from "./format";
import styles from "./imladris-dashboard.module.css";

const ORANGE = "#FC5A29";

function extent(data: number[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of data) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) {
    min -= 1;
    max += 1;
  }
  return [min, max];
}

export interface SparklineProps {
  data: number[];
  w?: number;
  h?: number;
  good?: "up" | "down";
  color?: string;
}

/** Compact sparkline; color reflects the healthy direction unless overridden. */
export function Sparkline({ data, w = 132, h = 34, good = "up", color }: SparklineProps) {
  const reactId = useId();
  if (data.length < 2) return <svg width={w} height={h} />;
  const pad = 3;
  const [min, max] = extent(data);
  const sx = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2);
  const sy = (v: number) => h - pad - ((v - min) / (max - min)) * (h - pad * 2);
  const pts = data.map((v, i) => [sx(i), sy(v)] as const);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${sx(data.length - 1).toFixed(1)} ${h - pad} L${pad} ${h - pad} Z`;
  const rising = data[data.length - 1] >= data[0];
  const healthy = good === "up" ? rising : !rising;
  const stroke = color || (healthy ? "#16a34a" : "#dc2626");
  void reactId;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <path d={area} fill={stroke} opacity="0.08" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.4" fill={stroke} />
    </svg>
  );
}

export interface AreaChartProps {
  data: number[];
  months: string[];
  selected?: number | null;
  height?: number;
}

/** Full area chart with 3 gridlines, month axis, and a selected-month marker. */
export function AreaChart({ data, months, selected, height = 200 }: AreaChartProps) {
  const H = height;
  if (data.length < 2) {
    return (
      <div className={styles.chartEmpty} style={{ height: H }}>
        Single reported period — no series to chart.
      </div>
    );
  }
  const W = 1000;
  const padL = 6;
  const padR = 6;
  const padT = 14;
  const padB = 26;
  const [rawMin, rawMax] = extent(data);
  const span = rawMax - rawMin;
  const min = Math.max(0, rawMin - span * 0.12);
  const max = rawMax + span * 0.14;
  const sx = (i: number) => padL + (i / (data.length - 1)) * (W - padL - padR);
  const sy = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const pts = data.map((v, i) => [sx(i), sy(v)] as const);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${sx(data.length - 1).toFixed(1)} ${H - padB} L${padL} ${H - padB} Z`;
  const sel = selected == null ? data.length - 1 : Math.max(0, Math.min(selected, data.length - 1));
  const gridN = 3;
  const grid: number[] = [];
  for (let g = 0; g <= gridN; g++) {
    grid.push(sy(min + (g / gridN) * (max - min)));
  }
  const labelEvery = Math.max(1, Math.ceil(months.length / 7));
  return (
    <svg className={styles.chartWrap} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: H, width: "100%" }}>
      {grid.map((y, i) => (
        <line key={i} x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
      <path d={area} fill={ORANGE} opacity="0.07" />
      <path d={line} fill="none" stroke={ORANGE} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <line
        x1={pts[sel][0]}
        y1={padT}
        x2={pts[sel][0]}
        y2={H - padB}
        stroke="var(--fg-accent)"
        strokeWidth="1"
        strokeDasharray="3 3"
        vectorEffect="non-scaling-stroke"
        opacity="0.45"
      />
      <circle cx={pts[sel][0]} cy={pts[sel][1]} r="4" fill={ORANGE} stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {months.map((m, i) =>
        i % labelEvery === 0 || i === months.length - 1 ? (
          <text
            key={i}
            className={styles.axis}
            x={sx(i)}
            y={H - 8}
            textAnchor={i === months.length - 1 ? "end" : i === 0 ? "start" : "middle"}
            vectorEffect="non-scaling-stroke"
          >
            {monthShort(m)}
          </text>
        ) : null,
      )}
    </svg>
  );
}
