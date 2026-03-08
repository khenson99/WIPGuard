export const AutomationSourceDocumentStatus = {
  READY: "READY",
  ERROR: "ERROR",
  ARCHIVED: "ARCHIVED",
} as const;

export type AutomationSourceDocumentStatus =
  (typeof AutomationSourceDocumentStatus)[keyof typeof AutomationSourceDocumentStatus];

export const AutomationArtifactStatus = {
  DRAFT: "DRAFT",
  READY: "READY",
  ERROR: "ERROR",
  ARCHIVED: "ARCHIVED",
} as const;

export type AutomationArtifactStatus =
  (typeof AutomationArtifactStatus)[keyof typeof AutomationArtifactStatus];

export const AutomationRecommendationStatus = {
  PENDING_APPROVAL: "PENDING_APPROVAL",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  EXECUTED: "EXECUTED",
  FAILED: "FAILED",
} as const;

export type AutomationRecommendationStatus =
  (typeof AutomationRecommendationStatus)[keyof typeof AutomationRecommendationStatus];

export const AutomationAiJobStatus = {
  QUEUED: "QUEUED",
  REQUESTED: "REQUESTED",
  RUNNING: "RUNNING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  CANCELED: "CANCELED",
} as const;

export type AutomationAiJobStatus =
  (typeof AutomationAiJobStatus)[keyof typeof AutomationAiJobStatus];
