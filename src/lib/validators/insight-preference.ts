export const INSIGHT_PREFERENCE_STATUSES = ["pinned", "dismissed", "default"] as const;
export type InsightPreferenceStatus = (typeof INSIGHT_PREFERENCE_STATUSES)[number];

export interface UpsertInsightPreferenceInput {
  insightId: string;
  status: InsightPreferenceStatus;
}

export function validateUpsertInput(body: unknown): {
  valid: boolean;
  data?: UpsertInsightPreferenceInput;
  error?: string;
} {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Body must be a JSON object" };
  }

  const { insightId, status } = body as Record<string, unknown>;

  if (typeof insightId !== "string" || insightId.length === 0 || insightId.length > 256) {
    return { valid: false, error: "insightId is required (string, max 256 chars)" };
  }

  if (
    typeof status !== "string" ||
    !INSIGHT_PREFERENCE_STATUSES.includes(status as InsightPreferenceStatus)
  ) {
    return {
      valid: false,
      error: `status must be one of: ${INSIGHT_PREFERENCE_STATUSES.join(", ")}`,
    };
  }

  return { valid: true, data: { insightId, status: status as InsightPreferenceStatus } };
}
