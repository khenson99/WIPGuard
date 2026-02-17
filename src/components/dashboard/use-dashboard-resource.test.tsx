import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { useDashboardResource } from "@/components/dashboard/use-dashboard-resource";

interface Payload {
  value: number;
  updatedAt?: string;
}

describe("useDashboardResource", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("uses cache first and then updates from successful refresh", async () => {
    window.sessionStorage.setItem(
      "test:resource:1",
      JSON.stringify({
        data: { value: 1 },
        lastUpdatedAt: "2026-01-01T00:00:00.000Z",
      })
    );

    const { result } = renderHook(() =>
      useDashboardResource<Payload>({
        cacheKey: "test:resource:1",
        deps: [],
        load: async () => ({ value: 2, updatedAt: "2026-01-02T00:00:00.000Z" }),
        getLastUpdatedAt: (payload) => payload.updatedAt ?? null,
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data?.value).toBe(2);
    expect(result.current.stale).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("keeps cached data and marks stale when refresh fails", async () => {
    window.sessionStorage.setItem(
      "test:resource:2",
      JSON.stringify({
        data: { value: 7 },
        lastUpdatedAt: "2026-01-01T00:00:00.000Z",
      })
    );

    const { result } = renderHook(() =>
      useDashboardResource<Payload>({
        cacheKey: "test:resource:2",
        deps: [],
        load: async () => {
          throw new Error("Network down");
        },
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data?.value).toBe(7);
    expect(result.current.stale).toBe(true);
    expect(result.current.error).toContain("Network down");
  });

  it("surfaces error when there is no cache and fetch fails", async () => {
    const { result } = renderHook(() =>
      useDashboardResource<Payload>({
        cacheKey: "test:resource:3",
        deps: [],
        load: async () => {
          throw new Error("Request failed");
        },
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.stale).toBe(false);
    expect(result.current.error).toContain("Request failed");
  });

  it("manual refresh replaces stale cached data and clears errors", async () => {
    window.sessionStorage.setItem(
      "test:resource:4",
      JSON.stringify({
        data: { value: 10 },
        lastUpdatedAt: "2026-01-01T00:00:00.000Z",
      })
    );

    let callCount = 0;
    const { result } = renderHook(() =>
      useDashboardResource<Payload>({
        cacheKey: "test:resource:4",
        deps: [],
        load: async ({ refresh }) => {
          callCount += 1;
          if (!refresh) {
            throw new Error("Transient failure");
          }
          return { value: 22, updatedAt: "2026-01-03T00:00:00.000Z" };
        },
        getLastUpdatedAt: (payload) => payload.updatedAt ?? null,
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data?.value).toBe(10);
    expect(result.current.stale).toBe(true);

    await act(async () => {
      await result.current.refresh();
    });

    expect(callCount).toBe(2);
    expect(result.current.data?.value).toBe(22);
    expect(result.current.stale).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
