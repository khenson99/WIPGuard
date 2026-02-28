import type { StripeEmailEnrichment, StripeSubscriptionStatus } from "@/lib/analytics/types";

const STRIPE_API_BASE = "https://api.stripe.com/v1";

type StripeListResponse<T> = {
  data?: T[];
  has_more?: boolean;
};

type StripeCustomer = {
  id: string;
  created: number;
  email?: string | null;
};

type StripeSubscription = {
  id: string;
  status?: string | null;
  items?: {
    data?: Array<{
      price?: {
        unit_amount?: number | null;
        unit_amount_decimal?: string | null;
        recurring?: {
          interval?: string | null;
          interval_count?: number | null;
        } | null;
      } | null;
      plan?: {
        amount?: number | null;
        interval?: string | null;
        interval_count?: number | null;
      } | null;
    }>;
  } | null;
};

type StripeCharge = {
  id: string;
  amount?: number | null;
  amount_refunded?: number | null;
  created: number;
  status?: string | null;
  paid?: boolean | null;
};

function stripeCustomerUrl(customerId: string): string {
  return `https://dashboard.stripe.com/customers/${encodeURIComponent(customerId)}`;
}

function defaultEnrichment(kind: "none" | "unknown" = "none"): StripeEmailEnrichment {
  return {
    matched: false,
    customerId: null,
    customerCount: 0,
    customerUrl: null,
    subscriptionStatus: kind,
    mrr: null,
    paid12mo: null,
    lastPaymentAt: null,
  };
}

function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return email.length > 0 ? email : null;
}

function subscriptionStatusFromStripe(value: string | null | undefined): StripeSubscriptionStatus {
  const normalized = (value ?? "").trim().toLowerCase();
  switch (normalized) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "paused":
      return "paused";
    case "canceled":
      return "canceled";
    case "":
      return "unknown";
    default:
      return "unknown";
  }
}

function statusRank(status: StripeSubscriptionStatus): number {
  // Higher is better
  switch (status) {
    case "active":
      return 6;
    case "trialing":
      return 5;
    case "past_due":
      return 4;
    case "paused":
      return 3;
    case "canceled":
      return 2;
    case "none":
      return 1;
    case "unknown":
    default:
      return 0;
  }
}

function parseUnitAmountCents(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string") {
    const parsed = Number.parseFloat(input);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }
  return null;
}

function monthlyAmountFromRecurring(input: {
  unitAmountCents: number;
  interval: string | null | undefined;
  intervalCount: number | null | undefined;
}): number {
  const interval = (input.interval ?? "").toLowerCase();
  const intervalCount = Math.max(1, Math.floor(input.intervalCount ?? 1));
  const unitAmount = (input.unitAmountCents ?? 0) / 100;

  if (!Number.isFinite(unitAmount) || unitAmount <= 0) return 0;

  if (interval === "year") {
    return (unitAmount / 12) / intervalCount;
  }
  if (interval === "week") {
    return (unitAmount * 52) / (12 * intervalCount);
  }
  if (interval === "day") {
    return (unitAmount * 365) / (12 * intervalCount);
  }
  // Default: month (or unknown treated as month)
  return unitAmount / intervalCount;
}

function computeMrrFromSubscriptions(subscriptions: StripeSubscription[]): number | null {
  let sum = 0;

  for (const sub of subscriptions) {
    const status = subscriptionStatusFromStripe(sub.status);
    // "Current MRR" should reflect ongoing subscriptions.
    if (status !== "active" && status !== "trialing" && status !== "past_due") continue;

    const items = sub.items?.data ?? [];
    for (const item of items) {
      const price = item.price ?? null;
      const plan = item.plan ?? null;

      const unitAmountCents =
        parseUnitAmountCents(price?.unit_amount) ??
        parseUnitAmountCents(price?.unit_amount_decimal) ??
        parseUnitAmountCents(plan?.amount) ??
        0;

      const interval =
        price?.recurring?.interval ?? plan?.interval ?? "month";
      const intervalCount =
        price?.recurring?.interval_count ?? plan?.interval_count ?? 1;

      sum += monthlyAmountFromRecurring({
        unitAmountCents,
        interval,
        intervalCount,
      });
    }
  }

  if (!Number.isFinite(sum)) return null;
  return Math.round(sum * 100) / 100;
}

