#!/usr/bin/env node

"use strict";

let Client;
try {
  ({ Client } = require("pg"));
} catch (error) {
  console.error(
    "pg module is unavailable; install dependencies before running this script:",
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
}

// Load local .env when available; production platforms inject env vars directly.
try {
  require("dotenv/config");
} catch {}

const PROVIDERS = ["GOOGLE_ADS", "GOOGLE_WORKSPACE"];
const MISSING_SCOPES_PREFIX = "Missing required OAuth scopes:";

function canonicalizeScope(scope) {
  if (scope === "https://www.googleapis.com/auth/userinfo.email") return "email";
  if (scope === "https://www.googleapis.com/auth/userinfo.profile") return "profile";
  return scope;
}

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes)) return [];

  const normalized = [];
  const seen = new Set();

  for (const value of scopes) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function applyGoogleAliases(scopes) {
  const normalized = normalizeScopes(scopes);
  const present = new Set(normalized);
  let changed = false;

  if (
    present.has("https://www.googleapis.com/auth/userinfo.email") &&
    !present.has("email")
  ) {
    normalized.push("email");
    present.add("email");
    changed = true;
  }

  if (
    present.has("https://www.googleapis.com/auth/userinfo.profile") &&
    !present.has("profile")
  ) {
    normalized.push("profile");
    present.add("profile");
    changed = true;
  }

  return { scopes: normalized, changed };
}

function parseMissingScopes(lastError) {
  if (typeof lastError !== "string") return null;
  const trimmed = lastError.trim();
  if (!trimmed.startsWith(MISSING_SCOPES_PREFIX)) return null;

  const raw = trimmed.slice(MISSING_SCOPES_PREFIX.length).trim();
  if (!raw) return [];

  return raw
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function missingScopesSatisfied(missing, granted) {
  const grantedSet = new Set(granted.map(canonicalizeScope));
  return missing.every((scope) => grantedSet.has(canonicalizeScope(scope)));
}

function normalizeMetadata(metadata, shouldClear) {
  if (!shouldClear) return { metadata, changed: false };
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { metadata, changed: false };
  }

  const next = { ...metadata };
  let changed = false;

  if (next.insufficientScopes !== false) {
    next.insufficientScopes = false;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(next, "missingScopes")) {
    delete next.missingScopes;
    changed = true;
  }

  return { metadata: next, changed };
}

function shouldUseSsl() {
  return (
    process.env.NODE_ENV === "production" || process.env.DATABASE_SSL === "true"
  );
}

function withSslmode(url, enabled) {
  if (!enabled) return url;
  if (url.searchParams.has("sslmode")) return url;
  url.searchParams.set("sslmode", "no-verify");
  return url;
}

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const useSSL = shouldUseSsl();
  const url = withSslmode(new URL(connectionString), useSSL);

  const client = new Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 30000,
    ...(useSSL ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  await client.connect();

  try {
    const result = await client.query(
      `SELECT id, provider, scopes, "lastError", metadata
       FROM "IntegrationConnection"
       WHERE provider::text = ANY($1::text[])`,
      [PROVIDERS]
    );

    let updatedRows = 0;
    let scopesUpdated = 0;
    let clearedErrors = 0;

    await client.query("BEGIN");
    try {
      for (const row of result.rows) {
        const { scopes: nextScopes, changed: scopesChanged } = applyGoogleAliases(
          row.scopes
        );

        const missingScopes = parseMissingScopes(row.lastError);
        const shouldClear =
          Array.isArray(missingScopes) &&
          missingScopesSatisfied(missingScopes, nextScopes);

        const nextLastError = shouldClear ? null : row.lastError;
        const lastErrorChanged = nextLastError !== row.lastError;

        const { metadata: nextMetadata, changed: metadataChanged } = normalizeMetadata(
          row.metadata,
          shouldClear
        );

        if (!scopesChanged && !lastErrorChanged && !metadataChanged) {
          continue;
        }

        await client.query(
          `UPDATE "IntegrationConnection"
           SET scopes = $1::text[],
               "lastError" = $2,
               metadata = $3::jsonb
           WHERE id = $4`,
          [nextScopes, nextLastError, nextMetadata ?? null, row.id]
        );

        updatedRows += 1;
        if (scopesChanged) scopesUpdated += 1;
        if (shouldClear && lastErrorChanged) clearedErrors += 1;
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    console.log(
      JSON.stringify(
        {
          scannedRows: result.rowCount,
          updatedRows,
          scopesUpdated,
          clearedErrors,
        },
        null,
        2
      )
    );
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

