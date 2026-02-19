import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCodaData } from "@/lib/analytics/fetchers-coda";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("coda analytics fetcher", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses explicit creator column override and builds creator intelligence windows", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          items: [{ id: "grid-tasks", name: "Tasks" }],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            { id: "col-1", name: "Name" },
            { id: "col-2", name: "Status" },
            { id: "col-3", name: "Priority" },
            { id: "col-4", name: "Assignee" },
            { id: "col-5", name: "Created By" },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: "row-1",
              createdAt: "2026-02-12T10:00:00.000Z",
              updatedAt: "2026-02-12T10:00:00.000Z",
              values: ["Card A", "Backlog", "P2", "Owner A", { name: "Alice", email: "alice@example.com" }],
            },
            {
              id: "row-2",
              createdAt: "2026-02-13T10:00:00.000Z",
              updatedAt: "2026-02-13T10:00:00.000Z",
              values: ["Card B", "Active", "P1", "Owner B", { name: "Bob", email: "bob@example.com" }],
            },
          ],
        })
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchCodaData("token", "doc-id", {
      creatorColumn: "Created By",
    });

    expect(data.totalCards).toBe(2);
    expect(data.creatorWindows?.find((window) => window.windowDays === 30)?.uniqueCreators).toBe(2);
    expect(data.newCreatorFeed?.some((entry) => entry.email === "alice@example.com")).toBe(true);
    expect(data.diagnostics?.creatorResolutionMode).toBe("override");
    expect(data.recentCards[0]?.creator).toBeTruthy();
  });

  it("falls back to unknown bucket when no creator source is available", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: "grid-1", name: "Tasks" }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            { id: "col-1", name: "Name" },
            { id: "col-2", name: "Status" },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: "row-1",
              createdAt: "2026-02-10T00:00:00.000Z",
              updatedAt: "2026-02-10T00:00:00.000Z",
              values: ["Card A", "Backlog"],
            },
          ],
        })
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchCodaData("token", "doc-id");
    const window30 = data.creatorWindows?.find((window) => window.windowDays === 30);

    expect(window30?.byCreator[0]?.creator).toBe("Unknown");
    expect(data.diagnostics?.unknownCreatorRatio).toBe(100);
    expect(data.diagnostics?.creatorResolutionMode).toBe("unknown_heavy");
  });

  it("paginates through row pages beyond the first batch", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: "grid-tasks", name: "Tasks" }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            { id: "col-1", name: "Name" },
            { id: "col-2", name: "Status" },
            { id: "col-3", name: "Created By" },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: "row-1",
              createdAt: "2026-02-10T00:00:00.000Z",
              updatedAt: "2026-02-10T00:00:00.000Z",
              values: ["Card A", "Backlog", "alice@example.com"],
            },
          ],
          nextPageToken: "next-page",
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: "row-2",
              createdAt: "2026-02-11T00:00:00.000Z",
              updatedAt: "2026-02-11T00:00:00.000Z",
              values: ["Card B", "Active", "bob@example.com"],
            },
          ],
        })
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchCodaData("token", "doc-id");

    expect(data.totalCards).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
