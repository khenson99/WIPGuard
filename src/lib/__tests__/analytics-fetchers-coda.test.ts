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

  it("prefers the Individual Cards table when present", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            { id: "grid-tasks", name: "Tasks" },
            { id: "grid-individual", name: "Individual Cards" },
            { id: "grid-kanban", name: "Kanban" },
          ],
        })
      )
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
              createdAt: "2026-02-10T10:00:00.000Z",
              updatedAt: "2026-02-10T10:00:00.000Z",
              values: ["Download A", "Downloaded", { name: "Alice", email: "alice@example.com" }],
            },
          ],
        })
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchCodaData("token", "doc-id", {
      fromDate: new Date("2026-02-01T00:00:00.000Z"),
      toDate: new Date("2026-02-28T23:59:59.999Z"),
    });

    expect(data.totalCards).toBe(1);

    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calledUrls.some((url) => url.includes("/tables/grid-individual/columns"))).toBe(true);
    expect(calledUrls.some((url) => url.includes("/tables/grid-individual/rows"))).toBe(true);
  });

  it("filters cards by provided date range and builds recent submitters summary", async () => {
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
            { id: "col-3", name: "Created By" },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            // In range, has email
            {
              id: "row-in-1",
              createdAt: "2026-02-10T10:00:00.000Z",
              updatedAt: "2026-02-10T10:00:00.000Z",
              values: ["Card A", "Backlog", { name: "Alice", email: "alice@example.com" }],
            },
            // In range, missing email
            {
              id: "row-in-2",
              createdAt: "2026-02-12T10:00:00.000Z",
              updatedAt: "2026-02-12T10:00:00.000Z",
              values: ["Card B", "Active", { name: "No Email" }],
            },
            // Out of range
            {
              id: "row-out-1",
              createdAt: "2026-01-15T10:00:00.000Z",
              updatedAt: "2026-01-15T10:00:00.000Z",
              values: ["Card C", "Done", { name: "Bob", email: "bob@example.com" }],
            },
          ],
        })
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchCodaData("token", "doc-id", {
      creatorColumn: "Created By",
      fromDate: new Date("2026-02-01T00:00:00.000Z"),
      toDate: new Date("2026-02-28T23:59:59.999Z"),
    });

    expect(data.totalCards).toBe(2);
    expect(data.rangeSummary?.cardsCreated).toBe(2);
    expect(data.rangeSummary?.submissions).toBe(1);
    expect(data.rangeSummary?.unknownEmailCards).toBe(1);
    expect(data.rangeSummary?.from).toBe("2026-02-01");
    expect(data.rangeSummary?.to).toBe("2026-02-28");

    expect(data.recentSubmitters?.length).toBe(1);
    expect(data.recentSubmitters?.[0]?.email).toBe("alice@example.com");
    expect(data.recentSubmitters?.[0]?.cardsCreated).toBe(1);
  });

  it("uses an Email column when present (even if Created By lacks email)", async () => {
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
            { id: "col-3", name: "Email" },
            { id: "col-4", name: "Created By" },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: "row-1",
              createdAt: "2026-02-10T10:00:00.000Z",
              updatedAt: "2026-02-10T10:00:00.000Z",
              values: ["Download A", "Downloaded", "alice@example.com", { name: "Alice" }],
            },
          ],
        })
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchCodaData("token", "doc-id", {
      fromDate: new Date("2026-02-01T00:00:00.000Z"),
      toDate: new Date("2026-02-28T23:59:59.999Z"),
    });

    expect(data.rangeSummary?.unknownEmailCards).toBe(0);
    expect(data.recentSubmitters?.[0]?.email).toBe("alice@example.com");
    expect(data.recentSubmitters?.[0]?.creator).toBe("Alice");
  });

  it("enriches recent downloaders with Stripe data when stripeKey is provided", async () => {
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
            { id: "col-3", name: "Created By" },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: "row-1",
              createdAt: "2026-02-10T10:00:00.000Z",
              updatedAt: "2026-02-10T10:00:00.000Z",
              values: ["Download A", "Downloaded", { name: "Alice", email: "alice@example.com" }],
            },
          ],
        })
      )
      // Stripe: customers.search
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "cus_123", created: 1700000000, email: "alice@example.com" }],
          has_more: false,
        })
      )
      // Stripe: subscriptions
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "sub_123",
              status: "active",
              items: {
                data: [
                  {
                    price: {
                      unit_amount: 1000,
                      recurring: { interval: "month", interval_count: 1 },
                    },
                  },
                ],
              },
            },
          ],
          has_more: false,
        })
      )
      // Stripe: charges
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            { id: "ch_1", amount: 2000, amount_refunded: 0, created: 1700000100, status: "succeeded", paid: true },
          ],
          has_more: false,
        })
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchCodaData("token", "doc-id", {
      stripeKey: "sk_test_123",
      fromDate: new Date("2026-02-01T00:00:00.000Z"),
      toDate: new Date("2026-02-28T23:59:59.999Z"),
    });

    const submitter = data.recentSubmitters?.[0];
    expect(submitter?.email).toBe("alice@example.com");
    expect(submitter?.stripe?.matched).toBe(true);
    expect(submitter?.stripe?.customerId).toBe("cus_123");
    expect(submitter?.stripe?.subscriptionStatus).toBe("active");
    expect(submitter?.stripe?.mrr).toBe(10);
    expect(submitter?.stripe?.paid12mo).toBe(20);
    expect(submitter?.stripe?.lastPaymentAt).toBeTruthy();
  });

  it("computes previous-period growth for downloads and downloaders", async () => {
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
            { id: "col-3", name: "Created By" },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            // Previous window (Jan 29 → Feb 9 for this selected range)
            {
              id: "row-prev-1",
              createdAt: "2026-02-05T10:00:00.000Z",
              updatedAt: "2026-02-05T10:00:00.000Z",
              values: ["Prev Download", "Downloaded", { name: "Alice", email: "alice@example.com" }],
            },
            // Current window (Feb 10 → Feb 20)
            {
              id: "row-cur-1",
              createdAt: "2026-02-12T10:00:00.000Z",
              updatedAt: "2026-02-12T10:00:00.000Z",
              values: ["Cur A", "Downloaded", { name: "Alice", email: "alice@example.com" }],
            },
            {
              id: "row-cur-2",
              createdAt: "2026-02-13T10:00:00.000Z",
              updatedAt: "2026-02-13T10:00:00.000Z",
              values: ["Cur B", "Downloaded", { name: "Bob", email: "bob@example.com" }],
            },
            {
              id: "row-cur-3",
              createdAt: "2026-02-14T10:00:00.000Z",
              updatedAt: "2026-02-14T10:00:00.000Z",
              values: ["Cur C", "Downloaded", { name: "Bob", email: "bob@example.com" }],
            },
          ],
        })
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchCodaData("token", "doc-id", {
      fromDate: new Date("2026-02-10T00:00:00.000Z"),
      toDate: new Date("2026-02-20T23:59:59.999Z"),
    });

    expect(data.rangeSummary?.cardsCreated).toBe(3);
    expect(data.rangeSummary?.submissions).toBe(2);
    expect(data.rangeSummary?.downloadsPrev).toBe(1);
    expect(data.rangeSummary?.downloadersPrev).toBe(1);
    expect(data.rangeSummary?.downloadsDeltaPct).toBe(200);
    expect(data.rangeSummary?.downloadersDeltaPct).toBe(100);
  });

  it("builds funnel metrics and limits recent submitters", async () => {
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
            { id: "col-3", name: "Created By" },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: "row-1",
              createdAt: "2026-02-10T10:00:00.000Z",
              updatedAt: "2026-02-10T10:00:00.000Z",
              values: ["Card A", "Backlog", { name: "Alice", email: "alice@example.com" }],
            },
            {
              id: "row-2",
              createdAt: "2026-02-11T10:00:00.000Z",
              updatedAt: "2026-02-11T10:00:00.000Z",
              values: ["Card B", "Active", { name: "Bob", email: "bob@example.com" }],
            },
            {
              id: "row-3",
              createdAt: "2026-02-12T10:00:00.000Z",
              updatedAt: "2026-02-12T10:00:00.000Z",
              values: ["Card C", "Downloaded", { name: "Alice", email: "alice@example.com" }],
            },
            {
              id: "row-4",
              createdAt: "2026-02-13T10:00:00.000Z",
              updatedAt: "2026-02-13T10:00:00.000Z",
              values: ["Card D", "Done", { name: "Cara", email: "cara@example.com" }],
            },
            {
              id: "row-5",
              createdAt: "2026-02-14T10:00:00.000Z",
              updatedAt: "2026-02-14T10:00:00.000Z",
              values: ["Card E", "Needs Review", { name: "Dana", email: "dana@example.com" }],
            },
          ],
        })
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchCodaData("token", "doc-id", {
      fromDate: new Date("2026-02-01T00:00:00.000Z"),
      toDate: new Date("2026-02-28T23:59:59.999Z"),
      maxRecentSubmitters: 2,
    });

    expect(data.funnel?.stages).toEqual([
      { key: "submissions", label: "Submissions", count: 4 },
      { key: "cardsCreated", label: "Cards Created", count: 5 },
      { key: "cardsCompleted", label: "Cards Completed", count: 2 },
    ]);
    expect(data.funnel?.conversions).toEqual([
      { from: "submissions", to: "cardsCreated", ratePct: 125 },
      { from: "cardsCreated", to: "cardsCompleted", ratePct: 40 },
      { from: "submissions", to: "cardsCompleted", ratePct: 50 },
    ]);
    expect(data.funnel?.topDropOffStatuses).toEqual([
      { status: "Backlog", count: 1, sharePct: 33.3 },
      { status: "Active", count: 1, sharePct: 33.3 },
      { status: "Needs Review", count: 1, sharePct: 33.3 },
    ]);
    expect(data.recentSubmitters?.map((entry) => entry.email)).toEqual([
      "alice@example.com",
      "dana@example.com",
    ]);
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
