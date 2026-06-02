import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationProvider } from "@/generated/prisma/client";
import { fetchIntegrationTelemetryData } from "@/lib/analytics/fetchers-integrations";

const prismaMock = vi.hoisted(() => ({
  integrationRule: {
    findMany: vi.fn(),
  },
  integrationReceipt: {
    findMany: vi.fn(),
  },
  outboxEvent: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

describe("fetchIntegrationTelemetryData", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    vi.clearAllMocks();
    prismaMock.integrationRule.findMany.mockResolvedValue([
      { id: "rule_1", enabled: true, lastError: null },
    ]);
    prismaMock.outboxEvent.findMany.mockResolvedValue([]);
  });

  it("counts downstream artifacts from receipt metadata after task receipts are retired", async () => {
    prismaMock.integrationReceipt.findMany.mockResolvedValue([
      {
        lastObservedAt: new Date("2026-05-31T10:00:00.000Z"),
        metadata: {
          artifactId: "artifact_1",
        },
      },
      {
        lastObservedAt: new Date("2026-05-31T13:00:00.000Z"),
        metadata: {
          artifactsCreated: 2,
        },
      },
      {
        lastObservedAt: new Date("2026-06-01T09:00:00.000Z"),
        metadata: {
          createdArtifactIds: ["artifact_2", "artifact_3"],
        },
      },
      {
        lastObservedAt: new Date("2026-06-01T10:00:00.000Z"),
        metadata: {},
      },
    ]);

    const result = await fetchIntegrationTelemetryData({
      userId: "user_1",
      provider: IntegrationProvider.CODA,
      from: new Date("2026-05-31T00:00:00.000Z"),
      to: new Date("2026-06-01T23:59:59.999Z"),
    });

    expect(result.artifactsCreatedInRange).toBe(5);
    expect(result.trend).toEqual([
      {
        date: "2026-05-31",
        receipts: 2,
        artifactsCreated: 3,
        failures: 0,
      },
      {
        date: "2026-06-01",
        receipts: 2,
        artifactsCreated: 2,
        failures: 0,
      },
    ]);
  });
});
