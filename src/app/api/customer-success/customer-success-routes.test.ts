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
    getCustomerSuccessAlertFeed: vi.fn(),
    getCustomerSuccessActivityFeed: vi.fn(),
    createCustomerSuccessNote: vi.fn(),
    createCustomerSuccessTask: vi.fn(),
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

  it("passes through auth failures for alert feed reads", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { getCustomerSuccessAlertFeed } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const { GET } = await import("@/app/api/customer-success/alerts/route");
    const response = await GET(new NextRequest("http://localhost/api/customer-success/alerts"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(getCustomerSuccessAlertFeed).not.toHaveBeenCalled();
  });

  it("passes through auth failures for activity feed reads", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { getCustomerSuccessActivityFeed } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const { GET } = await import("@/app/api/customer-success/activity/route");
    const response = await GET(new NextRequest("http://localhost/api/customer-success/activity"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(getCustomerSuccessActivityFeed).not.toHaveBeenCalled();
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

  it("passes through auth failures for linked task creation", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { enforcePermission } = await import("@/lib/permissions");
    const { createCustomerSuccessTask } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/tasks/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/tasks", {
        method: "POST",
        body: JSON.stringify({ title: "Coordinate escalation" }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(enforcePermission).not.toHaveBeenCalled();
    expect(createCustomerSuccessTask).not.toHaveBeenCalled();
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

  it("passes through auth failures for outreach draft creation", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessOutreachDraft } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const { POST } = await import(
      "@/app/api/customer-success/accounts/[accountId]/outreach/drafts/route"
    );
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/outreach/drafts", {
        method: "POST",
        body: JSON.stringify({
          channel: "EMAIL",
          recipientAddress: "owner@example.com",
          body: "Checking in on renewal risk.",
        }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(createCustomerSuccessOutreachDraft).not.toHaveBeenCalled();
  });

  it("passes through auth failures for outreach sends", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { sendCustomerSuccessOutreach } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const { POST } = await import(
      "@/app/api/customer-success/accounts/[accountId]/outreach/send/route"
    );
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/outreach/send", {
        method: "POST",
        body: JSON.stringify({
          channel: "EMAIL",
          recipientAddress: "owner@example.com",
          body: "Following up on onboarding blockers.",
        }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(sendCustomerSuccessOutreach).not.toHaveBeenCalled();
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

  it("returns the customer-success alert feed for authenticated actors", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { getCustomerSuccessAlertFeed } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(getCustomerSuccessAlertFeed).mockResolvedValue({
      generatedAt: "2026-03-10T08:00:00.000Z",
      alerts: [{ id: "alert_1", accountId: "acct_1", severity: "HIGH", title: "Engagement dropped" }],
    } as never);

    const { GET } = await import("@/app/api/customer-success/alerts/route");
    const response = await GET(new NextRequest("http://localhost/api/customer-success/alerts"));

    expect(response.status).toBe(200);
    expect(getCustomerSuccessAlertFeed).toHaveBeenCalledWith(ACTOR);
  });

  it("returns the customer-success activity feed for authenticated actors", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { getCustomerSuccessActivityFeed } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(getCustomerSuccessActivityFeed).mockResolvedValue({
      generatedAt: "2026-03-10T08:00:00.000Z",
      items: [
        { id: "activity_1", accountId: "acct_1", type: "NOTE_CREATED", title: "Renewal follow-up captured" },
      ],
    } as never);

    const { GET } = await import("@/app/api/customer-success/activity/route");
    const response = await GET(new NextRequest("http://localhost/api/customer-success/activity"));

    expect(response.status).toBe(200);
    expect(getCustomerSuccessActivityFeed).toHaveBeenCalledWith(ACTOR);
  });

  it("returns 500s for unexpected alert feed failures", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { getCustomerSuccessAlertFeed } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(getCustomerSuccessAlertFeed).mockRejectedValue(new Error("Alert store unavailable"));

    const { GET } = await import("@/app/api/customer-success/alerts/route");
    const response = await GET(new NextRequest("http://localhost/api/customer-success/alerts"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Alert store unavailable" });
  });

  it("returns 500s for unexpected activity feed failures", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { getCustomerSuccessActivityFeed } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(getCustomerSuccessActivityFeed).mockRejectedValue(new Error("Activity store unavailable"));

    const { GET } = await import("@/app/api/customer-success/activity/route");
    const response = await GET(new NextRequest("http://localhost/api/customer-success/activity"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Activity store unavailable" });
  });

  it("returns fallback 500s for non-error alert feed failures", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { getCustomerSuccessAlertFeed } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(getCustomerSuccessAlertFeed).mockRejectedValue("alert failure");

    const { GET } = await import("@/app/api/customer-success/alerts/route");
    const response = await GET(new NextRequest("http://localhost/api/customer-success/alerts"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to load customer success alerts" });
  });

  it("returns fallback 500s for non-error activity feed failures", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { getCustomerSuccessActivityFeed } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(getCustomerSuccessActivityFeed).mockRejectedValue("activity failure");

    const { GET } = await import("@/app/api/customer-success/activity/route");
    const response = await GET(new NextRequest("http://localhost/api/customer-success/activity"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to load customer success activity" });
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

  it("maps customer-success service errors for note creation", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessNote, CustomerSuccessServiceError } = await import(
      "@/lib/customer-success/service"
    );

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(createCustomerSuccessNote).mockRejectedValue(
      new CustomerSuccessServiceError("Note visibility is invalid", 400)
    );

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/notes/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/notes", {
        method: "POST",
        body: JSON.stringify({ body: "Capture renewal risk and stakeholder changes" }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Note visibility is invalid" });
  });

  it("returns 500s for unexpected note creation failures", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessNote } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(createCustomerSuccessNote).mockRejectedValue(new Error("Note store unavailable"));

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/notes/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/notes", {
        method: "POST",
        body: JSON.stringify({ body: "Capture renewal risk and stakeholder changes" }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Note store unavailable" });
  });

  it("returns generic 500s for non-error note creation failures", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessNote } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(createCustomerSuccessNote).mockRejectedValue("note-store-down");

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/notes/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/notes", {
        method: "POST",
        body: JSON.stringify({ body: "Capture renewal risk and stakeholder changes" }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to create customer success note" });
  });

  it("returns task permission denials before creating linked tasks", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { enforcePermission } = await import("@/lib/permissions");
    const { createCustomerSuccessTask } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(enforcePermission).mockResolvedValue({
      deniedResponse: NextResponse.json({ error: "Task write denied" }, { status: 403 }),
    } as never);

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/tasks/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/tasks", {
        method: "POST",
        body: JSON.stringify({ title: "Schedule escalation call" }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(403);
    expect(createCustomerSuccessTask).not.toHaveBeenCalled();
  });

  it("filters empty responsibility ids before creating linked tasks", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessTask } = await import("@/lib/customer-success/service");
    const { enforcePermission } = await import("@/lib/permissions");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(enforcePermission).mockResolvedValue({ deniedResponse: null } as never);
    vi.mocked(createCustomerSuccessTask).mockResolvedValue({ id: "task_1" } as never);

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/tasks/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "Coordinate exec recovery plan",
          notes: "Includes product + support owners",
          status: "ACTIVE",
          priority: "P1",
          dueDate: "2026-03-15",
          responsibleIds: ["user_2", "", "   ", 9],
          accountableIds: ["user_3"],
          consultedIds: ["user_4", null],
          informedIds: ["user_5", undefined],
        }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(201);
    expect(createCustomerSuccessTask).toHaveBeenCalledWith(ACTOR, {
      accountId: "acct_1",
      title: "Coordinate exec recovery plan",
      notes: "Includes product + support owners",
      status: "ACTIVE",
      priority: "P1",
      dueDate: "2026-03-15",
      responsibleIds: ["user_2"],
      accountableIds: ["user_3"],
      consultedIds: ["user_4"],
      informedIds: ["user_5"],
    });
  });

  it("rejects linked task creation when title is missing", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessTask } = await import("@/lib/customer-success/service");
    const { enforcePermission } = await import("@/lib/permissions");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(enforcePermission).mockResolvedValue({ deniedResponse: null } as never);

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/tasks/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/tasks", {
        method: "POST",
        body: JSON.stringify({ title: "   " }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Task title is required" });
    expect(createCustomerSuccessTask).not.toHaveBeenCalled();
  });

  it("rejects linked task creation when account id is missing", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessTask } = await import("@/lib/customer-success/service");
    const { enforcePermission } = await import("@/lib/permissions");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(enforcePermission).mockResolvedValue({ deniedResponse: null } as never);

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/tasks/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/tasks", {
        method: "POST",
        body: JSON.stringify({ title: "Coordinate exec recovery plan" }),
        headers: { "content-type": "application/json" },
      }),
      accountContext("")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Account id is required" });
    expect(createCustomerSuccessTask).not.toHaveBeenCalled();
  });

  it("maps customer-success service errors for linked task creation", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessTask, CustomerSuccessServiceError } = await import(
      "@/lib/customer-success/service"
    );
    const { enforcePermission } = await import("@/lib/permissions");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(enforcePermission).mockResolvedValue({ deniedResponse: null } as never);
    vi.mocked(createCustomerSuccessTask).mockRejectedValue(
      new CustomerSuccessServiceError("Task owner is invalid", 400)
    );

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/tasks/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/tasks", {
        method: "POST",
        body: JSON.stringify({ title: "Coordinate exec recovery plan" }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Task owner is invalid" });
  });

  it("returns 500s for unexpected linked task creation failures", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessTask } = await import("@/lib/customer-success/service");
    const { enforcePermission } = await import("@/lib/permissions");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(enforcePermission).mockResolvedValue({ deniedResponse: null } as never);
    vi.mocked(createCustomerSuccessTask).mockRejectedValue(new Error("Task store unavailable"));

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/tasks/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/tasks", {
        method: "POST",
        body: JSON.stringify({ title: "Coordinate exec recovery plan" }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Task store unavailable" });
  });

  it("returns generic 500s for non-error linked task creation failures", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessTask } = await import("@/lib/customer-success/service");
    const { enforcePermission } = await import("@/lib/permissions");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(enforcePermission).mockResolvedValue({ deniedResponse: null } as never);
    vi.mocked(createCustomerSuccessTask).mockRejectedValue("task-store-down");

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/tasks/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/tasks", {
        method: "POST",
        body: JSON.stringify({ title: "Coordinate exec recovery plan" }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to create linked customer success task" });
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

  it("maps outreach draft requests into createCustomerSuccessOutreachDraft", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessOutreachDraft } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(createCustomerSuccessOutreachDraft).mockResolvedValue({ id: "draft_1" } as never);

    const { POST } = await import(
      "@/app/api/customer-success/accounts/[accountId]/outreach/drafts/route"
    );
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/outreach/drafts", {
        method: "POST",
        body: JSON.stringify({
          channel: "EMAIL",
          recipientAddress: "ops@example.com",
          recipientName: "Pat",
          templateKey: "renewal-recovery",
          subject: "Recovery plan draft",
          body: "Drafting the next step plan.",
          metadata: { source: "workspace" },
        }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(201);
    expect(createCustomerSuccessOutreachDraft).toHaveBeenCalledWith(ACTOR, {
      accountId: "acct_1",
      channel: "EMAIL",
      recipientAddress: "ops@example.com",
      recipientName: "Pat",
      templateKey: "renewal-recovery",
      subject: "Recovery plan draft",
      body: "Drafting the next step plan.",
      metadata: { source: "workspace" },
    });
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

  it("rejects outreach draft creation when account id is missing", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessOutreachDraft } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });

    const { POST } = await import(
      "@/app/api/customer-success/accounts/[accountId]/outreach/drafts/route"
    );
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/outreach/drafts", {
        method: "POST",
        body: JSON.stringify({
          channel: "EMAIL",
          recipientAddress: "ops@example.com",
          body: "Sharing the latest recovery plan.",
        }),
        headers: { "content-type": "application/json" },
      }),
      accountContext("")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Account id is required" });
    expect(createCustomerSuccessOutreachDraft).not.toHaveBeenCalled();
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

  it("validates required outreach send fields", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { sendCustomerSuccessOutreach } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/outreach/send/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/outreach/send", {
        method: "POST",
        body: JSON.stringify({ recipientAddress: "ops@example.com" }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(400);
    expect(sendCustomerSuccessOutreach).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "channel, recipientAddress, and body are required",
    });
  });

  it("rejects outreach sends when account id is missing", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { sendCustomerSuccessOutreach } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/outreach/send/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/outreach/send", {
        method: "POST",
        body: JSON.stringify({
          channel: "EMAIL",
          recipientAddress: "champion@example.com",
          body: "Checking in on implementation milestones.",
        }),
        headers: { "content-type": "application/json" },
      }),
      accountContext("")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Account id is required" });
    expect(sendCustomerSuccessOutreach).not.toHaveBeenCalled();
  });

  it("maps customer-success service errors for outreach draft creation", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessOutreachDraft, CustomerSuccessServiceError } = await import(
      "@/lib/customer-success/service"
    );

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(createCustomerSuccessOutreachDraft).mockRejectedValue(
      new CustomerSuccessServiceError("Outreach template is invalid", 400)
    );

    const { POST } = await import(
      "@/app/api/customer-success/accounts/[accountId]/outreach/drafts/route"
    );
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/outreach/drafts", {
        method: "POST",
        body: JSON.stringify({
          channel: "EMAIL",
          recipientAddress: "ops@example.com",
          body: "Sharing a follow-up draft.",
        }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Outreach template is invalid" });
  });

  it("maps customer-success service errors for outreach sends", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { sendCustomerSuccessOutreach, CustomerSuccessServiceError } = await import(
      "@/lib/customer-success/service"
    );

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(sendCustomerSuccessOutreach).mockRejectedValue(
      new CustomerSuccessServiceError("Recipient address is invalid", 400)
    );

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/outreach/send/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/outreach/send", {
        method: "POST",
        body: JSON.stringify({
          channel: "EMAIL",
          recipientAddress: "ops@example.com",
          body: "Sharing the implementation follow-up.",
        }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Recipient address is invalid" });
  });

  it("returns 500s for unexpected outreach draft creation failures", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessOutreachDraft } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(createCustomerSuccessOutreachDraft).mockRejectedValue(new Error("Draft store unavailable"));

    const { POST } = await import(
      "@/app/api/customer-success/accounts/[accountId]/outreach/drafts/route"
    );
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/outreach/drafts", {
        method: "POST",
        body: JSON.stringify({
          channel: "EMAIL",
          recipientAddress: "ops@example.com",
          body: "Sharing a follow-up draft.",
        }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Draft store unavailable" });
  });

  it("returns 500s for unexpected outreach send failures", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { sendCustomerSuccessOutreach } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(sendCustomerSuccessOutreach).mockRejectedValue(new Error("Message queue unavailable"));

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/outreach/send/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/outreach/send", {
        method: "POST",
        body: JSON.stringify({
          channel: "EMAIL",
          recipientAddress: "ops@example.com",
          body: "Sending the implementation follow-up.",
        }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Message queue unavailable" });
  });

  it("returns fallback 500s for non-error outreach draft creation failures", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { createCustomerSuccessOutreachDraft } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(createCustomerSuccessOutreachDraft).mockRejectedValue("draft failure");

    const { POST } = await import(
      "@/app/api/customer-success/accounts/[accountId]/outreach/drafts/route"
    );
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/outreach/drafts", {
        method: "POST",
        body: JSON.stringify({
          channel: "EMAIL",
          recipientAddress: "ops@example.com",
          body: "Sharing a follow-up draft.",
        }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to create outreach draft" });
  });

  it("returns fallback 500s for non-error outreach send failures", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { sendCustomerSuccessOutreach } = await import("@/lib/customer-success/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(sendCustomerSuccessOutreach).mockRejectedValue("send failure");

    const { POST } = await import("@/app/api/customer-success/accounts/[accountId]/outreach/send/route");
    const response = await POST(
      new NextRequest("http://localhost/api/customer-success/accounts/acct_1/outreach/send", {
        method: "POST",
        body: JSON.stringify({
          channel: "EMAIL",
          recipientAddress: "ops@example.com",
          body: "Sending the implementation follow-up.",
        }),
        headers: { "content-type": "application/json" },
      }),
      accountContext()
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to queue outreach send" });
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
