/**
 * End-to-end regression for env-managed Meta health checks.
 *
 * Uses the REAL getCredentials and the REAL runIntegrationHealthChecks with
 * only Prisma (stateful in-memory store) and global.fetch mocked. The fetch
 * mock rejects any bearer token other than the env credential, mirroring the
 * Graph API.
 *
 * Bug being guarded against: the first health-check run persisted placeholder
 * connection rows (accessToken "env-managed" / NULL) with a non-DISCONNECTED
 * status. getCredentials treated any non-DISCONNECTED row as an authoritative
 * connection, disabling the META env fallback, so the second run (and even
 * later checks within the same run) failed with "Missing Meta Page credential"
 * and re-persisted ERROR — a self-perpetuating failure.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IntegrationConnectionStatus,
  IntegrationProvider,
} from "@/generated/prisma/client";

type StoredRow = {
  userId: string;
  provider: IntegrationProvider;
  status: IntegrationConnectionStatus;
  accessToken: string | null;
  refreshToken: string | null;
  tokenType: string | null;
  expiresAt: Date | null;
  scopes: string[];
  metadata: unknown;
  connectedAt: Date;
  lastSyncedAt: Date | null;
  lastError: string | null;
};

const { connectionStore } = vi.hoisted(() => ({
  connectionStore: new Map<string, StoredRow>(),
}));

function rowKey(userId: string, provider: string): string {
  return `${userId}:${provider}`;
}

vi.mock("@/lib/prisma", () => {
  const matchesStatus = (row: StoredRow, statusClause: unknown): boolean => {
    if (statusClause === undefined) return true;
    if (typeof statusClause === "string") return row.status === statusClause;
    const inClause = (statusClause as { in?: string[] })?.in;
    if (Array.isArray(inClause)) return inClause.includes(row.status);
    return true;
  };

  return {
    prisma: {
      integrationConnection: {
        findMany: vi.fn(
          async (args?: {
            where?: { userId?: string; status?: unknown };
          }) =>
            Array.from(connectionStore.values()).filter(
              (row) =>
                (!args?.where?.userId || row.userId === args.where.userId) &&
                matchesStatus(row, args?.where?.status),
            ),
        ),
        findUnique: vi.fn(
          async (args: {
            where: { userId_provider: { userId: string; provider: string } };
          }) =>
            connectionStore.get(
              rowKey(
                args.where.userId_provider.userId,
                args.where.userId_provider.provider,
              ),
            ) ?? null,
        ),
        findFirst: vi.fn(async () => null),
        update: vi.fn(
          async (args: {
            where: { userId_provider: { userId: string; provider: string } };
            data: Partial<StoredRow>;
          }) => {
            const key = rowKey(
              args.where.userId_provider.userId,
              args.where.userId_provider.provider,
            );
            const existing = connectionStore.get(key);
            if (!existing) {
              const error = new Error("Record to update not found");
              (error as Error & { code?: string }).code = "P2025";
              throw error;
            }
            const next = { ...existing, ...args.data };
            connectionStore.set(key, next);
            return next;
          },
        ),
        updateMany: vi.fn(
          async (args: {
            where: { userId: string; provider: string };
            data: Partial<StoredRow>;
          }) => {
            const key = rowKey(args.where.userId, args.where.provider);
            const existing = connectionStore.get(key);
            if (!existing) {
              return { count: 0 };
            }
            connectionStore.set(key, { ...existing, ...args.data });
            return { count: 1 };
          },
        ),
        upsert: vi.fn(
          async (args: {
            where: { userId_provider: { userId: string; provider: string } };
            create: Partial<StoredRow>;
            update: Partial<StoredRow>;
          }) => {
            const { userId, provider } = args.where.userId_provider;
            const key = rowKey(userId, provider);
            const existing = connectionStore.get(key);
            if (existing) {
              const next = { ...existing, ...args.update };
              connectionStore.set(key, next);
              return next;
            }
            const created: StoredRow = {
              userId,
              provider: provider as IntegrationProvider,
              status:
                (args.create.status as IntegrationConnectionStatus) ??
                IntegrationConnectionStatus.DISCONNECTED,
              accessToken: args.create.accessToken ?? null,
              refreshToken: args.create.refreshToken ?? null,
              tokenType: args.create.tokenType ?? null,
              expiresAt: args.create.expiresAt ?? null,
              scopes: args.create.scopes ?? [],
              metadata: args.create.metadata ?? null,
              connectedAt: new Date("2026-06-01T00:00:00.000Z"),
              lastSyncedAt: args.create.lastSyncedAt ?? null,
              lastError: args.create.lastError ?? null,
            };
            connectionStore.set(key, created);
            return created;
          },
        ),
      },
    },
  };
});

const ENV_TOKEN = "meta-env-token";
const PAGE_SCOPED_TOKEN = "page-scoped-token";
const PAGE_ID = "417375498119621";
const USER_ID = "localdev_5z5ueqq0";

// Every env var that can make hasIntegrationCredential() true for some
// provider. Cleared so the run is hermetic: only the Meta env credentials
// set by each test are visible to the real getCredentials().
const PROVIDER_ENV_KEYS = [
  "INTEGRATION_OWNER_USER_ID",
  "HUBSPOT_ACCESS_TOKEN",
  "CODA_API_TOKEN",
  "CODA_DOC_ID",
  "REDDIT_CLIENT_ID",
  "REDDIT_CLIENT_SECRET",
  "REDDIT_REFRESH_TOKEN",
  "REDDIT_AD_ACCOUNT_ID",
  "REDDIT_USER_AGENT",
  "STRIPE_SECRET_KEY",
  "MERCURY_API_TOKEN",
  "WEBFLOW_API_TOKEN",
  "WEBFLOW_SITE_ID",
  "SEMRUSH_API_TOKEN",
  "SEMRUSH_API_KEY",
  "SEMRUSH_DOMAIN",
  "PYLON_API_KEY",
  "PYLON_API_BASE_URL",
  "META_ACCESS_TOKEN",
  "META_AD_ACCOUNT_ID",
  "META_PAGE_ID",
  "META_INSTAGRAM_ACCOUNT_ID",
  "META_APP_ID",
  "META_APP_SECRET",
  "META_CLIENT_ID",
  "META_CLIENT_SECRET",
  "POSTHOG_API_KEY",
  "POSTHOG_PERSONAL_API_KEY",
  "POSTHOG_PROJECT_ID",
  "POSTHOG_HOST",
  "POSTHOG_API_HOST",
  "LINEAR_API_KEY",
  "LINEAR_TOKEN",
  "GITHUB_TOKEN",
  "GITHUB_ACCESS_TOKEN",
  "GITHUB_REPO_OWNER",
  "GITHUB_OWNER",
  "GITHUB_REPO_NAME",
  "GITHUB_REPO",
  "UNIFY_DATA_API_KEY",
  "UNIFY_API_KEY",
  "UNIFY_FUNNEL_OBJECT_NAME",
  "GA_PROPERTY_ID",
  "GA_CLIENT_EMAIL",
  "GA_PRIVATE_KEY",
  "GA_REFRESH_TOKEN",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN",
  "GSC_ACCESS_TOKEN",
  "GOOGLE_SEARCH_CONSOLE_SITE_URL",
  "GSC_SITE_URL",
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_CUSTOMER_ID",
  "GOOGLE_ADS_REFRESH_TOKEN",
  "GOOGLE_ADS_CLIENT_ID",
  "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
] as const;

function graphJson(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Graph API stand-in. Crucially it AUTHENTICATES: any bearer other than the
 * env token (or the page-scoped token it hands out) is rejected, so a check
 * that resolves the wrong credential fails the same way it would in
 * production.
 */
