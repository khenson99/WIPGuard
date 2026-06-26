import { beforeEach, describe, expect, it, vi } from "vitest";
import { runImladrisMaterializationJob } from "@/lib/imladris/materialization-job";
import { withSyncAdvisoryLock } from "@/lib/sync/sync-lock";
import { getWorkerPool, getWorkerPrisma } from "../prisma";
import { runImladrisMaterializationWorkerOnce } from "../imladris-materialization-worker";

vi.mock("@/lib/imladris/materialization-job", () => ({
  runImladrisMaterializationJob: vi.fn(),
}));

vi.mock("@/lib/sync/sync-lock", () => ({
  withSyncAdvisoryLock: vi.fn(),
}));

vi.mock("../prisma", () => ({
  getWorkerPool: vi.fn(),
  getWorkerPrisma: vi.fn(),
}));

describe("runImladrisMaterializationWorkerOnce", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWorkerPrisma).mockReturnValue({ marker: "prisma" } as never);
    vi.mocked(getWorkerPool).mockReturnValue({ marker: "pool" } as never);
    vi.mocked(runImladrisMaterializationJob).mockResolvedValue({
      startedAt: "2026-06-26T15:47:20.416Z",
      periodStart: "2026-05-27T15:47:20.416Z",
      periodEnd: "2026-06-26T15:47:20.416Z",
      departments: ["marketing"],
      contextsAttempted: 1,
      contextsSucceeded: 1,
      contextsFailed: 0,
      metricsCount: 1,
      metricKeys: ["marketing.pipeline_efficiency"],
      results: [],
    } as never);
  });

  it("runs the materialization job under the global sync advisory lock", async () => {
    vi.mocked(withSyncAdvisoryLock).mockImplementation(async (fn) => ({
      ran: true,
      result: await fn(),
    }) as never);

    const result = await runImladrisMaterializationWorkerOnce();

    expect(withSyncAdvisoryLock).toHaveBeenCalledWith(expect.any(Function), {
      pool: { marker: "pool" },
    });
    expect(runImladrisMaterializationJob).toHaveBeenCalledWith({
      prisma: { marker: "prisma" },
    });
    expect(result).toEqual({
      skipped: false,
      result: expect.objectContaining({
        departments: ["marketing"],
        metricsCount: 1,
      }),
    });
  });

  it("reports a lock skip without running materialization", async () => {
    vi.mocked(withSyncAdvisoryLock).mockResolvedValue({
      ran: false,
      reason: "another sync cycle is already running",
    } as never);

    const result = await runImladrisMaterializationWorkerOnce();

    expect(runImladrisMaterializationJob).not.toHaveBeenCalled();
    expect(result).toEqual({
      skipped: true,
      reason: "another sync cycle is already running",
    });
  });
});
