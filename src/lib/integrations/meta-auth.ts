const DEFAULT_GRAPH_VERSION = "v21.0";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getString(record: UnknownRecord | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeBearerToken(value: string): string {
  return value.replace(/^Bearer\s+/i, "").trim();
}

export function normalizeMetaAdAccountId(value: string): string {
  return value.trim().replace(/^act_/i, "");
}

function formatMetaError(raw: unknown): string {
  const record = asRecord(raw);
  const error = asRecord(record?.error);
  return (
    getString(error, "message") ||
    getString(record, "error_description") ||
    getString(record, "message") ||
    "Unknown error"
  );
}

async function readJsonOrText(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 500);
  }
}

async function fetchWithTimeout(
  url: URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function exchangeMetaForLongLivedToken(input: {
  accessToken: string;
  appId: string;
  appSecret: string;
  graphVersion?: string;
  timeoutMs?: number;
}): Promise<{
  accessToken: string;
  expiresAt: Date | null;
  tokenType: string | null;
  raw: unknown;
}> {
  const graphVersion = input.graphVersion ?? DEFAULT_GRAPH_VERSION;
  const timeoutMs = input.timeoutMs ?? 10_000;
  const shortLivedToken = normalizeBearerToken(input.accessToken);

  const url = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", input.appId);
  url.searchParams.set("client_secret", input.appSecret);
  url.searchParams.set("fb_exchange_token", shortLivedToken);

  const response = await fetchWithTimeout(url, { method: "GET" }, timeoutMs);
  const body = await readJsonOrText(response);
  if (!response.ok) {
    throw new Error(
      `Meta long-lived token exchange failed (${response.status}): ${formatMetaError(body)}`
    );
  }

  const payload = asRecord(body);
  const accessToken = getString(payload, "access_token");
  if (!accessToken) {
    throw new Error("Meta long-lived token response missing access_token");
  }

  const expiresInRaw = payload?.expires_in;
  let expiresIn: number | null = null;
  if (typeof expiresInRaw === "number" && Number.isFinite(expiresInRaw)) {
    expiresIn = expiresInRaw;
  } else if (typeof expiresInRaw === "string" && expiresInRaw.trim().length > 0) {
    const parsed = Number(expiresInRaw);
    expiresIn = Number.isFinite(parsed) ? parsed : null;
  }

  const expiresAt = expiresIn && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null;
  const tokenType = getString(payload, "token_type");

  return { accessToken, expiresAt, tokenType, raw: body };
}

export async function discoverMetaAdAccountId(input: {
  accessToken: string;
  graphVersion?: string;
  timeoutMs?: number;
}): Promise<string | null> {
  const graphVersion = input.graphVersion ?? DEFAULT_GRAPH_VERSION;
  const timeoutMs = input.timeoutMs ?? 10_000;
  const token = normalizeBearerToken(input.accessToken);
  if (!token) {
    return null;
  }

  const url = new URL(`https://graph.facebook.com/${graphVersion}/me/adaccounts`);
  url.searchParams.set("fields", "id,name,account_id");
  url.searchParams.set("limit", "200");

  const response = await fetchWithTimeout(
    url,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    },
    timeoutMs
  );

  const body = await readJsonOrText(response);
  if (!response.ok) {
    throw new Error(
      `Meta ad account discovery failed (${response.status}): ${formatMetaError(body)}`
    );
  }

  const payload = asRecord(body);
  for (const itemRaw of asArray(payload?.data)) {
    const item = asRecord(itemRaw);
    const id = getString(item, "id");
    const accountId = getString(item, "account_id");
    const candidate = id ?? accountId;
    if (candidate) {
      return normalizeMetaAdAccountId(candidate);
    }
  }

  return null;
}

export async function discoverMetaPageAndInstagram(input: {
  accessToken: string;
  graphVersion?: string;
  timeoutMs?: number;
}): Promise<{ pageId: string | null; instagramAccountId: string | null }> {
  const graphVersion = input.graphVersion ?? DEFAULT_GRAPH_VERSION;
  const timeoutMs = input.timeoutMs ?? 10_000;
  const token = normalizeBearerToken(input.accessToken);
  if (!token) {
    return { pageId: null, instagramAccountId: null };
  }

  const url = new URL(`https://graph.facebook.com/${graphVersion}/me/accounts`);
  url.searchParams.set(
    "fields",
    "id,name,instagram_business_account{id,username},connected_instagram_account{id,username}"
  );
  url.searchParams.set("limit", "200");

  const response = await fetchWithTimeout(
    url,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    },
    timeoutMs
  );

  const body = await readJsonOrText(response);
  if (!response.ok) {
    throw new Error(
      `Meta page discovery failed (${response.status}): ${formatMetaError(body)}`
    );
  }

  const payload = asRecord(body);
  let pageId: string | null = null;
  let instagramAccountId: string | null = null;

  for (const itemRaw of asArray(payload?.data)) {
    const item = asRecord(itemRaw);
    if (!pageId) {
      pageId = getString(item, "id");
    }

    if (!instagramAccountId) {
      const instagramBusiness = asRecord(item?.instagram_business_account);
      instagramAccountId = getString(instagramBusiness, "id");
    }

    if (!instagramAccountId) {
      const connectedInstagram = asRecord(item?.connected_instagram_account);
      instagramAccountId = getString(connectedInstagram, "id");
    }

    if (pageId && instagramAccountId) {
      break;
    }
  }

  // Fallback: if /me/accounts returned no pages, the token may be a Page
  // Access Token. In that case, /me returns the page itself.
  if (!pageId) {
    try {
      const meUrl = new URL(`https://graph.facebook.com/${graphVersion}/me`);
      meUrl.searchParams.set("fields", "id,name,instagram_business_account{id}");

      const meResponse = await fetchWithTimeout(
        meUrl,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        },
        timeoutMs
      );

      if (meResponse.ok) {
        const meBody = asRecord(await readJsonOrText(meResponse));
        const meId = getString(meBody, "id");
        if (meId) {
          pageId = meId;
          if (!instagramAccountId) {
            const igBiz = asRecord(meBody?.instagram_business_account);
            instagramAccountId = getString(igBiz, "id");
          }
        }
      }
    } catch {
      // Best-effort fallback
    }
  }

  return { pageId, instagramAccountId };
}

