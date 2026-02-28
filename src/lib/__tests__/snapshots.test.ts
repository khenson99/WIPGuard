import { describe, expect, it, vi, beforeEach } from "vitest";
import { storeAnalyticsSnapshot, storeAnalyticsSnapshotFailure } from "@/lib/analytics/snapshots";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analyticsSnapshot: {
      upsert: vi.fn(),
    },
  },
}));

describe("analytics snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts SUCCESS snapshots by composite key", async () => {
    vi.mocked(prisma.analyticsSnapshot.upsert).mockResolvedValueOnce({} as never);

    await storeAnalyticsSnapshot({
      userId: "user_1",
      providerKey: "googleAds",
      contextKey: "default",
      rangePreset: "30d",
      fromDate: new Date("2026-02-01T00:00:00.000Z"),
      toDate: new Date("2026-02-28T23:59:59.999Z"),
      payload: { ok: true },
      expiresAt: new Date("2026-03-01T00:00:00.000Z"),
    });

    expect(prisma.analyticsSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.any(Object),
        create: expect.objectContaining({
          providerKey: "googleAds",
          status: "SUCCESS",
          lastError: null,
        }),
        update: expect.objectContaining({
          status: "SUCCESS",
          lastError: null,
        }),
      })
    );
  });

  it("upserts ERROR snapshots separately to preserve last SUCCESS", async () => {
    vi.mocked(prisma.analyticsSnapshot.upsert).mockResolvedValueOnce({} as never);

    await storeAnalyticsSnapshotFailure({
      userId: "user_1",
      providerKey: "googleAds",
      contextKey: "default",
      rangePreset: "30d",
      fromDate: new Date("2026-02-01T00:00:00.000Z"),
      toDate: new Date("2026-02-28T23:59:59.999Z"),
      error: "quota",
      expiresAt: new Date("2026-03-01T00:00:00.000Z"),
    });

    expect(prisma.analyticsSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: "ERROR",
          lastError: "quota",
        }),
        update: expect.objectContaining({
          status: "ERROR",
          lastError: "quota",
        }),
      })
    );
  });
});

