"use client";

/**
 * Generic canvas shell for Imladris views that need the same data + state
 * machine as `ImladrisDashboardShell` but render a bespoke body.
 *
 * This is an ADDITIVE sibling of `dashboard-shell.tsx` (which is left untouched
 * and keeps driving Operating + the department views via the generic
 * `DashboardView`). It owns the identical client state — selected month index,
 * open drawer key, demo opt-in — consumes `useImladrisDashboardData`, and
 * renders the loading / error / demo / header composition. The body is supplied
 * by a `renderCanvas` render-prop so the Company Tracker lead view and the
 * redesigned Sources view can reuse all of this without forking the shell.
 *
 * Headers:
 *  - `"full"`  → the standard metric `TopBar` (month switcher, freshness pill,
 *    data-source badge) plus the metric drill-down `MetricDrawer`.
 *  - `"simple"` → a lightweight eyebrow + title header and no drawer, matching
 *    the prototype's Sources route chrome.
 */

import { useCallback, useMemo, useState } from "react";
import { useImladrisDashboardData } from "./use-imladris-dashboard-data";
import { MetricDrawer } from "./metric-drawer";
import { DemoBanner, ErrorState, LoadingState, TopBar } from "./states";
import styles from "./imladris-dashboard.module.css";
import type { DashboardDefinition, ImladrisModel } from "./types";

export interface CanvasRenderArgs {
  model: ImladrisModel;
  idx: number;
  months: string[];
  onOpen: (key: string) => void;
}

export interface DashboardCanvasShellProps {
  /** Catalog dashboard id used to look up the view's hero/group layout. */
  dashboardId: string;
  /** Render demo data immediately (e.g. when the route saw `?demo`). */
  initialDemo?: boolean;
  /** Full metric topbar + drawer, or a lightweight title-only header. */
  headerVariant?: "full" | "simple";
  /** Eyebrow + title for the `"simple"` header variant. */
  simpleHeader?: { eyebrow: string; title: string };
  /** The bespoke canvas body. */
  renderCanvas: (args: CanvasRenderArgs) => React.ReactNode;
}

function fallbackDashboard(id: string): DashboardDefinition {
  return { id, label: id, eyebrow: "Metric dashboard", hero: [], groups: [] };
}

export function DashboardCanvasShell({
  dashboardId,
  initialDemo = false,
  headerVariant = "full",
  simpleHeader,
  renderCanvas,
}: DashboardCanvasShellProps) {
  const [demo, setDemo] = useState(initialDemo);
  const { status, model, error, endpoint, retry } = useImladrisDashboardData({ demo });

  const [monthIdx, setMonthIdx] = useState<number | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const onConnectLive = useCallback(() => {
    setDemo(false);
    setMonthIdx(null);
    retry();
  }, [retry]);

  const onPreviewDemo = useCallback(() => {
    setDemo(true);
    setMonthIdx(null);
  }, []);

  const dashboard = useMemo<DashboardDefinition>(() => {
    return model?.dashboards[dashboardId] ?? fallbackDashboard(dashboardId);
  }, [model, dashboardId]);

  if (status === "loading" || (!model && status !== "error")) {
    return (
      <div className={styles.root}>
        <LoadingState />
      </div>
    );
  }

  if (status === "error" || !model) {
    return (
      <div className={styles.root}>
        <ErrorState error={error} endpoint={endpoint} onRetry={retry} onDemo={onPreviewDemo} />
      </div>
    );
  }

  const idx = Math.min(monthIdx ?? model.months.length - 1, model.months.length - 1);
  const openMetric = openKey ? model.metricByKey[openKey] ?? null : null;
  const simple = headerVariant === "simple";

  return (
    <div className={styles.root}>
      {status === "demo" && <DemoBanner onConnect={onConnectLive} />}
      {simple ? (
        <header className={styles.topbar}>
          <div className={styles.topbarTitle}>
            <div className={styles.eyebrow}>{simpleHeader?.eyebrow ?? "Data"}</div>
            <h1>{simpleHeader?.title ?? dashboard.label}</h1>
          </div>
          <div className={styles.topbarSpacer} />
          <span
            className={`${styles.dsrc} ${status === "demo" ? styles.dsrcDemo : styles.dsrcLive}`}
            title={
              status === "demo"
                ? "Demo data — not connected to live metrics"
                : "Connected to the Imladris metrics API"
            }
          >
            <span className={styles.dsrcDot} />
            {status === "demo" ? "Demo data" : "Live"}
          </span>
        </header>
      ) : (
        <TopBar
          dashboard={dashboard}
          model={model}
          idx={idx}
          months={model.months}
          dataSource={status === "demo" ? "demo" : "live"}
          onMonth={(next) => setMonthIdx(Math.max(0, Math.min(next, model.months.length - 1)))}
        />
      )}
      <div className={styles.scroll}>{renderCanvas({ model, idx, months: model.months, onOpen: setOpenKey })}</div>
      {!simple && (
        <MetricDrawer
          metric={openMetric}
          model={model}
          idx={idx}
          months={model.months}
          onClose={() => setOpenKey(null)}
        />
      )}
    </div>
  );
}
