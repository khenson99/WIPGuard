import { describe, expect, it } from "vitest";
import type { CustomerSuccessAccountSnapshot } from "@/lib/customer-success/service";
import {
  buildCustomerSuccessAccountDetailFromSnapshot,
  buildCustomerSuccessHealth,
  buildCustomerSuccessPortfolioFromSnapshots,
} from "@/lib/customer-success/service";

const NOW = new Date("2026-03-08T12:00:00.000Z");

function accountFixture(
  overrides: Partial<CustomerSuccessAccountSnapshot> & Pick<CustomerSuccessAccountSnapshot, "id" | "name">
): CustomerSuccessAccountSnapshot {
  return {
    id: overrides.id,
    name: overrides.name,
    segment: overrides.segment ?? "Mid-market",
    tier: overrides.tier ?? "Growth",
    lifecycleStage: overrides.lifecycleStage ?? "ACTIVE",
    ownerName: overrides.ownerName ?? "CS Owner",
    ownerEmail: overrides.ownerEmail ?? "owner@example.com",
    status: overrides.status ?? "ACTIVE",
    primaryDealAmount: overrides.primaryDealAmount ?? 24000,
    renewalDate: overrides.renewalDate ?? new Date("2026-06-15T00:00:00.000Z"),
    paymentStatus: overrides.paymentStatus ?? "current",
    expansionPotential: overrides.expansionPotential ?? "medium",
    externalProviders: overrides.externalProviders ?? ["HUBSPOT", "STRIPE", "SLACK", "GOOGLE_WORKSPACE", "CODA"],
    externalRefs: overrides.externalRefs ?? [
      {
        provider: "CODA",
        externalObjectType: "doc",
        externalId: "VYLC2rzPN_",
        label: "Customer Success and Implementation",
        isPrimary: true,
        metadata: {
          docUrl: "https://coda.io/d/_dVYLC2rzPN_",
        },
        updatedAt: new Date("2026-03-06T00:00:00.000Z"),
      },
    ],
    contacts: overrides.contacts ?? [
      {
        id: `${overrides.id}-contact-1`,
        firstName: "Taylor",
        lastName: "Champion",
        email: "taylor@example.com",
        title: "Director of Operations",
        updatedAt: new Date("2026-03-01T00:00:00.000Z"),
        createdAt: new Date("2025-10-01T00:00:00.000Z"),
      },
      {
        id: `${overrides.id}-contact-2`,
        firstName: "Jordan",
        lastName: "Admin",
        email: "jordan@example.com",
        title: "Operations Manager",
        updatedAt: new Date("2026-02-28T00:00:00.000Z"),
        createdAt: new Date("2025-10-15T00:00:00.000Z"),
      },
    ],
    notes: overrides.notes ?? [
      {
        id: `${overrides.id}-note-1`,
        title: "Weekly check-in",
        body: "Reviewed adoption milestones and confirmed success criteria.",
        createdAt: new Date("2026-03-03T00:00:00.000Z"),
        source: "MANUAL",
        authorName: "CS Owner",
      },
    ],
    alerts: overrides.alerts ?? [],
    plans: overrides.plans ?? [
      {
        id: `${overrides.id}-plan-1`,
        name: "Adoption plan",
        templateKey: "adoption",
        status: "ACTIVE",
        startedAt: new Date("2026-02-01T00:00:00.000Z"),
        targetDate: new Date("2026-04-01T00:00:00.000Z"),
        completedAt: null,
        milestones: [
          {
            id: `${overrides.id}-milestone-1`,
            title: "Enable workflow automation",
            status: "COMPLETED",
            dueDate: new Date("2026-02-15T00:00:00.000Z"),
          },
          {
            id: `${overrides.id}-milestone-2`,
            title: "Train champions",
            status: "IN_PROGRESS",
            dueDate: new Date("2026-03-20T00:00:00.000Z"),
          },
        ],
      },
    ],
    outreach: overrides.outreach ?? [
      {
        id: `${overrides.id}-message-1`,
        templateKey: "check-in",
        status: "SENT",
        subject: "Weekly adoption check-in",
        recipientName: "Taylor Champion",
        recipientAddress: "taylor@example.com",
        sentAt: new Date("2026-03-04T00:00:00.000Z"),
        createdAt: new Date("2026-03-04T00:00:00.000Z"),
        channel: "EMAIL",
      },
    ],
    tasks: overrides.tasks ?? [
      {
        id: `${overrides.id}-task-1`,
        title: "Review onboarding checklist",
        status: "DONE",
        priority: "P1",
        dueDate: new Date("2026-03-02T00:00:00.000Z"),
        createdAt: new Date("2026-02-20T00:00:00.000Z"),
        updatedAt: new Date("2026-03-02T00:00:00.000Z"),
        completedOn: new Date("2026-03-02T00:00:00.000Z"),
      },
      {
        id: `${overrides.id}-task-2`,
        title: "Ship exec summary",
        status: "ACTIVE",
        priority: "P1",
        dueDate: new Date("2026-03-15T00:00:00.000Z"),
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        updatedAt: new Date("2026-03-05T00:00:00.000Z"),
        completedOn: null,
      },
    ],
    meetings: overrides.meetings ?? [
      {
        id: `${overrides.id}-meeting-1`,
        title: "Operational review",
        status: "COMPLETED",
        startAt: new Date("2026-03-01T00:00:00.000Z"),
        attendees: [
          {
            id: `${overrides.id}-contact-1`,
            firstName: "Taylor",
            lastName: "Champion",
            email: "taylor@example.com",
            title: "Director of Operations",
          },
        ],
      },
    ],
    createdAt: overrides.createdAt ?? new Date("2025-11-01T00:00:00.000Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-03-05T00:00:00.000Z"),
  };
}

