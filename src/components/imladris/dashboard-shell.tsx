"use client";

/**
 * Reusable dashboard shell for the Imladris metric dashboards.
 *
 * Owns the client state (selected month index, open drawer key, demo opt-in),
 * consumes `useImladrisDashboardData`, and renders the loading / error / demo /
 * topbar / renderer / drawer composition (per `prototype/Imladris Dashboards.html`
 * App shell + state).
 *
 * A route picks its view by passing a `dashboardId` present in the catalog /
 * normalized model (e.g. "operating"). The model holds ALL metrics; the
 * dashboard definition selects its own keys.
 */

import { useCallback, useMemo, useState } from "react";
import { useImladrisDashboardData } from "./use-imladris-dashboard-data";
import { DashboardView } from "./dashboard-renderer";
import { MetricDrawer } from "./metric-drawer";
import { DemoBanner, ErrorState, LoadingState, TopBar } from "./states";
import styles from "./imladris-dashboard.module.css";
import type { DashboardDefinition } from "./types";

export interface ImladrisDashboardShellProps {
  dashboardId: string;
  /** Render demo data immediately (e.g. when the route saw `?demo`). */
  initialDemo?: boolean;
}

function fallbackDashboard(id: string): DashboardDefinition {
  return { id, label: id, eyebrow: "Metric dashboard", hero: [], groups: [] };
}

export function ImladrisDashboardShell({ dashboardId, initialDemo = false }: ImladrisDashboardShellProps) {
  const [demo, setDemo] = useState(initialDemo);
  const { status, model, error, endpoint, retry } = useImladrisDashboardData({ demo });

  // `null` means "follow latest"; it's resolved against the live month count in
  // render so the index defaults to the newest month without an effect.
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

  return (
    <div className={styles.root}>
      {status === "demo" && <DemoBanner onConnect={onConnectLive} />}
      <TopBar
        dashboard={dashboard}
        model={model}
        idx={idx}
        months={model.months}
        dataSource={status === "demo" ? "demo" : "live"}
        onMonth={(next) => setMonthIdx(Math.max(0, Math.min(next, model.months.length - 1)))}
      />
      <div className={styles.scroll}>
        <DashboardView model={model} dashboard={dashboard} idx={idx} months={model.months} onOpen={setOpenKey} />
      </div>
      <MetricDrawer metric={openMetric} model={model} idx={idx} months={model.months} onClose={() => setOpenKey(null)} />
    </div>
  );
}
