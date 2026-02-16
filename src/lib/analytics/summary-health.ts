export type SectionStatus = "connected" | "partial" | "degraded" | "missing";

export function deriveDomainSectionStatus(input: {
  configured: boolean;
  requiresSnapshot: boolean;
  snapshotStatus: "SUCCESS" | "ERROR" | null;
  snapshotStale: boolean;
}): SectionStatus {
  if (!input.configured) {
    return "missing";
  }

  if (!input.requiresSnapshot) {
    return "connected";
  }

  if (input.snapshotStatus === "SUCCESS" && !input.snapshotStale) {
    return "connected";
  }

  return "degraded";
}
