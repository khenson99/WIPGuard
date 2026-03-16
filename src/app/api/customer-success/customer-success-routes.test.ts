import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/customer-success/access", () => ({
  requireCustomerSuccessActor: vi.fn(),
}));

vi.mock("@/lib/customer-success/service", () => {
  class CustomerSuccessServiceError extends Error {
    constructor(
      message: string,
      public readonly status: number
    ) {
      super(message);
      this.name = "CustomerSuccessServiceError";
    }
  }

  return {
    CustomerSuccessServiceError,
    getCustomerSuccessPortfolio: vi.fn(),
    getCustomerSuccessAccountDetail: vi.fn(),
    createCustomerSuccessNote: vi.fn(),
    createCustomerSuccessPlan: vi.fn(),
    createCustomerSuccessOutreachDraft: vi.fn(),
    sendCustomerSuccessOutreach: vi.fn(),
    updateCustomerSuccessAlertStatus: vi.fn(),
  };
});

vi.mock("@/lib/permissions", () => ({
  enforcePermission: vi.fn(),
}));

const ACTOR = {
  id: "user_1",
  organizationId: "org_1",
  email: "owner@example.com",
  name: "Owner",
};

function accountContext(accountId = "acct_1") {
  return { params: Promise.resolve({ accountId }) };
}

function alertContext(accountId = "acct_1", alertId = "alert_1") {
  return { params: Promise.resolve({ accountId, alertId }) };
}

