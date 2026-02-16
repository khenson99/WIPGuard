export type AnalyticsDomainError = Error & { domainKey?: string };

export function createAnalyticsDomainError(
  domainKey: string,
  message: string
): AnalyticsDomainError {
  const error = new Error(message) as AnalyticsDomainError;
  error.domainKey = domainKey;
  return error;
}

export function analyticsErrorFromReason(reason: unknown): {
  source: string;
  message: string;
} {
  if (reason instanceof Error) {
    const domainKey =
      typeof (reason as AnalyticsDomainError).domainKey === "string"
        ? ((reason as AnalyticsDomainError).domainKey as string)
        : null;
    return {
      source: domainKey ?? "analytics",
      message: reason.message || "Failed",
    };
  }

  if (
    reason &&
    typeof reason === "object" &&
    "domainKey" in reason &&
    "message" in reason
  ) {
    const domainKey =
      typeof (reason as Record<string, unknown>).domainKey === "string"
        ? ((reason as Record<string, unknown>).domainKey as string)
        : "analytics";
    const message =
      typeof (reason as Record<string, unknown>).message === "string"
        ? ((reason as Record<string, unknown>).message as string)
        : "Failed";
    return { source: domainKey, message };
  }

  return {
    source: "analytics",
    message: "Failed",
  };
}
