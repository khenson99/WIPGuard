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
    tasks: [],
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
      expect(screen.getByText("Acme Co")).toBeTruthy();
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
      expect(screen.getByText("Acme Co")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Health Details" }));

    expect(screen.getByText("Retention Leading Indicators")).toBeTruthy();
    expect(screen.getByText("Activity recency")).toBeTruthy();
    expect(screen.getByText("5d since touch")).toBeTruthy();
  });
});