function computePrimarySubscriptionStatus(subscriptions: StripeSubscription[]): StripeSubscriptionStatus {
  if (subscriptions.length === 0) return "none";

  let best: StripeSubscriptionStatus = "none";
  for (const sub of subscriptions) {
    const status = subscriptionStatusFromStripe(sub.status);
    if (statusRank(status) > statusRank(best)) best = status;
  }
  return best;
}

async function fetchStripeJson(
  apiKey: string,
  url: string,
  timeoutMs: number
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(250, timeoutMs));

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await res.text().catch(() => "");
    const json = (() => {
      if (!text) return {};
      try {
        return JSON.parse(text);
      } catch {
        return {};
      }
    })();
    return { ok: res.ok, status: res.status, json, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function listCustomersByEmail(input: {
  apiKey: string;
  email: string;
  timeoutMs: number;
}): Promise<{ customers: StripeCustomer[]; usedFallback: boolean }> {
  // Attempt 1: customers.search (best match)
  const searchUrl = new URL(`${STRIPE_API_BASE}/customers/search`);
  searchUrl.searchParams.set("limit", "10");
  searchUrl.searchParams.set("query", `email:'${input.email.replaceAll("'", "\\'")}'`);

  const search = await fetchStripeJson(input.apiKey, searchUrl.toString(), input.timeoutMs);
  if (search.ok) {
    const parsed = search.json as StripeListResponse<StripeCustomer>;
    const customers = (parsed.data ?? []).filter((c) => typeof c?.id === "string");
    return { customers, usedFallback: false };
  }

  // Attempt 2: list customers filtered by email (works even without search)
  if (search.status >= 400 && search.status < 500) {
    const listUrl = new URL(`${STRIPE_API_BASE}/customers`);
    listUrl.searchParams.set("limit", "10");
    listUrl.searchParams.set("email", input.email);
    const list = await fetchStripeJson(input.apiKey, listUrl.toString(), input.timeoutMs);
    if (!list.ok) {
      return { customers: [], usedFallback: true };
    }
    const parsed = list.json as StripeListResponse<StripeCustomer>;
    const customers = (parsed.data ?? []).filter((c) => typeof c?.id === "string");
    return { customers, usedFallback: true };
  }

  return { customers: [], usedFallback: true };
}

async function listSubscriptionsForCustomer(input: {
  apiKey: string;
  customerId: string;
  timeoutMs: number;
}): Promise<StripeSubscription[]> {
  const url = new URL(`${STRIPE_API_BASE}/subscriptions`);
  url.searchParams.set("limit", "100");
  url.searchParams.set("customer", input.customerId);
  url.searchParams.set("status", "all");

  const res = await fetchStripeJson(input.apiKey, url.toString(), input.timeoutMs);
  if (!res.ok) return [];

  const parsed = res.json as StripeListResponse<StripeSubscription>;
  return (parsed.data ?? []).filter((s) => typeof s?.id === "string");
}

async function chargesPaid12moForCustomer(input: {
  apiKey: string;
  customerId: string;
  now: Date;
  timeoutMs: number;
  maxPages?: number;
}): Promise<{ paid12mo: number | null; lastPaymentAt: string | null }> {
  const createdGte = Math.floor((input.now.getTime() - 365 * 24 * 60 * 60 * 1000) / 1000);
  const maxPages = Math.max(1, Math.min(input.maxPages ?? 5, 20));

  let startingAfter: string | null = null;
  let totalCents = 0;
  let lastPaymentCreated = 0;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${STRIPE_API_BASE}/charges`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("customer", input.customerId);
    url.searchParams.set("created[gte]", String(createdGte));
    if (startingAfter) url.searchParams.set("starting_after", startingAfter);

    const res = await fetchStripeJson(input.apiKey, url.toString(), input.timeoutMs);
    if (!res.ok) break;

    const parsed = res.json as StripeListResponse<StripeCharge>;
    const batch = parsed.data ?? [];
    if (batch.length === 0) break;

    for (const charge of batch) {
      if (charge.status !== "succeeded") continue;
      if (charge.paid === false) continue;

      const amount = charge.amount ?? 0;
      const refunded = charge.amount_refunded ?? 0;
      const net = Math.max(0, amount - refunded);
      totalCents += net;
      if (charge.created > lastPaymentCreated) lastPaymentCreated = charge.created;
    }

    if (!parsed.has_more) break;
    startingAfter = batch[batch.length - 1]?.id ?? null;
    if (!startingAfter) break;
  }

  const paid12mo = Math.round((totalCents / 100) * 100) / 100;
  const lastPaymentAt =
    lastPaymentCreated > 0 ? new Date(lastPaymentCreated * 1000).toISOString() : null;

  return {
    paid12mo: Number.isFinite(paid12mo) ? paid12mo : null,
    lastPaymentAt,
  };
}

async function enrichOneEmail(input: {
  apiKey: string;
  email: string;
  now: Date;
  timeoutMs: number;
}): Promise<StripeEmailEnrichment> {
  const email = normalizeEmail(input.email);
  if (!email) return defaultEnrichment("none");

  const { customers } = await listCustomersByEmail({
    apiKey: input.apiKey,
    email,
    timeoutMs: input.timeoutMs,
  });

  if (customers.length === 0) {
    return defaultEnrichment("none");
  }

  const sortedCustomers = [...customers].sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  const candidates = sortedCustomers.slice(0, 3);

  const customerSummaries = await Promise.all(
    candidates.map(async (customer) => {
      const subs = await listSubscriptionsForCustomer({
        apiKey: input.apiKey,
        customerId: customer.id,
        timeoutMs: input.timeoutMs,
      });
      const status = computePrimarySubscriptionStatus(subs);
      const mrr = computeMrrFromSubscriptions(subs);
      return { customer, status, mrr };
    })
  );

  const primary = [...customerSummaries].sort((a, b) => {
    const rank = statusRank(b.status) - statusRank(a.status);
    if (rank !== 0) return rank;
    const mrrDelta = (b.mrr ?? 0) - (a.mrr ?? 0);
    if (mrrDelta !== 0) return mrrDelta > 0 ? 1 : -1;
    return (b.customer.created ?? 0) - (a.customer.created ?? 0);
  })[0]!;

  const charges = await chargesPaid12moForCustomer({
    apiKey: input.apiKey,
    customerId: primary.customer.id,
    now: input.now,
    timeoutMs: input.timeoutMs,
  });

  return {
    matched: true,
    customerId: primary.customer.id,
    customerCount: customers.length,
    customerUrl: stripeCustomerUrl(primary.customer.id),
    subscriptionStatus: primary.status,
    mrr: primary.mrr,
    paid12mo: charges.paid12mo,
    lastPaymentAt: charges.lastPaymentAt,
  };
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const limit = Math.max(1, Math.min(concurrency, 25));
  const results: R[] = [];
  let index = 0;

  const workers = Array.from({ length: limit }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      results.push(await fn(current));
    }
  });

  await Promise.all(workers);
  return results;
}

export async function enrichStripeEmails(input: {
  apiKey: string | null | undefined;
  emails: string[];
  now?: Date;
  concurrency?: number;
  timeoutMs?: number;
}): Promise<Map<string, StripeEmailEnrichment>> {
  const apiKey = input.apiKey?.trim() ?? null;
  const now = input.now ?? new Date();
  const timeoutMs = Math.max(250, Math.min(input.timeoutMs ?? 2500, 8000));
  const concurrency = Math.max(1, Math.min(input.concurrency ?? 4, 10));

  const normalized = Array.from(
    new Set(input.emails.map((email) => normalizeEmail(email)).filter(Boolean))
  ) as string[];

  const byEmail = new Map<string, StripeEmailEnrichment>();
  if (!apiKey || normalized.length === 0) return byEmail;

  const results = await runWithConcurrency(normalized, concurrency, async (email) => {
    try {
      const enrichment = await enrichOneEmail({ apiKey, email, now, timeoutMs });
      return { email, enrichment };
    } catch {
      return { email, enrichment: defaultEnrichment("unknown") };
    }
  });

  for (const entry of results) {
    byEmail.set(entry.email, entry.enrichment);
  }

  return byEmail;
}

