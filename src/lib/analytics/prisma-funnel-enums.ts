export const FunnelEventType = {
  PAGE_VIEW: "PAGE_VIEW",
  SESSION_STARTED: "SESSION_STARTED",
  AUTH_COMPLETED: "AUTH_COMPLETED",
  DEMO_BOOKED: "DEMO_BOOKED",
  KANBAN_CARD_CREATED: "KANBAN_CARD_CREATED",
  TRIAL_STARTED: "TRIAL_STARTED",
  PAID_CUSTOMER: "PAID_CUSTOMER",
} as const;

export type FunnelEventType =
  (typeof FunnelEventType)[keyof typeof FunnelEventType];

export const FunnelIdentityType = {
  EMAIL: "EMAIL",
  USER_ID: "USER_ID",
  HUBSPOT_CONTACT_ID: "HUBSPOT_CONTACT_ID",
  HUBSPOT_DEAL_ID: "HUBSPOT_DEAL_ID",
  STRIPE_CUSTOMER_ID: "STRIPE_CUSTOMER_ID",
  CODA_EMAIL: "CODA_EMAIL",
} as const;

export type FunnelIdentityType =
  (typeof FunnelIdentityType)[keyof typeof FunnelIdentityType];

export const FunnelLinkProvenance = {
  EXACT: "EXACT",
  INFERRED: "INFERRED",
  BACKFILLED: "BACKFILLED",
} as const;

export type FunnelLinkProvenance =
  (typeof FunnelLinkProvenance)[keyof typeof FunnelLinkProvenance];

export const PrismaEnrichmentProvider = {
  UNIFY: "UNIFY",
  CLAY: "CLAY",
  RB2B: "RB2B",
} as const;

export type PrismaEnrichmentProvider =
  (typeof PrismaEnrichmentProvider)[keyof typeof PrismaEnrichmentProvider];
