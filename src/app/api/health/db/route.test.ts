import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
  },
}));

const GB = 1024 ** 3;

function mockSizes(input: {
  totalBytes: number;
  tables?: Array<{
    table_name: string;
    total_bytes: number;
    heap_bytes: number;
    index_and_toast_bytes: number;
    approx_rows: number;
  }>;
}) {
  queryRaw
    .mockResolvedValueOnce([{ total_bytes: input.totalBytes }])
    .mockResolvedValueOnce(
      input.tables ?? [
        {
          table_name: "ImladrisRawSourceRecord",
          total_bytes: 4 * GB,
          heap_bytes: 3 * GB,
          index_and_toast_bytes: 1 * GB,
          approx_rows: 1_200_000,
        },
      ],
    );
}

describe("GET /api/health/db", () => {
  const savedThreshold = process.env.DB_HEALTH_SIZE_DEGRADED_GB;

  beforeEach(() => {
    vi.resetModules();
    queryRaw.mockReset();
    delete process.env.DB_HEALTH_SIZE_DEGRADED_GB;
  });

  afterEach(() => {
    if (savedThreshold === undefined) delete process.env.DB_HEALTH_SIZE_DEGRADED_GB;
    else process.env.DB_HEALTH_SIZE_DEGRADED_GB = savedThreshold;
  });

  it("reports ok with sizes and top tables when under the threshold", async () => {
    mockSizes({ totalBytes: 8 * GB });

    const { GET } = await import("@/app/api/health/db/route");
    const response = await GET();
    const body = (await response.json()) as {
      status: string;
      checks: {
        database: {
          reachable: boolean;
          totalBytes: number;
          degradedThresholdBytes: number;
          overThreshold: boolean;
        };
        topTables: Array<{ table: string; totalBytes: number; approxRows: number }>;
      };
    };

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks.database.reachable).toBe(true);
    expect(body.checks.database.totalBytes).toBe(8 * GB);
    // Default threshold: 15GB.
    expect(body.checks.database.degradedThresholdBytes).toBe(15 * GB);
    expect(body.checks.database.overThreshold).toBe(false);
    expect(body.checks.topTables).toEqual([
      {
        table: "ImladrisRawSourceRecord",
        totalBytes: 4 * GB,
        heapBytes: 3 * GB,
        indexAndToastBytes: 1 * GB,
        approxRows: 1_200_000,
      },
    ]);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("degrades (503) once the database size crosses the threshold", async () => {
    mockSizes({ totalBytes: 16 * GB });

    const { GET } = await import("@/app/api/health/db/route");
    const response = await GET();
    const body = (await response.json()) as {
      status: string;
      checks: { database: { overThreshold: boolean } };
    };

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.database.overThreshold).toBe(true);
  });

  it("honors DB_HEALTH_SIZE_DEGRADED_GB overrides", async () => {
    process.env.DB_HEALTH_SIZE_DEGRADED_GB = "2";
    mockSizes({ totalBytes: 3 * GB });

    const { GET } = await import("@/app/api/health/db/route");
    const response = await GET();

    expect(response.status).toBe(503);
  });

  it("falls back to the default threshold for unparseable overrides", async () => {
    process.env.DB_HEALTH_SIZE_DEGRADED_GB = "lots";
    mockSizes({ totalBytes: 8 * GB });

    const { GET } = await import("@/app/api/health/db/route");
    const response = await GET();

    expect(response.status).toBe(200);
  });

  it("degrades with a compact error code when the database is unreachable", async () => {
    queryRaw.mockRejectedValue(
      Object.assign(new Error("no space left on device"), { code: "53100" }),
    );

    const { GET } = await import("@/app/api/health/db/route");
    const response = await GET();
    const body = (await response.json()) as {
      status: string;
      checks: { database: { reachable: boolean; errorCode: string } };
    };

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.database.reachable).toBe(false);
    expect(body.checks.database.errorCode).toBe("53100");
    // Coarse output only — the raw error message is never echoed back.
    expect(JSON.stringify(body)).not.toContain("no space left");
  });
});
