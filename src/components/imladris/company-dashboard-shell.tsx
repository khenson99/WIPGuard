"use client";

/**
 * Client wrapper binding the bespoke Company Tracker lead view to the generic
 * `DashboardCanvasShell`. ADDITIVE: it does not touch the existing
 * `ImladrisDashboardShell` or the legacy `/metrics/company` Company Tracker.
 */

import { DashboardCanvasShell } from "./dashboard-canvas-shell";
import { CompanyDashboardView } from "./company-dashboard-view";

export interface ImladrisCompanyShellProps {
  initialDemo?: boolean;
}

export function ImladrisCompanyShell({ initialDemo = false }: ImladrisCompanyShellProps) {
  return (
    <DashboardCanvasShell
      dashboardId="company"
      initialDemo={initialDemo}
      headerVariant="full"
      renderCanvas={({ model, idx, months, onOpen }) => {
        const dashboard = model.dashboards["company"];
        if (!dashboard) return null;
        return (
          <CompanyDashboardView
            model={model}
            dashboard={dashboard}
            idx={idx}
            months={months}
            onOpen={onOpen}
          />
        );
      }}
    />
  );
}
