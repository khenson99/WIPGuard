import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/pylon-client", () => ({
  fetchPylonIssues: vi.fn(),
  getPylonIssueId: vi.fn((issue: Record<string, unknown>) => issue.id ?? issue.issueId ?? issue.issue_id ?? null),
  getPylonIssuePriority: vi.fn((issue: Record<string, unknown>) => issue.priority ?? null),
  getPylonIssueStatus: vi.fn((issue: Record<string, unknown>) => issue.status ?? issue.state ?? null),
  getPylonIssueTags: vi.fn((issue: Record<string, unknown>) => issue.tags ?? []),
}));

describe("analytics pylon fetcher", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("classifies canonical Pylon workflow states into queue metrics", async () => {
    const { fetchPylonIssues } = await import("@/lib/integrations/pylon-client");
    vi.mocked(fetchPylonIssues).mockResolvedValueOnce([
      { id: "i1", status: "new", priority: "urgent", firstResponseMinutes: 15, csat: 5 },
      { id: "i2", status: "waiting_on_you", priority: "normal", first_response_minutes: 45, customerSatisfaction: 4 },
      { id: "i3", status: "on_hold", priority: "high", tags: ["urgent"] },
      { id: "i4", status: "waiting_on_customer", priority: "normal" },
      { id: "i5", status: "closed", priority: "normal", csat: 3 },
    ] as never);

    const { fetchPylonData } = await import("@/lib/analytics/fetchers-pylon");
    const data = await fetchPylonData({
      apiKey: "pylon_test_key",
      from: "2026-02-01",
      to: "2026-02-28",
      baseUrl: "https://api.example.test",
    });

    expect(fetchPylonIssues).toHaveBeenCalledWith({
      apiKey: "pylon_test_key",
      from: "2026-02-01T00:00:00.000Z",
      to: "2026-02-28T23:59:59.999Z",
      baseUrl: "https://api.example.test",
      limit: 200,
      timeoutMs: 5_000,
    });
    expect(data.openConversations).toBe(4);
    expect(data.urgentConversations).toBe(2);
    expect(data.waitingOnTeam).toBe(3);
    expect(data.resolvedInRange).toBe(1);
    expect(data.avgFirstResponseMinutes).toBe(30);
    expect(data.csat).toBe(4);
  });

  it("normalizes display-style Pylon statuses like On You and On Customer", async () => {
    const { fetchPylonIssues } = await import("@/lib/integrations/pylon-client");
    vi.mocked(fetchPylonIssues).mockResolvedValueOnce([
      { id: "i1", status: "On You" },
      { id: "i2", status: "On Hold" },
      { id: "i3", status: "On Customer" },
      { id: "i4", status: "Closed" },
    ] as never);

    const { fetchPylonData } = await import("@/lib/analytics/fetchers-pylon");
    const data = await fetchPylonData({
      apiKey: "pylon_test_key",
      from: "2026-02-01",
      to: "2026-02-28",
      baseUrl: "https://api.example.test",
    });

    expect(data.openConversations).toBe(3);
    expect(data.waitingOnTeam).toBe(2);
    expect(data.resolvedInRange).toBe(1);
  });

  it("normalizes Date inputs into inclusive UTC day bounds", async () => {
    const { fetchPylonIssues } = await import("@/lib/integrations/pylon-client");
    vi.mocked(fetchPylonIssues).mockResolvedValueOnce([] as never);

    const { fetchPylonData } = await import("@/lib/analytics/fetchers-pylon");
    await fetchPylonData({
      apiKey: "pylon_test_key",
      from: new Date("2026-03-01T15:30:00.000Z"),
      to: new Date("2026-03-05T08:00:00.000Z"),
      baseUrl: "https://api.example.test",
    });

    expect(fetchPylonIssues).toHaveBeenCalledWith({
      apiKey: "pylon_test_key",
      from: "2026-03-01T00:00:00.000Z",
      to: "2026-03-05T23:59:59.999Z",
      baseUrl: "https://api.example.test",
      limit: 200,
      timeoutMs: 5_000,
    });
  });

  it("chunks ranges longer than 30 days and dedupes repeated issues across windows", async () => {
    const { fetchPylonIssues } = await import("@/lib/integrations/pylon-client");
    vi.mocked(fetchPylonIssues)
      .mockResolvedValueOnce([
        { id: "i1", status: "new", priority: "urgent", firstResponseMinutes: 10, csat: 5 },
      ] as never)
      .mockResolvedValueOnce([
        { id: "i1", status: "new", priority: "urgent", firstResponseMinutes: 10, csat: 5 },
        { id: "i2", status: "closed", priority: "normal", firstResponseMinutes: 20, csat: 3 },
      ] as never)
      .mockResolvedValueOnce([
        { id: "i3", status: "waiting_on_you", priority: "high" },
      ] as never);

    const { fetchPylonData } = await import("@/lib/analytics/fetchers-pylon");
    const data = await fetchPylonData({
      apiKey: "pylon_test_key",
      from: "2026-01-01",
      to: "2026-03-31",
      baseUrl: "https://api.example.test",
    });

    expect(fetchPylonIssues).toHaveBeenCalledTimes(3);
    expect(fetchPylonIssues).toHaveBeenNthCalledWith(1, {
      apiKey: "pylon_test_key",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-30T23:59:59.999Z",
      baseUrl: "https://api.example.test",
      limit: 200,
      timeoutMs: 5_000,
    });
    expect(fetchPylonIssues).toHaveBeenNthCalledWith(2, {
      apiKey: "pylon_test_key",
      from: "2026-01-31T00:00:00.000Z",
      to: "2026-03-01T23:59:59.999Z",
      baseUrl: "https://api.example.test",
      limit: 200,
      timeoutMs: 5_000,
    });
    expect(fetchPylonIssues).toHaveBeenNthCalledWith(3, {
      apiKey: "pylon_test_key",
      from: "2026-03-02T00:00:00.000Z",
      to: "2026-03-31T23:59:59.999Z",
      baseUrl: "https://api.example.test",
      limit: 200,
      timeoutMs: 5_000,
    });
    expect(data.openConversations).toBe(2);
    expect(data.urgentConversations).toBe(2);
    expect(data.waitingOnTeam).toBe(2);
    expect(data.resolvedInRange).toBe(1);
    expect(data.avgFirstResponseMinutes).toBe(15);
    expect(data.csat).toBe(4);
  });

  it("derives response-time and CSAT metrics from documented Pylon fields", async () => {
    const { fetchPylonIssues } = await import("@/lib/integrations/pylon-client");
    vi.mocked(fetchPylonIssues).mockResolvedValueOnce([
      {
        id: "i1",
        status: "closed",
        first_response_seconds: 1800,
        csat_responses: [{ score: 5 }, { score: 4 }],
      },
      {
        id: "i2",
        status: "waiting_on_you",
        business_hours_first_response_seconds: 600,
        csat_responses: [{ score: 3 }],
      },
    ] as never);

    const { fetchPylonData } = await import("@/lib/analytics/fetchers-pylon");
    const data = await fetchPylonData({
      apiKey: "pylon_test_key",
      from: "2026-02-01",
      to: "2026-02-28",
      baseUrl: "https://api.example.test",
    });

    expect(data.avgFirstResponseMinutes).toBe(20);
    expect(data.csat).toBe(4);
  });
});
