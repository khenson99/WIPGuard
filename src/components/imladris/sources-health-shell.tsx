"use client";

/**
 * Client wrapper binding the redesigned Sources health view to the generic
 * `DashboardCanvasShell` with the lightweight "Data / Sources" header.
 *
 * ADDITIVE and isolated: the existing server-rendered `/sources` workspace
 * (`SourcesWorkspace` + `buildImladrisSources`) is untouched. This view consumes
 * the same live `/api/imladris/sources` payload, but via the client dashboard
 * hook's normalized provider model.
 */

import { DashboardCanvasShell } from "./dashboard-canvas-shell";
import { SourcesView } from "./sources-view";

export interface ImladrisSourcesShellProps {
  initialDemo?: boolean;
}

export function ImladrisSourcesShell({ initialDemo = false }: ImladrisSourcesShellProps) {
  return (
    <DashboardCanvasShell
      dashboardId="operating"
      initialDemo={initialDemo}
      headerVariant="simple"
      simpleHeader={{ eyebrow: "Data", title: "Sources" }}
      renderCanvas={({ model }) => <SourcesView model={model} />}
    />
  );
}
