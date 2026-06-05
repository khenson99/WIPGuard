"use client";

/**
 * Sources health view — the redesigned provider-health board.
 *
 * Ported from `SourcesView` in `prototype/app/dashboards.jsx`. Consumes the
 * normalized `model.providers` produced by `useImladrisDashboardData` (which
 * overlays the live `/api/imladris/sources` payload onto the provider set), so
 * it is live-or-error by construction: in live mode the counts and rows reflect
 * exactly what the sources API reported; the demo path is only reachable behind
 * the loudly-labeled `?demo` flag.
 *
 * This is a NEW component wired at a NEW route (`/operating/sources`). The
 * existing server-rendered `/sources` workspace is untouched.
 *
 * Layout: a fresh/stale/partial/errored summary, then a provider list with a
 * status dot, "feeds N metrics", record count, last sync, and any error.
 */

import { PROVIDER_STATE_COLOR, syncLabel } from "./format";
import styles from "./imladris-dashboard.module.css";
import type { ImladrisModel, ProviderState } from "./types";

const PROVIDER_ORDER: ProviderState[] = ["error", "stale", "partial", "connected"];

const STATE_LABEL: Record<ProviderState, string> = {
  connected: "Connected",
  stale: "Stale",
  partial: "Partial",
  error: "Error",
};

const SUMMARY_CARDS: Array<[ProviderState, string]> = [
  ["connected", "Fresh"],
  ["stale", "Stale"],
  ["partial", "Partial"],
  ["error", "Errored"],
];

export interface SourcesViewProps {
  model: ImladrisModel;
}

export function SourcesView({ model }: SourcesViewProps) {
  const entries = Object.entries(model.providers);

  const counts: Record<ProviderState, number> = { connected: 0, stale: 0, partial: 0, error: 0 };
  entries.forEach(([, p]) => {
    counts[p.state] = (counts[p.state] ?? 0) + 1;
  });

  const metricsByProvider = (key: string): number =>
    model.metrics.filter((m) => m.sources.includes(key as never)).length;

  const sorted = entries
    .slice()
    .sort((a, b) => PROVIDER_ORDER.indexOf(a[1].state) - PROVIDER_ORDER.indexOf(b[1].state));

  return (
    <div className={styles.canvas}>
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Source health</h2>
          <span className={styles.sectionNote}>
            {entries.length} connected provider{entries.length === 1 ? "" : "s"} feeding canonical metrics
          </span>
        </div>
        <div className={`${styles.grid} ${styles.g4}`}>
          {SUMMARY_CARDS.map(([st, lbl]) => (
            <div className={`${styles.tile} ${styles.tileStatic}`} key={st}>
              <div className={styles.tileLabel}>
                <span className={styles.linDot} style={{ background: PROVIDER_STATE_COLOR[st] }} />
                {lbl}
              </div>
              <div className={`${styles.tileValue} ${styles.num}`}>{counts[st] ?? 0}</div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>All sources</h2>
        </div>
        <div className={styles.lin}>
          {sorted.map(([key, p]) => {
            const feeds = metricsByProvider(key);
            return (
              <div className={styles.linRow} key={key} style={{ padding: "12px 14px" }}>
                <span
                  className={styles.linDot}
                  style={{ background: PROVIDER_STATE_COLOR[p.state], width: 9, height: 9 }}
                />
                <span>
                  <span className={styles.linName} style={{ display: "block" }}>
                    {p.label}
                  </span>
                  <span style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>
                    {STATE_LABEL[p.state]} · feeds {feeds} metric{feeds === 1 ? "" : "s"}
                    {p.error ? ` · ${p.error}` : ""}
                  </span>
                </span>
                <span className={`${styles.linMeta} ${styles.num}`}>
                  {p.records.toLocaleString()} records
                  <br />
                  {syncLabel(p.daysAgo)}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
