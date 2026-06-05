import { normalizePercentValue } from "./percentage-utils";

type StripeCustomerRef = {
  customerId?: string | null;
  email?: string | null;
  emailDomain?: string | null;
  hubspotCompanyIds?: string[] | null;
};

type StripeLike = {
  revenue?: {
    mrr?: number | null;
    mrrChange?: number | null;
  } | null;
  subscriptions?: {
    active?: number | null;
    activeCustomerRefs?: StripeCustomerRef[] | null;
  } | null;
} | null | undefined;

type HubSpotSubscriptionDealLike = {
  dealId?: string | null;
  dealName?: string | null;
  stageId?: string | null;
  stageLabel?: string | null;
  amount?: number | string | null;
  stripeCustomerId?: string | null;
  primaryContactEmail?: string | null;
  companyIds?: string[] | null;
};

type HubSpotLike = {
  subscriptionDeals?: HubSpotSubscriptionDealLike[] | null;
  deals?: HubSpotSubscriptionDealLike[] | null;
} | null | undefined;

const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
]);

function normalizeLookup(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeLookups(values: string[] | null | undefined): string[] {
  const normalizedValues: string[] = [];
  const seen = new Set<string>();
  for (const value of values ?? []) {
    const normalized = normalizeLookup(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    normalizedValues.push(normalized);
  }
  return normalizedValues;
}

function normalizeStageKey(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase().replace(/[\s_-]+/g, "") ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeEmailDomain(value: string | null | undefined): string | null {
  const email = normalizeLookup(value);
  if (!email || !email.includes("@")) return null;
  const [, domain] = email.split("@");
  const normalized = normalizeLookup(domain);
  if (!normalized || GENERIC_EMAIL_DOMAINS.has(normalized)) return null;
  return normalized;
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const normalized = value.trim().replace(/[$,\s]/g, "");
    if (!normalized) return 0;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function asStripeLike(value: unknown): StripeLike {
  return typeof value === "object" && value !== null ? (value as StripeLike) : null;
}

function asHubSpotLike(value: unknown): HubSpotLike {
  return typeof value === "object" && value !== null ? (value as HubSpotLike) : null;
}

function getHubSpotSubscriptionDeals(hubspot: HubSpotLike): HubSpotSubscriptionDealLike[] {
  if (Array.isArray(hubspot?.subscriptionDeals)) return hubspot.subscriptionDeals;
  return (hubspot?.deals ?? []).filter((deal) => {
    const stageKeys = [normalizeStageKey(deal.stageLabel), normalizeStageKey(deal.stageId)];
    return stageKeys.some((stageKey) => stageKey === "subscription" || stageKey === "subscriptions");
  });
}

export type SubscriptionMrrBreakdown = {
  stripeMrr: number;
  stripeMrrChange: number | null;
  hubspotSubscriptionMrr: number;
  hubspotOnlySubscriptionMrr: number;
  excludedLinkedHubspotSubscriptionMrr: number;
  totalMrr: number;
  totalArr: number;
  stripeActiveSubscriptions: number;
  hubspotActiveSubscriptions: number;
  hubspotOnlyActiveSubscriptions: number;
  mergedActiveSubscriptions: number;
};

export function buildSubscriptionMrrBreakdown(input: {
  stripe: unknown;
  hubspot: unknown;
}): SubscriptionMrrBreakdown {
  const stripe = asStripeLike(input.stripe);
  const hubspot = asHubSpotLike(input.hubspot);
  const stripeRefs = stripe?.subscriptions?.activeCustomerRefs ?? [];
  const hubspotDeals = getHubSpotSubscriptionDeals(hubspot);

  const stripeCustomerIds = new Set(
    stripeRefs
      .map((ref) => ref.customerId?.trim() ?? "")
      .filter((customerId) => customerId.length > 0 && customerId !== "Unknown customer"),
  );
  const stripeEmails = new Set(
    stripeRefs.map((ref) => normalizeLookup(ref.email)).filter(Boolean) as string[],
  );
  const stripeDomains = new Set(
    stripeRefs.map((ref) => normalizeLookup(ref.emailDomain)).filter(Boolean) as string[],
  );
  const stripeHubSpotCompanyIds = new Set(
    stripeRefs.flatMap((ref) => normalizeLookups(ref.hubspotCompanyIds)),
  );

  let hubspotOnlyActiveSubscriptions = 0;
  let hubspotOnlySubscriptionArr = 0;
  let excludedLinkedHubspotSubscriptionArr = 0;
  let hubspotSubscriptionArr = 0;

  for (const deal of hubspotDeals) {
    const amount = Math.max(0, toNumber(deal.amount));
    const customerId = deal.stripeCustomerId?.trim() || null;
    const email = normalizeLookup(deal.primaryContactEmail);
    const emailDomain = normalizeEmailDomain(deal.primaryContactEmail);
    const companyIds = normalizeLookups(deal.companyIds);
    const linkedToStripe =
      Boolean(customerId && stripeCustomerIds.has(customerId)) ||
      Boolean(email && stripeEmails.has(email)) ||
      Boolean(emailDomain && stripeDomains.has(emailDomain)) ||
      companyIds.some((companyId) => stripeHubSpotCompanyIds.has(companyId));

    hubspotSubscriptionArr += amount;
    if (linkedToStripe) {
      excludedLinkedHubspotSubscriptionArr += amount;
      continue;
    }

    hubspotOnlyActiveSubscriptions += 1;
    hubspotOnlySubscriptionArr += amount;
  }

  // HubSpot subscription deal amounts are annual subscription value; Stripe arrives as MRR.
  const stripeMrr = Math.max(0, toNumber(stripe?.revenue?.mrr));
  const stripeArr = stripeMrr * 12;
  const totalArr = roundMoney(stripeArr + hubspotOnlySubscriptionArr);
  const totalMrr = roundMoney(totalArr / 12);
  const stripeActiveSubscriptions = stripe?.subscriptions?.active ?? stripeRefs.length;

  return {
    stripeMrr,
    stripeMrrChange:
      stripe?.revenue?.mrrChange === null || stripe?.revenue?.mrrChange === undefined
        ? null
        : normalizePercentValue(toNumber(stripe.revenue.mrrChange)),
    hubspotSubscriptionMrr: roundMoney(hubspotSubscriptionArr / 12),
    hubspotOnlySubscriptionMrr: roundMoney(hubspotOnlySubscriptionArr / 12),
    excludedLinkedHubspotSubscriptionMrr: roundMoney(excludedLinkedHubspotSubscriptionArr / 12),
    totalMrr,
    totalArr,
    stripeActiveSubscriptions,
    hubspotActiveSubscriptions: hubspotDeals.length,
    hubspotOnlyActiveSubscriptions,
    mergedActiveSubscriptions: stripeActiveSubscriptions + hubspotOnlyActiveSubscriptions,
  };
}
