import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerSuccessAccountWorkspace } from "@/components/customer-success/account-workspace";
import type { CustomerSuccessAccountDetail } from "@/lib/customer-success/types";

function buildDetail(overrides: Partial<CustomerSuccessAccountDetail> = {}): CustomerSuccessAccountDetail {
  return {
    accountId: "acct_1",
    name: "Acme Co",
    segment: "Mid-market",
    tier: "Growth",
    lifecycleStage: "ACTIVE",
    ownerName: "CS Owner",
    health: {
      score: 78,
      grade: "C",
      trend: "stable",
      confidence: 80,
      updatedAt: "2026-03-09T10:00:00.000Z",
      components: {
        adoption: {
          score: 75,
          weight: 0.24,
          weightedScore: 18,
          trend: "stable",
          status: "watch",
          evidence: ["Usage consistent"],
          lastUpdatedAt: "2026-03-09T10:00:00.000Z",
        },
        engagement: {
          score: 78,
          weight: 0.22,
          weightedScore: 17.2,
          trend: "stable",
          status: "watch",
          evidence: ["Meetings active"],
          lastUpdatedAt: "2026-03-09T10:00:00.000Z",
        },
        relationship: {
          score: 82,
          weight: 0.2,
          weightedScore: 16.4,
          trend: "improving",
          status: "healthy",
          evidence: ["Champion engaged"],
          lastUpdatedAt: "2026-03-09T10:00:00.000Z",
        },
        support: {
          score: 72,
          weight: 0.2,
          weightedScore: 14.4,
          trend: "stable",
          status: "watch",
          evidence: ["Low queue volume"],
          lastUpdatedAt: "2026-03-09T10:00:00.000Z",
        },
        commercial: {
          score: 80,
          weight: 0.14,
          weightedScore: 11.2,
          trend: "stable",
          status: "healthy",
          evidence: ["Renewal on track"],
          lastUpdatedAt: "2026-03-09T10:00:00.000Z",
        },
      },
      leadingIndicators: {
        recency: {
          label: "Activity recency",
          score: 76,
          status: "watch",
          value: "5d since touch",
          evidence: ["Customer touch landed this week"],
        },
        cadence: {
          label: "Touch cadence",
          score: 72,
          status: "watch",
          value: "3 touches / 30d",
          evidence: ["Follow-up rhythm is acceptable"],
        },
        consistency: {
          label: "Touch consistency",
          score: 81,
          status: "healthy",
          value: "3/3 months active",
          evidence: ["Touch pattern stayed consistent"],
        },
        depth: {
          label: "Execution depth",
          score: 74,
          status: "watch",
          value: "2/3 milestones done",
          evidence: ["Success plan is progressing"],
        },
        breadth: {
          label: "Relationship breadth",
          score: 84,
          status: "healthy",
          value: "2/2 stakeholders covered",
          evidence: ["Champion + admin both covered"],
        },
      },
    },
    alerts: [],
    timeline: [
      {
        id: "event_1",
        accountId: "acct_1",
        type: "relationship",
        title: "Initial meeting",
        description: "Kickoff completed",
        occurredAt: "2026-03-08T10:00:00.000Z",
      },
    ],
    stakeholders: [
      {
        id: "stake_1",
        name: "Taylor Champion",
        email: "taylor@example.com",
        role: "Operations",
        coverageStatus: "covered",
        lastTouchAt: "2026-03-08T10:00:00.000Z",
      },
    ],
    successPlan: {
      templateKey: "adoption",
      milestones: [],
    },
    outreach: {
      recommendedTemplates: ["check-in"],
      recentMessages: [],
    },
    commercial: {
      arr: 24000,
      renewalDate: "2026-06-15T00:00:00.000Z",
      paymentStatus: "current",
      expansionPotential: "medium",
    },
    relationshipIntelligence: {
      connectedSystems: 2,
      providers: [
        {
          provider: "CODA",
          externalObjectType: "doc",
          externalId: "VYLC2rzPN_",
          label: "Customer Success and Implementation",
          isPrimary: true,
          url: "https://coda.io/d/_dVYLC2rzPN_",
        },
      ],
      retention: {
        status: "Watch",
        lifecyclePhase: "MATURE",
        primaryLirLabel: "5 orders / 5 items in 30 days",
        primaryLirPassed: false,
        primaryLirValue: 2,
        primaryLirThreshold: 5,
        currentMonthActivity: 4,
        trendVsPriorPct: -37.5,
        implementationStage: "LIVE",
        goLiveDate: "2025-10-01T00:00:00.000Z",
        subscriptionStartDate: "2025-09-15T00:00:00.000Z",
        firstOrderDate: "2025-10-05T00:00:00.000Z",
        productMetrics: {
          totalOrders: 42,
          totalItems: 31,
          uniqueItemsOrdered: 18,
          daysTo25Items: 37,
          daysTo10Orders: 21,
        },
        explanation: "watch because activity is trailing and recent usage is below the habit threshold.",
        reasonCodes: [
          {
            code: "low_recent_activity",
            label: "Low recent activity",
            detail: "Recent activity is below the current habit threshold.",
            severity: "warning",
            dimension: "usage",
          },
        ],
        coverage: {
          arda: true,
          coda: true,
          stripe: true,
          hubspot: true,
          pylon: false,
          missingSources: ["pylon"],
        },
        detailUrl: "/analytics/retention/acct_1",
      },
      arda: {
        tenantId: "tenant-123",
        configuredTenantId: "tenant-123",
        tenantName: "Acme Co",
        companyName: "Acme Co",
        customerStatus: "Won",
        configuredHealth: "Yellow",
        implementationStage: "LIVE",
        sourceRecordCount: 24,
      },
      coda: {
        customerStatus: "Won",
        configuredHealth: "Yellow",
        mainDocId: "VYLC2rzPN_",
        mainDocUrl: "https://coda.io/d/_dVYLC2rzPN_",
        orderArchiveDocumentId: "cgSn33D4N9",
        orderArchiveDocumentUrl: "https://coda.io/d/_dcgSn33D4N9",
        lastOrderAt: "2026-03-07T10:00:00.000Z",
        sourceRecordCount: 12,
      },
    },
    ...overrides,
  };
}

