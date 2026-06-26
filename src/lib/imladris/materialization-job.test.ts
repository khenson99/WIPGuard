import { beforeEach, describe, expect, it, vi } from "vitest";
import { materializeImladrisCanonicalMetrics } from "@/lib/imladris/materialization";
import { discoverConnectedUserIds } from "@/lib/sync/users";
import { runImladrisMaterializationJob } from "@/lib/imladris/materialization-job";

vi.mock("@/lib/imladris/materialization", () => ({
  IMLADRIS_CANONICAL_MATERIALIZATION_DEPARTMENTS: [
    "development",
    "productActivation",
    "finance",
    "sales",
    "marketing",
    "customerSuccess",
  ],
  materializeImladrisCanonicalMetrics: vi.fn(),
}));

vi.mock("@/lib/sync/users", () => ({
  discoverConnectedUserIds: vi.fn(),
}));

function createPrismaMock() {
  return {
    user: {
      findMany: vi.fn(async () => [
        { id: "user_1", organizationId: "org_1" },
      ]),
    },
    integrationConnection: {
      findMany: vi.fn(async () => []),
    },
  };
}

describe("runImladrisMaterializationJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.mocked(discoverConnectedUserIds).mockResolvedValue(["user_1"]);
    vi.mocked(materializeImladrisCanonicalMetrics).mockResolvedValue([
      {
        metricKey: "marketing.pipeline_efficiency",
        metricValueId: "metric_1",
        status: "READY",
        rawRecordCount: 2,
        value: { pipelineEfficiency: 1.2 },
      },
    ] as never);
  });

  it("runs a compact department slice for discovered users", async () => {
    vi.stubEnv("IMLADRIS_MATERIALIZATION_DEPARTMENT_LIMIT", "1");
    const prisma = createPrismaMock();
    const now = new Date("2026-06-26T15:47:20.416Z");

    const result = await runImladrisMaterializationJob({
      prisma: prisma as never,
      now,
    });

    expect(discoverConnectedUserIds).toHaveBeenCalledWith(prisma);
    expect(materializeImladrisCanonicalMetrics).toHaveBeenCalledWith({
      prisma,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      periodStart: new Date("2026-05-27T15:47:20.416Z"),
      periodEnd: now,
      now,
      departments: ["marketing"],
    });
    expect(result).toEqual({
      startedAt: now.toISOString(),
      periodStart: "2026-05-27T15:47:20.416Z",
      periodEnd: now.toISOString(),
      departments: ["marketing"],
      contextsAttempted: 1,
      contextsSucceeded: 1,
      contextsFailed: 0,
      metricsCount: 1,
      metricKeys: ["marketing.pipeline_efficiency"],
      results: [
        {
          userId: "user_1",
          organizationId: "org_1",
          metricsCount: 1,
          metricKeys: ["marketing.pipeline_efficiency"],
        },
      ],
    });
  });
});
