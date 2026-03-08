"use client";

const ANON_STORAGE_KEY = "wipguard:funnel:anonymous-id";
const SESSION_STORAGE_KEY = "wipguard:funnel:session-id";
const AUTH_TRACKED_PREFIX = "wipguard:funnel:auth-tracked:";
const COOKIE_NAME = "wipguard_funnel_anon_id";

export type ClientFunnelEventType =
  | "PAGE_VIEW"
  | "SESSION_STARTED"
  | "AUTH_COMPLETED";

type ClientCollectPayload = {
  anonymousId: string;
  eventType: ClientFunnelEventType;
  occurredAt: string;
  path: string;
  url: string;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  userId?: string | null;
  email?: string | null;
  dedupeKey?: string | null;
  metadata?: Record<string, unknown>;
};

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const parts = document.cookie.split(";");
  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (part.startsWith(prefix)) {
      const value = decodeURIComponent(part.slice(prefix.length));
      return value || null;
    }
  }
  return null;
}

function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function getOrCreateAnonymousId(): string {
  if (typeof window === "undefined") return createId("anon");

  const stored = window.localStorage.getItem(ANON_STORAGE_KEY);
  const cookieValue = readCookie(COOKIE_NAME);
  const existing = stored || cookieValue;
  if (existing) {
    if (!stored) window.localStorage.setItem(ANON_STORAGE_KEY, existing);
    if (!cookieValue) writeCookie(COOKIE_NAME, existing);
    return existing;
  }

  const next = createId("anon");
  window.localStorage.setItem(ANON_STORAGE_KEY, next);
  writeCookie(COOKIE_NAME, next);
  return next;
}

export function getOrCreateBrowserSessionId(): string {
  if (typeof window === "undefined") return createId("session");
  const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;
  const next = createId("session");
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, next);
  return next;
}

function currentUtmParams(): {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
} {
  if (typeof window === "undefined") {
    return { utmSource: null, utmMedium: null, utmCampaign: null };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    utmSource: params.get("utm_source"),
    utmMedium: params.get("utm_medium"),
    utmCampaign: params.get("utm_campaign"),
  };
}

export async function collectClientFunnelEvent(
  input: Omit<ClientCollectPayload, "anonymousId" | "occurredAt" | "url" | "referrer" | "utmSource" | "utmMedium" | "utmCampaign"> & {
    dedupeKey?: string | null;
  },
): Promise<void> {
  if (typeof window === "undefined") return;

  const anonymousId = getOrCreateAnonymousId();
  const sessionId = getOrCreateBrowserSessionId();
  const { utmSource, utmMedium, utmCampaign } = currentUtmParams();

  const payload: ClientCollectPayload = {
    anonymousId,
    eventType: input.eventType,
    occurredAt: new Date().toISOString(),
    path: input.path,
    url: window.location.href,
    referrer: document.referrer || null,
    utmSource,
    utmMedium,
    utmCampaign,
    userId: input.userId ?? null,
    email: input.email ?? null,
    dedupeKey: input.dedupeKey ?? `${input.eventType.toLowerCase()}:${sessionId}:${input.path}`,
    metadata: input.metadata,
  };

  try {
    await fetch("/api/analytics/funnel/collect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // Best-effort analytics capture.
  }
}

export function wasAuthTracked(userId: string): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(`${AUTH_TRACKED_PREFIX}${userId}`) === "1";
}

export function markAuthTracked(userId: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(`${AUTH_TRACKED_PREFIX}${userId}`, "1");
}