describe("customer-success mutation routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it("passes through auth failures for note creation", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/notes/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/notes", {
        method: "POST",
      }),
      accountContext()
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("passes through auth failures for portfolio reads", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const { GET } = await import("@/app/api/customer-success/portfolio/route");
    const response = await GET(
      new NextRequest("http://localhost/api/customer-success/portfolio")
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("passes through auth failures for alert updates", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { updateCustomerSuccessAlertStatus } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const { POST } = await import(
      "@/app/api/customer-success/accounts/[accountId]/alerts/[alertId]/status/route"
    );
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/alerts/alert_1/status", {
        method: "POST",
        body: JSON.stringify({ status: "RESOLVED" }),
        headers: { "content-type": "application/json" },
      }),
      alertContext()
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(updateCustomerSuccessAlertStatus).not.toHaveBeenCalled();
  });

  it("returns 410 for retired linked task creation", async () => {
    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/tasks/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/tasks", {
        method: "POST",
        body: JSON.stringify({ title: "Coordinate escalation" }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: "Customer success task creation has been retired with the Work section.",
    });
  });

  it("passes through auth failures for success plan creation", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessPlan } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/success-plan/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/success-plan", {
        method: "POST",
        body: JSON.stringify({ name: "Renewal Recovery" }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(createCustomerSuccessPlan).not.toHaveBeenCalled();
  });

  it("returns the customer-success portfolio for authenticated actors", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { getCustomerSuccessPortfolio } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(getCustomerSuccessPortfolio).mockResolvedValue({
      generatedAt: "2026-03-10T08:00:00.000Z",
      summary: {
        totalAccounts: 5,
        avgHealthScore: 74,
        atRiskAccounts: 1,
        openAlerts: 2,
      },
      healthDistribution: [],
      attentionAccounts: [],
      alerts: [],
      recentActivity: [],
      accounts: [],
    } as never);

    const { GET } = await import("@/app/api/customer-success/portfolio/route");
    const response = await GET(
      new NextRequest("http://localhost/api/customer-success/portfolio")
    );

    expect(response.status).toBe(200);
    expect(getCustomerSuccessPortfolio).toHaveBeenCalledWith(ACTOR);
  });

  it("maps note requests into createCustomerSuccessNote", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessNote } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(createCustomerSuccessNote).mockResolvedValue({
      id: "note_1",
      body: "Capture renewal risk and stakeholder changes",
    } as never);

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/notes/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/notes", {
        method: "POST",
        body: JSON.stringify({
          title: "QBR follow-up",
          body: "Capture renewal risk and stakeholder changes",
          source: "MEETING",
          visibility: "RESTRICTED",
          metadata: { meetingId: "mtg_1" },
        }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(201);
    expect(createCustomerSuccessNote).toHaveBeenCalledWith(ACTOR, {
      accountId: "acct_1",
      title: "QBR follow-up",
      body: "Capture renewal risk and stakeholder changes",
      source: "MEETING",
      visibility: "RESTRICTED",
      metadata: { meetingId: "mtg_1" },
    });
  });

  it("rejects note creation when body is missing", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessNote } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/notes/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/notes", {
        method: "POST",
        body: JSON.stringify({ body: "   " }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Note body is required" });
    expect(createCustomerSuccessNote).not.toHaveBeenCalled();
  });

  it("rejects note creation when account id is missing", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessNote } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/notes/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/notes", {
        method: "POST",
        body: JSON.stringify({ body: "Capture renewal risk and stakeholder changes" }),
        headers: { "content-type": "application/json" },
      }),
      accountContext("")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Account id is required" });
    expect(createCustomerSuccessNote).not.toHaveBeenCalled();
  });

  it("filters blank milestone titles before creating success plans", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessPlan } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(createCustomerSuccessPlan).mockResolvedValue({ id: "plan_1" } as never);

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/success-plan/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/success-plan", {
        method: "POST",
        body: JSON.stringify({
          name: "Renewal Recovery",
          templateKey: "renewal-recovery",
          targetDate: "2026-04-01",
          milestoneTitles: ["Reconfirm champion", "", "   ", "Ship adoption report"],
        }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(201);
    expect(createCustomerSuccessPlan).toHaveBeenCalledWith(ACTOR, {
      accountId: "acct_1",
      name: "Renewal Recovery",
      templateKey: "renewal-recovery",
      targetDate: "2026-04-01",
      milestoneTitles: ["Reconfirm champion", "Ship adoption report"],
    });
  });

  it("rejects success plan creation when name is missing", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessPlan } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/success-plan/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/success-plan", {
        method: "POST",
        body: JSON.stringify({ name: "   " }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Success plan name is required" });
    expect(createCustomerSuccessPlan).not.toHaveBeenCalled();
  });

  it("rejects success plan creation when account id is missing", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessPlan } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/success-plan/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/success-plan", {
        method: "POST",
        body: JSON.stringify({ name: "Renewal Recovery" }),
        headers: { "content-type": "application/json" },
      }),
      accountContext("")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Account id is required" });
    expect(createCustomerSuccessPlan).not.toHaveBeenCalled();
  });

  it("maps customer-success service errors for success plan creation", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessPlan, CustomerSuccessServiceError } = await import(
      "@/lib/customer-success/service"
    );

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(createCustomerSuccessPlan).mockRejectedValue(
      new CustomerSuccessServiceError("Success plan template is invalid", 400)
    );

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/success-plan/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/success-plan", {
        method: "POST",
        body: JSON.stringify({ name: "Renewal Recovery" }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Success plan template is invalid" });
  });

  it("returns 500s for unexpected success plan creation failures", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessPlan } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(createCustomerSuccessPlan).mockRejectedValue(new Error("Plan store unavailable"));

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/success-plan/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/success-plan", {
        method: "POST",
        body: JSON.stringify({ name: "Renewal Recovery" }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Plan store unavailable" });
  });

  it("returns generic 500s for non-error success plan creation failures", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessPlan } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(createCustomerSuccessPlan).mockRejectedValue("plan-store-down");

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/success-plan/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/success-plan", {
        method: "POST",
        body: JSON.stringify({ name: "Renewal Recovery" }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to create customer success plan" });
  });

  it("returns 404 when a customer-success account detail is missing", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { getCustomerSuccessAccountDetail } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(getCustomerSuccessAccountDetail).mockResolvedValue(null as never);

    const { GET } = await import("@/app/api/customer-success/accounts/[accountId]/route");
    const response = await GET(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_missing"),
      accountContext("acct_missing")
    );

    expect(response.status).toBe(404);
    expect(getCustomerSuccessAccountDetail).toHaveBeenCalledWith(ACTOR, "acct_missing");
    await expect(response.json()).resolves.toEqual({
      error: "Customer success account not found",
    });
  });

  it("returns account detail for authenticated actors", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { getCustomerSuccessAccountDetail } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(getCustomerSuccessAccountDetail).mockResolvedValue({
      accountId: "acct_1",
      name: "Acme Co",
      lifecycleStage: "ACTIVE",
      health: {
        score: 81,
        grade: "B",
        trend: "stable",
        confidence: 88,
        updatedAt: "2026-03-10T08:00:00.000Z",
        components: {
          adoption: {
            score: 80,
            weight: 0.24,
            weightedScore: 19.2,
            trend: "stable",
            status: "healthy",
            evidence: [],
            lastUpdatedAt: "2026-03-10T08:00:00.000Z",
          },
          engagement: {
            score: 82,
            weight: 0.22,
            weightedScore: 18,
            trend: "stable",
            status: "healthy",
            evidence: [],
            lastUpdatedAt: "2026-03-10T08:00:00.000Z",
          },
          relationship: {
            score: 83,
            weight: 0.2,
            weightedScore: 16.6,
            trend: "stable",
            status: "healthy",
            evidence: [],
            lastUpdatedAt: "2026-03-10T08:00:00.000Z",
          },
          support: {
            score: 79,
            weight: 0.2,
            weightedScore: 15.8,
            trend: "stable",
            status: "watch",
            evidence: [],
            lastUpdatedAt: "2026-03-10T08:00:00.000Z",
          },
          commercial: {
            score: 81,
            weight: 0.14,
            weightedScore: 11.3,
            trend: "stable",
            status: "healthy",
            evidence: [],
            lastUpdatedAt: "2026-03-10T08:00:00.000Z",
          },
        },
      },
      alerts: [],
      timeline: [],
      stakeholders: [],
      tasks: [],
      successPlan: { milestones: [] },
      outreach: { recommendedTemplates: [], recentMessages: [] },
    } as never);

    const { GET } = await import("@/app/api/customer-success/accounts/[accountId]/route");
    const response = await GET(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1"),
      accountContext()
    );

    expect(response.status).toBe(200);
    expect(getCustomerSuccessAccountDetail).toHaveBeenCalledWith(ACTOR, "acct_1");
  });

  it("validates required outreach draft fields", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessOutreachDraft } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/outreach/drafts/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/outreach/drafts", {
        method: "POST",
        body: JSON.stringify({ recipientAddress: "ops@example.com" }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(400);
    expect(createCustomerSuccessOutreachDraft).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "channel, recipientAddress, and body are required",
    });
  });

  it("maps outreach send requests into sendCustomerSuccessOutreach", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { sendCustomerSuccessOutreach } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(sendCustomerSuccessOutreach).mockResolvedValue({ id: "msg_1" } as never);

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/outreach/send/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/outreach/send", {
        method: "POST",
        body: JSON.stringify({
          channel: "EMAIL",
          recipientAddress: "champion@example.com",
          recipientName: "Taylor",
          templateKey: "renewal-risk",
          subject: "Renewal risk follow-up",
          body: "Here is the recovery plan.",
          metadata: { source: "cs-workspace" },
        }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(201);
    expect(sendCustomerSuccessOutreach).toHaveBeenCalledWith(ACTOR, {
      accountId: "acct_1",
      channel: "EMAIL",
      recipientAddress: "champion@example.com",
      recipientName: "Taylor",
      templateKey: "renewal-risk",
      subject: "Renewal risk follow-up",
      body: "Here is the recovery plan.",
      metadata: { source: "cs-workspace" },
    });
  });

  it("maps customer-success service errors for alert updates", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { CustomerSuccessServiceError, updateCustomerSuccessAlertStatus } = await import(
      "@/lib/customer-success/service"
    );

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(updateCustomerSuccessAlertStatus).mockRejectedValue(
      new CustomerSuccessServiceError("Alert not found", 404)
    );

    const { POST } = await import(
      "@/app/api/customer-success/accounts/[accountId]/alerts/[alertId]/status/route"
    );
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/alerts/alert_1/status", {
        method: "POST",
        body: JSON.stringify({ status: "RESOLVED" }),
        headers: { "content-type": "application/json" },
      }),
      alertContext()
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Alert not found" });
  });

  it("returns 500s for unexpected alert update failures", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { updateCustomerSuccessAlertStatus } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(updateCustomerSuccessAlertStatus).mockRejectedValue(new Error("Database unavailable"));

    const { POST } = await import(
      "@/app/api/customer-success/accounts/[accountId]/alerts/[alertId]/status/route"
    );
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/alerts/alert_1/status", {
        method: "POST",
        body: JSON.stringify({ status: "RESOLVED" }),
        headers: { "content-type": "application/json" },
      }),
      alertContext()
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Database unavailable" });
  });

  it("returns generic 500s for non-error alert update failures", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { updateCustomerSuccessAlertStatus } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(updateCustomerSuccessAlertStatus).mockRejectedValue("db-down");

    const { POST } = await import(
      "@/app/api/customer-success/accounts/[accountId]/alerts/[alertId]/status/route"
    );
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/alerts/alert_1/status", {
        method: "POST",
        body: JSON.stringify({ status: "RESOLVED" }),
        headers: { "content-type": "application/json" },
      }),
      alertContext()
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to update customer success alert" });
  });

  it("rejects alert updates when status is missing", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { updateCustomerSuccessAlertStatus } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });

    const { POST } = await import(
      "@/app/api/customer-success/accounts/[accountId]/alerts/[alertId]/status/route"
    );
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/alerts/alert_1/status", {
        method: "POST",
        body: JSON.stringify({ status: "   " }),
        headers: { "content-type": "application/json" },
      }),
      alertContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Alert status is required" });
    expect(updateCustomerSuccessAlertStatus).not.toHaveBeenCalled();
  });

  it("rejects alert updates when route params are missing", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { updateCustomerSuccessAlertStatus } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });

    const { POST } = await import(
      "@/app/api/customer-success/accounts/[accountId]/alerts/[alertId]/status/route"
    );
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/alerts/alert_1/status", {
        method: "POST",
        body: JSON.stringify({ status: "RESOLVED" }),
        headers: { "content-type": "application/json" },
      }),
      alertContext("", "")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Account id and alert id are required" });
    expect(updateCustomerSuccessAlertStatus).not.toHaveBeenCalled();
  });

  it("maps alert status updates into updateCustomerSuccessAlertStatus", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { updateCustomerSuccessAlertStatus } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(updateCustomerSuccessAlertStatus).mockResolvedValue({ id: "alert_1" } as never);

    const { POST } = await import(
      "@/app/api/customer-success/accounts/[accountId]/alerts/[alertId]/status/route"
    );
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/alerts/alert_1/status", {
        method: "POST",
        body: JSON.stringify({ status: "IN_PROGRESS" }),
        headers: { "content-type": "application/json" },
      }),
      alertContext()
    );

    expect(response.status).toBe(200);
    expect(updateCustomerSuccessAlertStatus).toHaveBeenCalledWith(ACTOR, {
      accountId: "acct_1",
      alertId: "alert_1",
      status: "IN_PROGRESS",
    });
  });

  it("maps resolved alert status updates into updateCustomerSuccessAlertStatus", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { updateCustomerSuccessAlertStatus } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(updateCustomerSuccessAlertStatus).mockResolvedValue({
      id: "alert_1",
      status: "RESOLVED",
    } as never);

    const { POST } = await import(
      "@/app/api/customer-success/accounts/[accountId]/alerts/[alertId]/status/route"
    );
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/alerts/alert_1/status", {
        method: "POST",
        body: JSON.stringify({ status: "RESOLVED" }),
        headers: { "content-type": "application/json" },
      }),
      alertContext()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "alert_1",
      status: "RESOLVED",
    });
    expect(updateCustomerSuccessAlertStatus).toHaveBeenCalledWith(ACTOR, {
      accountId: "acct_1",
      alertId: "alert_1",
      status: "RESOLVED",
    });
  });

  it("maps dismissed alert status updates into updateCustomerSuccessAlertStatus", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { updateCustomerSuccessAlertStatus } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(updateCustomerSuccessAlertStatus).mockResolvedValue({
      id: "alert_1",
      status: "DISMISSED",
    } as never);

    const { POST } = await import(
      "@/app/api/customer-success/accounts/[accountId]/alerts/[alertId]/status/route"
    );
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/alerts/alert_1/status", {
        method: "POST",
        body: JSON.stringify({ status: "DISMISSED" }),
        headers: { "content-type": "application/json" },
      }),
      alertContext()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "alert_1",
      status: "DISMISSED",
    });
    expect(updateCustomerSuccessAlertStatus).toHaveBeenCalledWith(ACTOR, {
      accountId: "acct_1",
      alertId: "alert_1",
      status: "DISMISSED",
    });
  });
});