function buildGraphFetchMock(): typeof global.fetch {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const authorization = headers.get("Authorization") ?? "";
    const bearerOk =
      authorization === `Bearer ${ENV_TOKEN}` ||
      authorization === `Bearer ${PAGE_SCOPED_TOKEN}`;
    const tokenParamOk = url.searchParams.get("access_token") === ENV_TOKEN;
    if (!bearerOk && !tokenParamOk) {
      return graphJson(
        { error: { message: "Invalid OAuth access token.", code: 190 } },
        401,
      );
    }

    if (url.pathname.endsWith("/me/accounts")) {
      return graphJson({
        data: [{ id: PAGE_ID, access_token: PAGE_SCOPED_TOKEN }],
      });
    }
    if (url.pathname.includes("act_") && url.pathname.endsWith("/insights")) {
      return graphJson({
        data: [{ spend: "0", impressions: "0", clicks: "0" }],
      });
    }
    if (
      url.pathname.endsWith(`/${PAGE_ID}`) &&
      !url.pathname.endsWith(`/${PAGE_ID}/posts`)
    ) {
      return graphJson({ fan_count: 10, followers_count: 12 });
    }
    return graphJson({ data: [] });
  }) as typeof global.fetch;
}

describe("env-managed Meta health checks with real credential resolution", () => {
  const originalFetch = global.fetch;
  const savedEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    connectionStore.clear();
    for (const key of PROVIDER_ENV_KEYS) {
      savedEnv.set(key, process.env[key]);
      delete process.env[key];
    }
    process.env.META_ACCESS_TOKEN = ENV_TOKEN;
    process.env.META_AD_ACCOUNT_ID = "act_12345";
    process.env.META_PAGE_ID = PAGE_ID;
    process.env.META_INSTAGRAM_ACCOUNT_ID = "ig_12345";
    global.fetch = buildGraphFetchMock();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    for (const [key, value] of savedEnv) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    savedEnv.clear();
  });

  it("passes META checks on two consecutive runs (rows from run 1 must not poison run 2)", async () => {
    const { runIntegrationHealthChecks } = await import(
      "@/lib/integrations/health-checks"
    );

    const firstRun = await runIntegrationHealthChecks({ userId: USER_ID });
    expect(firstRun.results).toEqual(
      expect.arrayContaining([
        { provider: IntegrationProvider.META_ADS, ok: true, message: null },
        { provider: IntegrationProvider.META_PAGE, ok: true, message: null },
      ]),
    );
    expect(firstRun.checked).toBe(2);
    expect(firstRun.failed).toBe(0);

    // Run 1 persisted health rows for both providers — without real tokens.
    const adsRow = connectionStore.get(rowKey(USER_ID, "META_ADS"));
    const pageRow = connectionStore.get(rowKey(USER_ID, "META_PAGE"));
    expect(adsRow?.status).toBe(IntegrationConnectionStatus.CONNECTED);
    expect(pageRow?.status).toBe(IntegrationConnectionStatus.CONNECTED);
    expect(adsRow?.accessToken).toBeNull();
    expect(pageRow?.accessToken).toBeNull();

    const secondRun = await runIntegrationHealthChecks({ userId: USER_ID });
    expect(secondRun.results).toEqual(
      expect.arrayContaining([
        { provider: IntegrationProvider.META_ADS, ok: true, message: null },
        { provider: IntegrationProvider.META_PAGE, ok: true, message: null },
      ]),
    );
    expect(secondRun.checked).toBe(2);
    expect(secondRun.failed).toBe(0);

    expect(
      connectionStore.get(rowKey(USER_ID, "META_ADS"))?.lastError,
    ).toBeNull();
    expect(
      connectionStore.get(rowKey(USER_ID, "META_PAGE"))?.lastError,
    ).toBeNull();
  });

  it("heals rows poisoned by earlier runs (NULL and 'env-managed' placeholder tokens)", async () => {
    // Exact state observed in the dev database after the buggy loop ran.
    connectionStore.set(rowKey(USER_ID, "META_ADS"), {
      userId: USER_ID,
      provider: IntegrationProvider.META_ADS,
      status: IntegrationConnectionStatus.ERROR,
      accessToken: null,
      refreshToken: null,
      tokenType: null,
      expiresAt: null,
      scopes: [],
      metadata: null,
      connectedAt: new Date("2026-06-01T00:00:00.000Z"),
      lastSyncedAt: null,
      lastError: "Missing Meta access token",
    });
    connectionStore.set(rowKey(USER_ID, "META_PAGE"), {
      userId: USER_ID,
      provider: IntegrationProvider.META_PAGE,
      status: IntegrationConnectionStatus.ERROR,
      accessToken: "env-managed",
      refreshToken: null,
      tokenType: null,
      expiresAt: null,
      scopes: [],
      metadata: null,
      connectedAt: new Date("2026-06-01T00:00:00.000Z"),
      lastSyncedAt: null,
      lastError: "Missing Meta Page credential",
    });

    const { runIntegrationHealthChecks } = await import(
      "@/lib/integrations/health-checks"
    );
    const result = await runIntegrationHealthChecks({ userId: USER_ID });

    expect(result.checked).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.results).toEqual(
      expect.arrayContaining([
        { provider: IntegrationProvider.META_ADS, ok: true, message: null },
        { provider: IntegrationProvider.META_PAGE, ok: true, message: null },
      ]),
    );

    const adsRow = connectionStore.get(rowKey(USER_ID, "META_ADS"));
    const pageRow = connectionStore.get(rowKey(USER_ID, "META_PAGE"));
    expect(adsRow?.status).toBe(IntegrationConnectionStatus.CONNECTED);
    expect(adsRow?.lastError).toBeNull();
    expect(pageRow?.status).toBe(IntegrationConnectionStatus.CONNECTED);
    expect(pageRow?.lastError).toBeNull();
  });

  it("resolves Meta env credentials via the real getCredentials even when placeholder rows exist", async () => {
    connectionStore.set(rowKey(USER_ID, "META_PAGE"), {
      userId: USER_ID,
      provider: IntegrationProvider.META_PAGE,
      status: IntegrationConnectionStatus.ERROR,
      accessToken: "env-managed",
      refreshToken: null,
      tokenType: null,
      expiresAt: null,
      scopes: [],
      metadata: null,
      connectedAt: new Date("2026-06-01T00:00:00.000Z"),
      lastSyncedAt: null,
      lastError: "Missing Meta Page credential",
    });

    const { getCredentials } = await import("@/lib/analytics/credentials");
    const creds = await getCredentials(USER_ID);

    expect(creds.metaPageAccessToken).toBe(ENV_TOKEN);
    expect(creds.metaAdsAccessToken).toBe(ENV_TOKEN);
    expect(creds.metaPageId).toBe(PAGE_ID);
    expect(creds.metaAdAccountId).toBe("act_12345");
  });
});