describe("customer success service", () => {
  it("verifies portfolio rendering for four fixture accounts", () => {
    const stalledOnboarding = accountFixture({
      id: "acct-stalled",
      name: "Stalled Onboarding",
      lifecycleStage: "ONBOARDING",
      externalProviders: ["HUBSPOT"],
      alerts: [
        {
          id: "alert-breached",
          title: "Onboarding kickoff slipped",
          category: "ACTION_REQUIRED",
          severity: "CRITICAL",
          status: "OPEN",
          slaStatus: "BREACHED",
          source: "WORKFLOW",
          openedAt: new Date("2026-03-06T00:00:00.000Z"),
          updatedAt: new Date("2026-03-07T00:00:00.000Z"),
          resolvedAt: null,
          suggestedAction: "Create a recovery plan and reschedule kickoff.",
          evidence: ["Kickoff milestone overdue", "No champion response in 10 days"],
        },
      ],
      tasks: [
        {
          id: "stalled-task-1",
          title: "Reschedule kickoff",
          status: "ACTIVE",
          priority: "P0",
          dueDate: new Date("2026-03-01T00:00:00.000Z"),
          createdAt: new Date("2026-02-20T00:00:00.000Z"),
          updatedAt: new Date("2026-03-06T00:00:00.000Z"),
          completedOn: null,
        },
      ],
      outreach: [],
      meetings: [],
      notes: [],
    });

    const healthyActive = accountFixture({
      id: "acct-healthy",
      name: "Healthy Active",
      lifecycleStage: "ACTIVE",
      expansionPotential: "high",
    });

    const expansionReady = accountFixture({
      id: "acct-expansion",
      name: "Expansion Ready",
      lifecycleStage: "EXPANSION",
      primaryDealAmount: 48000,
      alerts: [
        {
          id: "alert-opportunity",
          title: "Expansion conversation ready",
          category: "OPPORTUNITY",
          severity: "MEDIUM",
          status: "OPEN",
          slaStatus: "ON_TRACK",
          source: "COMMERCIAL",
          openedAt: new Date("2026-03-05T00:00:00.000Z"),
          updatedAt: new Date("2026-03-05T00:00:00.000Z"),
          resolvedAt: null,
          suggestedAction: "Schedule executive expansion review.",
          evidence: ["Usage up 34%", "Champion requested additional seats"],
        },
      ],
    });

    const partialData = accountFixture({
      id: "acct-partial",
      name: "Partial Data",
      externalProviders: [],
      contacts: [],
      notes: [],
      outreach: [],
      meetings: [],
      alerts: [],
      plans: [],
      tasks: [],
      primaryDealAmount: null,
      renewalDate: null,
      paymentStatus: null,
      expansionPotential: null,
    });

    const portfolio = buildCustomerSuccessPortfolioFromSnapshots(
      [stalledOnboarding, healthyActive, expansionReady, partialData],
      NOW
    );

    expect(portfolio.summary.totalAccounts).toBe(4);
    expect(portfolio.accounts).toHaveLength(4);
    expect(portfolio.summary.openAlerts).toBeGreaterThan(0);
    expect(portfolio.attentionAccounts.map((account) => account.accountId)).toContain("acct-stalled");
    expect(
      portfolio.accounts.find((account) => account.accountId === "acct-stalled")!.health.score
    ).toBeLessThan(
      portfolio.accounts.find((account) => account.accountId === "acct-healthy")!.health.score
    );
    expect(portfolio.accounts.find((account) => account.accountId === "acct-stalled")?.relationship).toEqual(
      expect.objectContaining({
        connectedSystems: 1,
        missingSources: [],
      })
    );
  });

  it("verifies health score composition and grade output from all five translated components", () => {
    const health = buildCustomerSuccessHealth(
      accountFixture({
        id: "acct-health",
        name: "Health Composition",
      }),
      NOW
    );

    expect(health.score).toBeGreaterThan(0);
    expect(["A", "B", "C", "D", "F"]).toContain(health.grade);
    expect(health.components.adoption.weight).toBeGreaterThan(0);
    expect(health.components.engagement.weight).toBeGreaterThan(0);
    expect(health.components.relationship.weight).toBeGreaterThan(0);
    expect(health.components.support.weight).toBeGreaterThan(0);
    expect(health.components.commercial.weight).toBeGreaterThan(0);
    expect(health.leadingIndicators.recency.value).toContain("since touch");
    expect(health.leadingIndicators.depth.score).toBeGreaterThan(0);
    expect(health.leadingIndicators.breadth.score).toBeGreaterThan(0);
  });

  it("penalizes recency when only internal activity changed recently", () => {
    const staleTouches = accountFixture({
      id: "acct-stale-touch",
      name: "Stale Touches",
      notes: [],
      meetings: [],
      outreach: [],
      updatedAt: new Date("2026-03-07T00:00:00.000Z"),
      tasks: [
        {
          id: "stale-task",
          title: "Internal follow-up",
          status: "ACTIVE",
          priority: "P1",
          dueDate: new Date("2026-03-12T00:00:00.000Z"),
          createdAt: new Date("2026-03-06T00:00:00.000Z"),
          updatedAt: new Date("2026-03-07T00:00:00.000Z"),
          completedOn: null,
        },
      ],
    });

    const activeTouches = accountFixture({
      id: "acct-active-touch",
      name: "Active Touches",
    });

    const staleHealth = buildCustomerSuccessHealth(staleTouches, NOW);
    const activeHealth = buildCustomerSuccessHealth(activeTouches, NOW);

    expect(staleHealth.leadingIndicators.recency.score).toBeLessThan(activeHealth.leadingIndicators.recency.score);
    expect(staleHealth.leadingIndicators.recency.value).toBe("No recent touch");
  });

  it("verifies alert severity and SLA ordering", () => {
    const portfolio = buildCustomerSuccessPortfolioFromSnapshots(
      [
        accountFixture({
          id: "acct-ordering",
          name: "Alert Ordering",
          alerts: [
            {
              id: "alert-low",
              title: "Minor follow-up",
              category: "ACTION_REQUIRED",
              severity: "LOW",
              status: "OPEN",
              slaStatus: "NONE",
              source: "WORKFLOW",
              openedAt: new Date("2026-03-02T00:00:00.000Z"),
              updatedAt: new Date("2026-03-02T00:00:00.000Z"),
              resolvedAt: null,
              suggestedAction: null,
              evidence: [],
            },
            {
              id: "alert-critical",
              title: "Critical escalation",
              category: "RISK",
              severity: "CRITICAL",
              status: "OPEN",
              slaStatus: "BREACHED",
              source: "SUPPORT",
              openedAt: new Date("2026-03-03T00:00:00.000Z"),
              updatedAt: new Date("2026-03-03T00:00:00.000Z"),
              resolvedAt: null,
              suggestedAction: "Escalate immediately",
              evidence: ["SLA breached"],
            },
          ],
        }),
      ],
      NOW
    );

    expect(portfolio.alerts[0]?.title).toBe("Critical escalation");
    expect(portfolio.alerts[0]?.severity).toBe("critical");
    expect(portfolio.alerts[0]?.slaStatus).toBe("breached");
  });

  it("verifies account detail can render with missing provider data", () => {
    const detail = buildCustomerSuccessAccountDetailFromSnapshot(
      accountFixture({
        id: "acct-partial-detail",
        name: "Partial Detail",
        externalProviders: [],
        externalRefs: [],
        contacts: [],
        notes: [],
        outreach: [],
        meetings: [],
        alerts: [],
        plans: [],
        tasks: [],
        primaryDealAmount: null,
        renewalDate: null,
        paymentStatus: null,
        expansionPotential: null,
      }),
      NOW
    );

    expect(detail.accountId).toBe("acct-partial-detail");
    expect(detail.health.score).toBeGreaterThanOrEqual(0);
    expect(detail.stakeholders).toEqual([]);
    expect(detail.tasks).toEqual([]);
    expect(detail.successPlan.milestones).toEqual([]);
    expect(detail.outreach.recentMessages).toEqual([]);
  });

  it("exposes connected provider links on the account detail payload", () => {
    const detail = buildCustomerSuccessAccountDetailFromSnapshot(
      accountFixture({
        id: "acct-links",
        name: "Provider Links",
      }),
      NOW
    );

    expect(detail.relationshipIntelligence?.providers).toEqual([
      expect.objectContaining({
        provider: "CODA",
        externalObjectType: "doc",
        externalId: "VYLC2rzPN_",
        label: "Customer Success and Implementation",
        url: "https://coda.io/d/_dVYLC2rzPN_",
      }),
    ]);
  });
});