describe("CustomerSuccessAccountWorkspace", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("posts a note and refreshes the timeline", async () => {
    let getCount = 0;
    const initialDetail = buildDetail();
    const refreshedDetail = buildDetail({
      timeline: [
        {
          id: "event_2",
          accountId: "acct_1",
          type: "relationship",
          title: "Fresh note",
          description: "Reviewed rollout blockers",
          occurredAt: "2026-03-09T11:00:00.000Z",
        },
        ...initialDetail.timeline,
      ],
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/customer-success/accounts/acct_1" && (!init?.method || init.method === "GET")) {
        getCount += 1;
        return {
          ok: true,
          status: 200,
          json: async () => (getCount === 1 ? initialDetail : refreshedDetail),
        } as Response;
      }

      if (url === "/api/customer-success/accounts/acct_1/notes" && init?.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: "note_1" }),
        } as Response;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<CustomerSuccessAccountWorkspace accountId="acct_1" />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Acme Co" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Timeline" }));
    fireEvent.change(screen.getByPlaceholderText("Optional title"), { target: { value: "Weekly review" } });
    fireEvent.change(screen.getByPlaceholderText("Capture meeting takeaways, relationship context, or risk notes"), {
      target: { value: "Reviewed rollout blockers" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Note" }));

    await waitFor(() => {
      expect(screen.getByText("Note added to the account timeline.")).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByText("Fresh note")).toBeTruthy();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/customer-success/accounts/acct_1/notes",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("does not expose local task creation in the account workspace", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => buildDetail(),
      }))
    );

    render(<CustomerSuccessAccountWorkspace accountId="acct_1" />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Acme Co" })).toBeTruthy();
    });

    expect(screen.queryByRole("button", { name: "Tasks" })).toBeNull();
    expect(screen.queryByText(/Create Linked Task/i)).toBeNull();
    expect(screen.queryByText(/Linked Tasks/i)).toBeNull();
  });

  it("resolves an alert and refreshes the attention queue", async () => {
    let getCount = 0;
    const initialDetail = buildDetail({
      alerts: [
        {
          id: "alert_1",
          accountId: "acct_1",
          title: "Renewal risk rising",
          category: "risk",
          severity: "high",
          status: "open",
          slaStatus: "at_risk",
          source: "commercial",
          evidence: ["Renewal in 30 days"],
          suggestedAction: "Confirm champion and rollout plan",
          createdAt: "2026-03-09T10:00:00.000Z",
          updatedAt: "2026-03-10T08:00:00.000Z",
        },
      ],
    });
    const refreshedDetail = buildDetail({
      alerts: [
        {
          id: "alert_1",
          accountId: "acct_1",
          title: "Renewal risk rising",
          category: "risk",
          severity: "high",
          status: "resolved",
          slaStatus: "on_track",
          source: "commercial",
          evidence: ["Champion confirmed"],
          suggestedAction: "Continue weekly check-ins",
          createdAt: "2026-03-09T10:00:00.000Z",
          updatedAt: "2026-03-10T09:00:00.000Z",
        },
      ],
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/customer-success/accounts/acct_1" && (!init?.method || init.method === "GET")) {
        getCount += 1;
        return {
          ok: true,
          status: 200,
          json: async () => (getCount === 1 ? initialDetail : refreshedDetail),
        } as Response;
      }

      if (url === "/api/customer-success/accounts/acct_1/alerts/alert_1/status" && init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "alert_1" }),
        } as Response;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<CustomerSuccessAccountWorkspace accountId="acct_1" />);

    await waitFor(() => {
      expect(screen.getByText("Renewal risk rising")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));

    await waitFor(() => {
      expect(screen.getByText("Alert resolved.")).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByText(/High • Resolved • On Track/)).toBeTruthy();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/customer-success/accounts/acct_1/alerts/alert_1/status",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("dismisses an alert and refreshes the attention queue", async () => {
    let getCount = 0;
    const initialDetail = buildDetail({
      alerts: [
        {
          id: "alert_1",
          accountId: "acct_1",
          title: "Relationship gap detected",
          category: "risk",
          severity: "medium",
          status: "open",
          slaStatus: "at_risk",
          source: "relationship",
          evidence: ["No exec touch in 45 days"],
          suggestedAction: "Rebuild sponsor alignment",
          createdAt: "2026-03-09T10:00:00.000Z",
          updatedAt: "2026-03-10T08:00:00.000Z",
        },
      ],
    });
    const refreshedDetail = buildDetail({
      alerts: [
        {
          id: "alert_1",
          accountId: "acct_1",
          title: "Relationship gap detected",
          category: "risk",
          severity: "medium",
          status: "dismissed",
          slaStatus: "on_track",
          source: "relationship",
          evidence: ["False positive after manual review"],
          suggestedAction: "No follow-up needed",
          createdAt: "2026-03-09T10:00:00.000Z",
          updatedAt: "2026-03-10T09:00:00.000Z",
        },
      ],
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/customer-success/accounts/acct_1" && (!init?.method || init.method === "GET")) {
        getCount += 1;
        return {
          ok: true,
          status: 200,
          json: async () => (getCount === 1 ? initialDetail : refreshedDetail),
        } as Response;
      }

      if (url === "/api/customer-success/accounts/acct_1/alerts/alert_1/status" && init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "alert_1" }),
        } as Response;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<CustomerSuccessAccountWorkspace accountId="acct_1" />);

    await waitFor(() => {
      expect(screen.getByText("Relationship gap detected")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    await waitFor(() => {
      expect(screen.getByText("Alert dismissed.")).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByText(/Medium • Dismissed • On Track/)).toBeTruthy();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/customer-success/accounts/acct_1/alerts/alert_1/status",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("marks an alert in progress and refreshes the attention queue", async () => {
    let getCount = 0;
    const initialDetail = buildDetail({
      alerts: [
        {
          id: "alert_1",
          accountId: "acct_1",
          title: "Implementation plan stalled",
          category: "risk",
          severity: "medium",
          status: "open",
          slaStatus: "at_risk",
          source: "workflow",
          evidence: ["Milestone completion slipped"],
          suggestedAction: "Coordinate unblock with implementation lead",
          createdAt: "2026-03-09T10:00:00.000Z",
          updatedAt: "2026-03-10T08:00:00.000Z",
        },
      ],
    });
    const refreshedDetail = buildDetail({
      alerts: [
        {
          id: "alert_1",
          accountId: "acct_1",
          title: "Implementation plan stalled",
          category: "risk",
          severity: "medium",
          status: "in_progress",
          slaStatus: "on_track",
          source: "workflow",
          evidence: ["Owner assigned and recovery plan in motion"],
          suggestedAction: "Track weekly until the milestone is back on plan",
          createdAt: "2026-03-09T10:00:00.000Z",
          updatedAt: "2026-03-10T09:00:00.000Z",
        },
      ],
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/customer-success/accounts/acct_1" && (!init?.method || init.method === "GET")) {
        getCount += 1;
        return {
          ok: true,
          status: 200,
          json: async () => (getCount === 1 ? initialDetail : refreshedDetail),
        } as Response;
      }

      if (url === "/api/customer-success/accounts/acct_1/alerts/alert_1/status" && init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "alert_1" }),
        } as Response;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<CustomerSuccessAccountWorkspace accountId="acct_1" />);

    await waitFor(() => {
      expect(screen.getByText("Implementation plan stalled")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Mark In Progress" }));

    await waitFor(() => {
      expect(screen.getByText("Alert moved to in progress.")).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByText(/Medium • In Progress • On Track/)).toBeTruthy();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/customer-success/accounts/acct_1/alerts/alert_1/status",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("renders retention leading indicators in the health view", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => buildDetail(),
      }))
    );

    render(<CustomerSuccessAccountWorkspace accountId="acct_1" />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Acme Co" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Health Details" }));

    expect(screen.getByText("Retention Leading Indicators")).toBeTruthy();
    expect(screen.getByText("Activity recency")).toBeTruthy();
    expect(screen.getByText("5d since touch")).toBeTruthy();
  });

  it("renders relationship intelligence from Coda and retention overlays", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => buildDetail(),
    })) as unknown as typeof fetch);

    render(<CustomerSuccessAccountWorkspace accountId="acct_1" />);

    await waitFor(() => {
      expect(screen.getByText("Relationship Intelligence")).toBeTruthy();
    });

    expect(screen.getByText("Unified provider links, Arda and Coda account metadata, and current retention posture.")).toBeTruthy();
    expect(screen.getByText("Arda")).toBeTruthy();
    expect(screen.getByText("Main Coda Doc")).toBeTruthy();
    expect(screen.getByText("Low recent activity")).toBeTruthy();
    expect(screen.getByText(/Customer Success and Implementation/)).toBeTruthy();
  });
});
