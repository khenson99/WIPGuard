"use client";

/**
 * Generic dashboard renderer: attention feed → hero KPI grid → grouped KPI grids.
 * Ported from `DashboardView` / `Tiles` / `Section` in `prototype/app/dashboards.jsx`.
 *
 * The Company-Tracker-only sections (north-star headline, board pacing, segment
 * matrix) are intentionally NOT rendered here — they are deferred to a later
 * chunk. This renderer drives the Operating + department views.
 */

import { AttentionFeed, KpiTile } from "./kpi-tile";
import { hasTrend, monthAbbr, monthName } from "./format";
import styles from "./imladris-dashboard.module.css";
import type { DashboardDefinition, ImladrisModel } from "./types";

function gridClass(n: number): string {
  if (n >= 5) return styles.g5;
  if (n === 4) return styles.g4;
  if (n === 3) return styles.g3;
  if (n === 2) return styles.g2;
  return styles.g3;
}
function groupGrid(n: number): string {
  if (n <= 3) return gridClass(n);
  if (n === 4) return styles.g4;
  return styles.g3;
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {note && <span className={styles.sectionNote}>{note}</span>}
      </div>
      {children}
    </section>
  );
}

interface TilesProps {
  keys: string[];
  model: ImladrisModel;
  idx: number;
  onOpen: (key: string) => void;
  month: string;
  prevMonth: string;
  hero?: boolean;
}

function Tiles({ keys, model, idx, onOpen, month, prevMonth, hero }: TilesProps) {
  return (
    <div className={`${styles.grid} ${hero ? gridClass(keys.length) : groupGrid(keys.length)}`}>
      {keys.map((k) => {
        const m = model.metricByKey[k];
        if (!m) return null;
        return (
          <KpiTile
            key={k}
            metric={m}
            idx={idx}
            onOpen={onOpen}
            hero={hero}
            month={month}
            compareLabel={`vs ${monthAbbr(prevMonth)}`}
            noTrend={!hasTrend(model, m)}
          />
        );
      })}
    </div>
  );
}

export interface DashboardViewProps {
  model: ImladrisModel;
  dashboard: DashboardDefinition;
  idx: number;
  months: string[];
  onOpen: (key: string) => void;
}

export function DashboardView({ model, dashboard, idx, months, onOpen }: DashboardViewProps) {
  const prevMonth = months[Math.max(0, idx - 1)];
  return (
    <div className={styles.canvas}>
      <Section title="Signals" note="Ranked by severity · click to inspect">
        <AttentionFeed model={model} idx={idx} onOpen={onOpen} />
      </Section>

      <Section title="Key metrics" note={`Month over month · ${monthName(months[idx])}`}>
        <Tiles keys={dashboard.hero} model={model} idx={idx} onOpen={onOpen} month={months[idx]} prevMonth={prevMonth} hero />
      </Section>

      {dashboard.groups.map((g) => (
        <Section key={g.title} title={g.title}>
          <Tiles keys={g.keys} model={model} idx={idx} onOpen={onOpen} month={months[idx]} prevMonth={prevMonth} />
        </Section>
      ))}
    </div>
  );
}
