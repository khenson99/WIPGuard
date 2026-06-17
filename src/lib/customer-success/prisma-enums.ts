// Mirror of Prisma enums -- keep in sync with prisma/schema.prisma

export const CustomerExternalProvider = {
  INTERNAL: "INTERNAL",
  HUBSPOT: "HUBSPOT",
  STRIPE: "STRIPE",
  PYLON: "PYLON",
  CODA: "CODA",
  SLACK: "SLACK",
  GOOGLE_WORKSPACE: "GOOGLE_WORKSPACE",
} as const;

export type CustomerExternalProvider =
  (typeof CustomerExternalProvider)[keyof typeof CustomerExternalProvider];

export const CustomerRecordStatus = {
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
  MERGED: "MERGED",
} as const;

export type CustomerRecordStatus =
  (typeof CustomerRecordStatus)[keyof typeof CustomerRecordStatus];

export const CustomerSuccessAlertSeverity = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
} as const;

export type CustomerSuccessAlertSeverity =
  (typeof CustomerSuccessAlertSeverity)[keyof typeof CustomerSuccessAlertSeverity];

export const CustomerSuccessAlertSource = {
  HEALTH: "HEALTH",
  SUPPORT: "SUPPORT",
  COMMERCIAL: "COMMERCIAL",
  RELATIONSHIP: "RELATIONSHIP",
  WORKFLOW: "WORKFLOW",
} as const;

export type CustomerSuccessAlertSource =
  (typeof CustomerSuccessAlertSource)[keyof typeof CustomerSuccessAlertSource];

export const CustomerSuccessAlertStatus = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  RESOLVED: "RESOLVED",
  DISMISSED: "DISMISSED",
} as const;

export type CustomerSuccessAlertStatus =
  (typeof CustomerSuccessAlertStatus)[keyof typeof CustomerSuccessAlertStatus];

export const CustomerSuccessOutreachStatus = {
  DRAFT: "DRAFT",
  QUEUED: "QUEUED",
  SENT: "SENT",
  FAILED: "FAILED",
  CANCELED: "CANCELED",
} as const;

export type CustomerSuccessOutreachStatus =
  (typeof CustomerSuccessOutreachStatus)[keyof typeof CustomerSuccessOutreachStatus];

export const CustomerSuccessPlanStatus = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  ARCHIVED: "ARCHIVED",
} as const;

export type CustomerSuccessPlanStatus =
  (typeof CustomerSuccessPlanStatus)[keyof typeof CustomerSuccessPlanStatus];

export const CustomerSuccessNoteSource = {
  MANUAL: "MANUAL",
  MEETING: "MEETING",
  SUPPORT: "SUPPORT",
  CRM: "CRM",
  AI: "AI",
  SYSTEM: "SYSTEM",
} as const;

export type CustomerSuccessNoteSource =
  (typeof CustomerSuccessNoteSource)[keyof typeof CustomerSuccessNoteSource];

export const CustomerSuccessNoteVisibility = {
  INTERNAL: "INTERNAL",
  RESTRICTED: "RESTRICTED",
} as const;

export type CustomerSuccessNoteVisibility =
  (typeof CustomerSuccessNoteVisibility)[keyof typeof CustomerSuccessNoteVisibility];

export const CustomerSuccessOutreachChannel = {
  EMAIL: "EMAIL",
  SLACK: "SLACK",
} as const;

export type CustomerSuccessOutreachChannel =
  (typeof CustomerSuccessOutreachChannel)[keyof typeof CustomerSuccessOutreachChannel];
