export function buildAnalyticsRouteMeta(input: {
  servedAt?: string;
  section: string | null;
  forceRefresh: boolean;
  staleDomains: string[];
  erroredDomains: string[];
}) {
  return {
    servedAt: input.servedAt ?? new Date().toISOString(),
    section: input.section,
    forceRefresh: input.forceRefresh,
    isPartial: input.staleDomains.length > 0 || input.erroredDomains.length > 0,
    staleDomains: input.staleDomains,
    erroredDomains: input.erroredDomains,
  };
}

export function buildSummaryChildDiagnostics(input: {
  snapshotStatus: "SUCCESS" | "ERROR" | null;
  capturedAt: string | null;
  lastError: string | null;
}): { lastSnapshotAt: string | null; lastError: string | null } {
  return {
    lastSnapshotAt: input.capturedAt,
    lastError: input.snapshotStatus === "ERROR" ? input.lastError : null,
  };
}
