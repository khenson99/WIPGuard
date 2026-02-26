#!/usr/bin/env node

const META_GRAPH_VERSION = "v21.0";
const REQUIRED_AD_PERMISSIONS = ["ads_read", "ads_management"];

function envOrNull(key) {
  const value = process.env[key];
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBearerToken(value) {
  return value.replace(/^Bearer\s+/i, "").trim();
}

function normalizeMetaAdAccountId(adAccountId) {
  return adAccountId.trim().replace(/^act_/i, "");
}

function looksLikeMetaAppAccessToken(accessToken) {
  const normalized = accessToken.trim();
  return normalized.length > 0 && /^\d+\|/.test(normalized);
}

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function pickString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function pickBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function formatMetaError(raw) {
  const record = asRecord(raw);
  const error = asRecord(record?.error);
  const message =
    pickString(error?.message) ||
    pickString(record?.error_description) ||
    pickString(record?.message);
  return message || "Unknown error";
}

async function readJsonOrText(response) {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 500);
  }
}

async function fetchWithTimeout(url, init, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

function extractScopesFromDebugToken(data) {
  const scopes = new Set();
  for (const scope of asArray(data?.scopes)) {
    if (typeof scope === "string" && scope.trim()) scopes.add(scope.trim());
  }

  for (const granular of asArray(data?.granular_scopes)) {
    const record = asRecord(granular);
    const scope = pickString(record?.scope);
    if (scope) scopes.add(scope);
  }

  return Array.from(scopes);
}

function hasAnyRequiredScope(grantedScopes) {
  const set = new Set(grantedScopes);
  return REQUIRED_AD_PERMISSIONS.some((scope) => set.has(scope));
}

async function main() {
  const rawToken = envOrNull("META_ACCESS_TOKEN");
  const rawAccountId = envOrNull("META_AD_ACCOUNT_ID");

  if (!rawToken || !rawAccountId) {
    console.error("[fail] Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID.");
    process.exitCode = 1;
    return;
  }

  const token = normalizeBearerToken(rawToken);
  const accountId = normalizeMetaAdAccountId(rawAccountId);

  if (looksLikeMetaAppAccessToken(token)) {
    console.error(
      "[fail] META_ACCESS_TOKEN looks like an app access token (app_id|app_secret). Use a User/System User token generated in Business Settings with ads_read or ads_management."
    );
    process.exitCode = 1;
    return;
  }

  console.log("[ok] Token is not an app access token.");

  // 1) Validate token works with /me
  {
    const meUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/me`);
    meUrl.searchParams.set("fields", "id,name");

    const response = await fetchWithTimeout(meUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await readJsonOrText(response);
    if (!response.ok) {
      console.error(
        `[fail] Meta /me check failed (${response.status}): ${formatMetaError(body)}`
      );
      process.exitCode = 1;
      return;
    }

    const me = asRecord(body);
    console.log(
      `[ok] Meta /me reachable (id=${pickString(me?.id) ?? "unknown"}, name=${pickString(me?.name) ?? "unknown"}).`
    );
  }

  // 2) Validate scopes
  let grantedScopes = [];
  const appId = envOrNull("META_APP_ID");
  const appSecret = envOrNull("META_APP_SECRET");

  if (appId && appSecret) {
    const debugUrl = new URL(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/debug_token`
    );
    debugUrl.searchParams.set("input_token", token);
    debugUrl.searchParams.set("access_token", `${appId}|${appSecret}`);

    const response = await fetchWithTimeout(debugUrl, { method: "GET" });
    const body = await readJsonOrText(response);
    if (!response.ok) {
      console.error(
        `[fail] Meta debug_token failed (${response.status}): ${formatMetaError(body)}`
      );
      process.exitCode = 1;
      return;
    }

    const data = asRecord(asRecord(body)?.data);
    const isValid = pickBoolean(data?.is_valid);
    if (isValid === false) {
      console.error("[fail] Meta token is not valid per debug_token.");
      process.exitCode = 1;
      return;
    }

    grantedScopes = extractScopesFromDebugToken(data);
    console.log(`[ok] debug_token scopes loaded (${grantedScopes.length} scopes).`);
  } else {
    const permissionsUrl = new URL(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/me/permissions`
    );
    const response = await fetchWithTimeout(permissionsUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await readJsonOrText(response);
    if (!response.ok) {
      console.error(
        `[fail] Meta /me/permissions failed (${response.status}): ${formatMetaError(body)}`
      );
      process.exitCode = 1;
      return;
    }

    const granted = new Set();
    const payload = asRecord(body);
    for (const item of asArray(payload?.data)) {
      const record = asRecord(item);
      const permission = pickString(record?.permission);
      const status = pickString(record?.status);
      if (permission && status === "granted") {
        granted.add(permission);
      }
    }
    grantedScopes = Array.from(granted);
    console.log(`[ok] /me/permissions loaded (${grantedScopes.length} granted permissions).`);
  }

  if (!hasAnyRequiredScope(grantedScopes)) {
    console.error(
      `[fail] Missing required Meta Ads permissions: need ${REQUIRED_AD_PERMISSIONS.join(
        " or "
      )}. Re-generate a System User token with ads_read and/or ads_management.`
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `[ok] Token has required ads permission (${REQUIRED_AD_PERMISSIONS
      .filter((s) => grantedScopes.includes(s))
      .join(", ") || "unknown"}).`
  );

  // 3) Validate ad account visibility
  {
    const accountsUrl = new URL(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/me/adaccounts`
    );
    accountsUrl.searchParams.set("fields", "id,name");
    accountsUrl.searchParams.set("limit", "200");

    const response = await fetchWithTimeout(accountsUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await readJsonOrText(response);
    if (!response.ok) {
      console.error(
        `[fail] Meta /me/adaccounts failed (${response.status}): ${formatMetaError(body)}`
      );
      process.exitCode = 1;
      return;
    }

    const payload = asRecord(body);
    const accounts = asArray(payload?.data)
      .map((item) => asRecord(item))
      .filter(Boolean);

    const expectedIds = new Set([accountId, `act_${accountId}`]);
    const hasAccount = accounts.some((acc) => {
      const id = pickString(acc?.id);
      return id ? expectedIds.has(id) : false;
    });

    if (!hasAccount) {
      console.error(
        `[fail] Token cannot see ad account act_${accountId}. Assign the System User to the ad account in Business Settings (Assets → Ad accounts) and regenerate the token.`
      );
      process.exitCode = 1;
      return;
    }

    console.log(`[ok] Token can see configured ad account (act_${accountId}).`);
  }

  // 4) Validate actual insights access
  {
    const insightsUrl = new URL(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/act_${accountId}/insights`
    );
    insightsUrl.searchParams.set("fields", "spend");
    insightsUrl.searchParams.set("date_preset", "last_7d");
    insightsUrl.searchParams.set("level", "account");
    insightsUrl.searchParams.set("limit", "1");

    const response = await fetchWithTimeout(insightsUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await readJsonOrText(response);
    if (!response.ok) {
      console.error(
        `[fail] Meta insights check failed (${response.status}): ${formatMetaError(body)}`
      );
      process.exitCode = 1;
      return;
    }

    console.log("[ok] Meta Ads insights endpoint is accessible.");
  }

  console.log("Result: PASS (Meta token has ads permissions and ad account access)");
}

await main();
