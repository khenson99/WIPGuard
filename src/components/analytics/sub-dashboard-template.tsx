"use client";

import type { ReactNode } from "react";
import { ConnectionDot } from "./connection-dot";
import type { ConnectionStatus } from "@/hooks/use-connection-status";

interface SubDashboardTemplateProps {
  title: string;
  connectionStatus: ConnectionStatus;
  kpis: ReactNode;
  heroChart: ReactNode;
  panels: ReactNode;
}

export function SubDashboardTemplate({
  title,
  connectionStatus,
  kpis,
  heroChart,
  panels,
}: SubDashboardTemplateProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        <ConnectionDot status={connectionStatus} size="md" />
      </div>
      {kpis}
      <div className="rounded-xl border border-border bg-card p-5">{heroChart}</div>
      {panels}
    </div>
  );
}
