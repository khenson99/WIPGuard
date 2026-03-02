import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useInsightPreferences } from "../use-insight-preferences";
import type { AiInsight } from "@/lib/analytics/types";

function makeInsight(overrides: Partial<AiInsight> = {}): AiInsight {
  return {
    id: "insight-1",
    section: "sales-pipeline",
    severity: "warning",
    title: "Pipeline risk",
    why: "Conversion dropped",
    confidence: 0.8,
    expectedImpact: "Recover demos",
    stale: false,
    evidence: [],
    actions: [],
    ...overrides,
  };
}

// Helper to build a fetch mock that returns preferences
function mockFetch(preferences: Array<{ insightId: string; status: string }> = []) {
  return vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
    const method = opts?.method ?? "GET";
    if (method === "GET") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ preferences }),
      } as Response);
    }
    // POST
    const body = JSON.parse(opts?.body as string ?? "{}");
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ preference: body }),
    } as Response);
  });
}

describe("useInsightPreferences", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads pinned/dismissed preferences from API on mount", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        { insightId: "abc", status: "pinned" },
        { insightId: "def", status: "dismissed" },
      ])
    );

    const { result } = renderHook(() => useInsightPreferences());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isPinned("abc")).toBe(true);
    expect(result.current.isDismissed("def")).toBe(true);
    expect(result.current.isPinned("def")).toBe(false);
    expect(result.current.isDismissed("abc")).toBe(false);
  });

  it("togglePin adds id to pinnedIds (optimistic)", async () => {
    const { result } = renderHook(() => useInsightPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isPinned("xyz")).toBe(false);

    await act(async () => {
      await result.current.togglePin("xyz");
    });

    expect(result.current.isPinned("xyz")).toBe(true);
  });

  it("togglePin removes id from pinnedIds when already pinned", async () => {
    vi.stubGlobal("fetch", mockFetch([{ insightId: "xyz", status: "pinned" }]));
    const { result } = renderHook(() => useInsightPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isPinned("xyz")).toBe(true);

    await act(async () => {
      await result.current.togglePin("xyz");
    });

    expect(result.current.isPinned("xyz")).toBe(false);
  });

  it("dismiss adds id to dismissedIds (optimistic)", async () => {
    const { result } = renderHook(() => useInsightPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isDismissed("aaa")).toBe(false);

    await act(async () => {
      await result.current.dismiss("aaa");
    });

    expect(result.current.isDismissed("aaa")).toBe(true);
  });

  it("undoDismiss removes id from dismissedIds", async () => {
    vi.stubGlobal("fetch", mockFetch([{ insightId: "aaa", status: "dismissed" }]));
    const { result } = renderHook(() => useInsightPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isDismissed("aaa")).toBe(true);

    await act(async () => {
      await result.current.undoDismiss("aaa");
    });

    expect(result.current.isDismissed("aaa")).toBe(false);
  });

  it("sortAndFilter puts pinned insights first", async () => {
    vi.stubGlobal("fetch", mockFetch([{ insightId: "b", status: "pinned" }]));
    const { result } = renderHook(() => useInsightPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const insights = [
      makeInsight({ id: "a", title: "A" }),
      makeInsight({ id: "b", title: "B" }),
      makeInsight({ id: "c", title: "C" }),
    ];

    const sorted = result.current.sortAndFilter(insights);
    expect(sorted[0].id).toBe("b");
  });

  it("sortAndFilter hides dismissed insights by default", async () => {
    vi.stubGlobal("fetch", mockFetch([{ insightId: "dismissed-one", status: "dismissed" }]));
    const { result } = renderHook(() => useInsightPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const insights = [
      makeInsight({ id: "dismissed-one" }),
      makeInsight({ id: "visible" }),
    ];

    const sorted = result.current.sortAndFilter(insights);
    expect(sorted.some((i) => i.id === "dismissed-one")).toBe(false);
    expect(sorted.some((i) => i.id === "visible")).toBe(true);
  });

  it("sortAndFilter includes dismissed when showDismissed=true", async () => {
    vi.stubGlobal("fetch", mockFetch([{ insightId: "dismissed-one", status: "dismissed" }]));
    const { result } = renderHook(() => useInsightPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const insights = [
      makeInsight({ id: "dismissed-one" }),
      makeInsight({ id: "visible" }),
    ];

    const sorted = result.current.sortAndFilter(insights, true);
    expect(sorted.some((i) => i.id === "dismissed-one")).toBe(true);
  });

  it("createTaskFromInsight calls POST /api/tasks with correct payload", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useInsightPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const insight = makeInsight({ id: "ins-1", title: "Fix pipeline", severity: "critical" });

    await act(async () => {
      await result.current.createTaskFromInsight(insight);
    });

    // Find the POST /api/tasks call (the first call was GET /api/insights/preferences)
    const taskCall = fetchMock.mock.calls.find(
      ([url, opts]) => url === "/api/tasks" && (opts as RequestInit)?.method === "POST"
    );
    expect(taskCall).toBeTruthy();

    const body = JSON.parse((taskCall![1] as RequestInit).body as string);
    expect(body.title).toBe("[Insight] Fix pipeline");
    expect(body.status).toBe("BACKLOG");
    expect(body.priority).toBe("P1"); // critical → P1
  });

  it("createTaskFromInsight sets creatingTaskForId during fetch, resets after", async () => {
    let resolveTask!: (v: Response) => void;
    const taskPromise = new Promise<Response>((r) => { resolveTask = r; });

    const fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if ((opts?.method ?? "GET") === "GET") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ preferences: [] }) } as Response);
      }
      return taskPromise;
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useInsightPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const insight = makeInsight({ id: "ins-2" });
    let createDone = false;

    act(() => {
      result.current.createTaskFromInsight(insight).then(() => { createDone = true; });
    });

    // After kicking off createTask, creatingTaskForId should be set
    await waitFor(() => expect(result.current.creatingTaskForId).toBe("ins-2"));

    // Resolve the task API call
    resolveTask({ ok: true, json: () => Promise.resolve({ id: "task-1", title: "[Insight] Test" }) } as Response);

    await waitFor(() => expect(createDone).toBe(true));
    expect(result.current.creatingTaskForId).toBeNull();
  });

  it("sortAndFilter preserves relative order within each group", async () => {
    vi.stubGlobal("fetch", mockFetch([{ insightId: "b", status: "pinned" }]));
    const { result } = renderHook(() => useInsightPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const insights = [
      makeInsight({ id: "a" }),
      makeInsight({ id: "b" }), // pinned
      makeInsight({ id: "c" }),
    ];

    const sorted = result.current.sortAndFilter(insights);
    expect(sorted[0].id).toBe("b");
    // a and c preserve order among unpinned
    expect(sorted[1].id).toBe("a");
    expect(sorted[2].id).toBe("c");
  });
});
