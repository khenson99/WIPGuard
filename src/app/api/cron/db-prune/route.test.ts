import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const afterCallbacks: Array<() => void | Promise<void>> = [];

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn((callback: () => void | Promise<void>) => {
      afterCallbacks.push(callback);
    }),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

vi.mock("@/lib/db-pruning/prune", () => ({
  runDbPrune: vi.fn(),
}));

const ENV_KEYS = [
  "CRON_SYNC_SECRET",
  "INTEGRATION_SYNC_SECRET",
  "DB_PRUNE_FORCE_DRY_RUN",
] as const;
const savedEnv: Record<string, string | undefined> = {};

function makeRequest(input: {
  url?: string;
  secret?: string;
  body?: unknown;
}): NextRequest {
  return new Request(input.url ?? "http://localhost/api/cron/db-prune", {
    method: "POST",
    headers: {
      ...(input.secret ? { "x-cron-secret": input.secret } : {}),
      "content-type": "application/json",
    },
    ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
  }) as unknown as NextRequest;
}

function okRunResult(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    dryRun: false,
    startedAt: "2026-06-10T00:00:00.000Z",
    finishedAt: "2026-06-10T00:00:05.000Z",
    durationMs: 5000,
    totalRows: 123,
    truncated: false,
    policy: {},
    tables: [],
    ...overrides,
  };
}

describe("POST /api/cron/db-prune", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    afterCallbacks.length = 0;
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env.CRON_SYNC_SECRET = "cron-secret";
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it("rejects requests without the cron secret", async () => {
    const { POST } = await import("@/app/api/cron/db-prune/route");
    const response = await POST(makeRequest({}));

    expect(response.status).toBe(401);
  });

  it("rejects requests with a wrong secret", async () => {
    const { POST } = await import("@/app/api/cron/db-prune/route");
    const response = await POST(makeRequest({ secret: "wrong" }));

    expect(response.status).toBe(401);
  });

  it("rejects every request when no secret is configured", async () => {
    delete process.env.CRON_SYNC_SECRET;
    const { POST } = await import("@/app/api/cron/db-prune/route");
    const response = await POST(makeRequest({ secret: "anything" }));

    expect(response.status).toBe(401);
  });

  it("queues a background run by default and responds 202", async () => {
    const { runDbPrune } = await import("@/lib/db-pruning/prune");
    vi.mocked(runDbPrune).mockResolvedValue(okRunResult() as never);

    const { POST } = await import("@/app/api/cron/db-prune/route");
    const response = await POST(makeRequest({ secret: "cron-secret" }));
    const body = (await response.json()) as { queued: boolean; dryRun: boolean };

    expect(response.status).toBe(202);
    expect(body.queued).toBe(true);
    expect(body.dryRun).toBe(false);
    expect(runDbPrune).not.toHaveBeenCalled();

    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]();
    expect(runDbPrune).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runDbPrune).mock.calls[0][0]).toMatchObject({ dryRun: false });
  });

  it("runs inline with ?wait=1 and returns the full result", async () => {
    const { runDbPrune } = await import("@/lib/db-pruning/prune");
    vi.mocked(runDbPrune).mockResolvedValue(okRunResult() as never);

    const { POST } = await import("@/app/api/cron/db-prune/route");
    const response = await POST(
      makeRequest({
        url: "http://localhost/api/cron/db-prune?wait=1",
        secret: "cron-secret",
      }),
    );
    const body = (await response.json()) as { ok: boolean; totalRows: number };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.totalRows).toBe(123);
  });

  it("returns 500 when an inline run reports table errors", async () => {
    const { runDbPrune } = await import("@/lib/db-pruning/prune");
    vi.mocked(runDbPrune).mockResolvedValue(okRunResult({ ok: false }) as never);

    const { POST } = await import("@/app/api/cron/db-prune/route");
    const response = await POST(
      makeRequest({
        url: "http://localhost/api/cron/db-prune?wait=1",
        secret: "cron-secret",
      }),
    );

    expect(response.status).toBe(500);
  });

  it("returns 500 when an inline run throws", async () => {
    const { runDbPrune } = await import("@/lib/db-pruning/prune");
    vi.mocked(runDbPrune).mockRejectedValue(new Error("boom"));

    const { POST } = await import("@/app/api/cron/db-prune/route");
    const response = await POST(
      makeRequest({
        url: "http://localhost/api/cron/db-prune?wait=1",
        secret: "cron-secret",
      }),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe("boom");
  });

  it("honors ?dryRun=1", async () => {
    const { runDbPrune } = await import("@/lib/db-pruning/prune");
    vi.mocked(runDbPrune).mockResolvedValue(okRunResult({ dryRun: true }) as never);

    const { POST } = await import("@/app/api/cron/db-prune/route");
    const response = await POST(
      makeRequest({
        url: "http://localhost/api/cron/db-prune?wait=1&dryRun=1",
        secret: "cron-secret",
      }),
    );

    expect(response.status).toBe(200);
    expect(vi.mocked(runDbPrune).mock.calls[0][0]).toMatchObject({ dryRun: true });
  });

  it("honors a JSON body dryRun flag", async () => {
    const { runDbPrune } = await import("@/lib/db-pruning/prune");
    vi.mocked(runDbPrune).mockResolvedValue(okRunResult({ dryRun: true }) as never);

    const { POST } = await import("@/app/api/cron/db-prune/route");
    await POST(
      makeRequest({
        url: "http://localhost/api/cron/db-prune?wait=1",
        secret: "cron-secret",
        body: { dryRun: true },
      }),
    );

    expect(vi.mocked(runDbPrune).mock.calls[0][0]).toMatchObject({ dryRun: true });
  });

  it("forces dry run for every request when DB_PRUNE_FORCE_DRY_RUN=true", async () => {
    process.env.DB_PRUNE_FORCE_DRY_RUN = "true";
    const { runDbPrune } = await import("@/lib/db-pruning/prune");
    vi.mocked(runDbPrune).mockResolvedValue(okRunResult({ dryRun: true }) as never);

    const { POST } = await import("@/app/api/cron/db-prune/route");
    await POST(
      makeRequest({
        url: "http://localhost/api/cron/db-prune?wait=1",
        secret: "cron-secret",
      }),
    );

    expect(vi.mocked(runDbPrune).mock.calls[0][0]).toMatchObject({ dryRun: true });
  });
});
