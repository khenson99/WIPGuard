import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CeoMetricSnapshotPayload } from "@/lib/ceo/service";
import type { AutomationOperatorDashboard } from "@/lib/automations/operator-dashboard";
import { MetricsWorkspace } from "./metrics-workspace";
import { PipelineArtifactsWorkspace } from "./pipeline-artifacts-workspace";
import { PipelinesWorkspace } from "./pipelines-workspace";
import { ReportsWorkspace } from "./reports-workspace";
import { SourcesWorkspace } from "./sources-workspace";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/settings/integrations-tab", () => ({
  IntegrationsTab: () => <div>Provider Connections</div>,
}));

const SOURCE_ROWS = [
  {
    key: "hubspot",
    label: "HubSpot",
    status: "connected",
    connected: true,
    lastSyncedAt: "2026-06-04T18:00:00.000Z",
    lastSnapshotAt: "2026-06-04T18:00:00.000Z",
    lastError: null,
    snapshotKeys: ["hubspot"],
    freshness: {
      slaHours: 24,
      lastSyncedAt: "2026-06-04T18:00:00.000Z",
      staleAfter: "2026-06-05T18:00:00.000Z",
      ageHours: 2,
    },
    historicalCoverage: {
      requiredLookbackMonths: 13,
      expectedWindowStart: "2025-05-01T00:00:00.000Z",
      expectedWindowEnd: "2026-06-04T00:00:00.000Z",
      latestWindowStart: "2025-05-01T00:00:00.000Z",
      latestWindowEnd: "2026-06-04T00:00:00.000Z",
      hasRequiredLookback: true,
      hasFreshWindowEnd: true,
    },
    latestSyncRun: {
      status: "SUCCESS",
      startedAt: "2026-06-04T17:55:00.000Z",
      completedAt: "2026-06-04T18:00:00.000Z",
      windowStart: "2025-05-01T00:00:00.000Z",
      windowEnd: "2026-06-04T00:00:00.000Z",
      checkpoint: null,
      recordCount: 120,
      acceptedCount: 118,
      errorCount: 2,
      lastError: "Two malformed CRM rows.",
    },
  },
  {
    key: "stripe",
    label: "Stripe",
    status: "missing",
    connected: false,
    lastSyncedAt: null,
    lastSnapshotAt: null,
    lastError: "No integration credentials found.",
    snapshotKeys: ["stripe"],
    freshness: {
      slaHours: 24,
      lastSyncedAt: null,
      staleAfter: null,
      ageHours: null,
    },
    historicalCoverage: {
      requiredLookbackMonths: 13,
      expectedWindowStart: "2025-05-01T00:00:00.000Z",
      expectedWindowEnd: "2026-06-04T00:00:00.000Z",
      latestWindowStart: null,
      latestWindowEnd: null,
      hasRequiredLookback: false,
      hasFreshWindowEnd: false,
    },
    latestSyncRun: null,
  },
] as const;

const CEO_SNAPSHOT: CeoMetricSnapshotPayload = {
  generatedAt: "2026-06-04T18:30:00.000Z",
  periodStart: "2026-05-05T18:30:00.000Z",
  periodEnd: "2026-06-04T18:30:00.000Z",
  definitions: [],
  metrics: [
    {
      definition: {
        key: "finance.mrr",
        label: "MRR",
        domain: "finance",
        ownerAudience: "BOARD",
        unit: "currency",
        calculationVersion: "v1",
        sourceDependencies: ["stripe", "hubspot"],
        freshnessSlaHours: 24,
        boardEligible: true,
        weeklyEligible: true,
        description: "Monthly recurring revenue.",
      },
      value: 100,
      priorValue: 90,
      delta: 10,
      periodStart: "2026-05-05T18:30:00.000Z",
      periodEnd: "2026-06-04T18:30:00.000Z",
      asOf: "2026-06-04T18:30:00.000Z",
      computedAt: "2026-06-04T18:30:00.000Z",
      trust: { status: "fresh", confidence: 1, warnings: [], sourceStates: [] },
      lineage: [{ sourceKey: "stripe", sourceId: "snap_1", capturedAt: "2026-06-04T18:00:00.000Z" }],
    },
  ],
  reportPacks: [
    {
      slug: "weekly-exec",
      name: "Weekly Exec",
      description: "Recurring weekly operating review.",
      cadence: "weekly",
      audience: "TEAM",
      metricKeys: ["finance.mrr"],
      sections: [{ title: "Revenue", metricKeys: ["finance.mrr"] }],
    },
  ],
  trustSummary: { fresh: 1, stale: 0, partial: 0, missing: 0, error: 0, conflicted: 0 },
  readiness: {
    status: "not_board_final",
    ready: false,
    summary: "Not board-final: 1 readiness gate is failing.",
    failingGates: [{ metricKey: "finance.mrr", label: "MRR", reason: "Metric source trust is stale." }],
  },
};

const CANONICAL_METRICS = [
  {
    key: "finance.mrr",
    label: "MRR",
    department: "finance",
    unit: "currency",
    value: { amount: 100 },
    periodStart: "2026-05-01T00:00:00.000Z",
    periodEnd: "2026-06-01T00:00:00.000Z",
    status: "ready",
    confidence: 0.9,
    calculationVersion: "v1",
    computedAt: "2026-06-04T18:00:00.000Z",
    sourceLineage: [{ sourceKey: "stripe", status: "connected" }],
    warnings: [],
  },
  {
    key: "finance.net_burn",
    label: "Net Burn",
    department: "finance",
    unit: "currency",
    value: null,
    periodStart: null,
    periodEnd: null,
    status: "missing",
    confidence: 0,
    calculationVersion: null,
    computedAt: null,
    sourceLineage: [{ sourceKey: "mercury", status: "missing" }],
    warnings: ["Canonical provider materialization is required before this metric is board-ready."],
  },
] as const;

const AUTOMATION_DATA: AutomationOperatorDashboard = {
  summary: {
    workflowCount: 1,
    activeWorkflowCount: 1,
    failedRunCount: 1,
    pendingApprovalCount: 1,
    pendingRecommendationCount: 1,
    readyArtifactCount: 1,
  },
  workflows: [
    {
      id: "wf_1",
      name: "Deal follow-up",
      description: "Draft follow-up from meeting notes.",
      scope: "SHARED",
      status: "ACTIVE",
      operatorKey: "DEAL_DESK",
      providers: ["HUBSPOT"],
      lastPublishedAt: null,
      lastRunAt: "2026-06-04T18:00:00.000Z",
      lastError: "Latest run failed.",
      updatedAt: "2026-06-04T18:05:00.000Z",
      owner: { name: "Ops", email: "ops@example.com" },
      latestRun: {
        id: "run_1",
        status: "FAILED",
        createdAt: "2026-06-04T18:00:00.000Z",
        finishedAt: "2026-06-04T18:01:00.000Z",
        error: "HubSpot timed out.",
      },
      counts: { nodes: 3, edges: 2, runs: 4 },
    },
  ],
  systemManagedRecipes: [
    {
      id: "rule_1",
      source: "IntegrationRule",
      key: "hubspot_pipeline_sync",
      provider: "HUBSPOT",
      status: "ACTIVE",
      updatedAt: "2026-06-04T18:05:00.000Z",
      lastRunAt: "2026-06-04T18:00:00.000Z",
      lastError: null,
    },
  ],
  approvals: [
    {
      id: "approval_1",
      nodeKey: "approve_send",
      status: "PENDING",
      decisionNote: null,
      timeoutAt: "2026-06-05T18:00:00.000Z",
      createdAt: "2026-06-04T18:00:00.000Z",
      requestedBy: { name: "Ops", email: "ops@example.com" },
      run: {
        id: "run_1",
        status: "WAITING_APPROVAL",
        workflow: { id: "wf_1", name: "Deal follow-up", scope: "SHARED", ownerId: "user_1" },
      },
    },
  ],
  recommendations: [
    {
      id: "rec_1",
      recommendationType: "crm_update",
      title: "Update close date",
      summary: "Move the deal close date to Friday.",
      detail: "The customer asked to reconvene Friday.",
      actionType: "hubspot.deal.update",
      requiresApproval: true,
      status: "PENDING_APPROVAL",
      priority: "P1",
      dueAt: "2026-06-05T18:00:00.000Z",
      createdAt: "2026-06-04T18:00:00.000Z",
      executionError: null,
      workflow: { id: "wf_1", name: "Deal follow-up", operatorKey: "DEAL_DESK" },
      run: { id: "run_1", status: "WAITING_APPROVAL", createdAt: "2026-06-04T18:00:00.000Z" },
      artifact: { id: "artifact_1", artifactType: "summary", title: "Meeting summary" },
    },
  ],
  playbooks: [
    {
      id: "pipeline-risk",
      title: "Pipeline risk review",
      summary: "1 pipeline recommendation needs operator review.",
      trigger: "1 pipeline signal",
      priority: "P1",
      status: "Needs approval",
      requiresApproval: true,
      nextAction: "Approve, reject, or revise CRM and pipeline actions from the recommendation queue.",
    },
  ],
  artifacts: [
    {
      id: "artifact_1",
      artifactType: "summary",
      status: "READY",
      title: "Meeting summary",
      summary: "Customer wants pricing follow-up.",
      content: "Full summary.",
      createdAt: "2026-06-04T18:00:00.000Z",
      workflow: { id: "wf_1", name: "Deal follow-up", operatorKey: "DEAL_DESK" },
      run: { id: "run_1", status: "SUCCEEDED", createdAt: "2026-06-04T18:00:00.000Z" },
      sourceDocument: { id: "doc_1", documentType: "meeting", title: "Customer call" },
    },
  ],
};

describe("operator workspaces", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders source health and keeps raw source endpoints in Advanced", () => {
    render(<SourcesWorkspace sources={SOURCE_ROWS} />);

    expect(screen.getByRole("heading", { name: "Source Control Room" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Manage connections" }).getAttribute("href")).toBe("#connections");
    expect(screen.getByText("Provider Connections")).toBeTruthy();
    expect(screen.getByText("HubSpot")).toBeTruthy();
    expect(screen.getByText("120 records")).toBeTruthy();
    expect(screen.getByText("118 accepted")).toBeTruthy();
    expect(screen.getByText("2 errors")).toBeTruthy();
    expect(screen.getByText("No integration credentials found.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /open endpoint/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /imladris sources api/i })).toBeNull();
  });

  it("routes metrics users toward real dashboards with trust summaries", () => {
    render(<MetricsWorkspace metrics={CANONICAL_METRICS} ceoSnapshot={CEO_SNAPSHOT} />);

    expect(screen.getByRole("heading", { name: "Metrics Command Center" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /company tracker/i }).getAttribute("href")).toBe("/operating/company");
    expect(screen.getByRole("link", { name: /customer health/i }).getAttribute("href")).toBe("/metrics/customer-health");
    expect(screen.getByRole("link", { name: /expenses/i }).getAttribute("href")).toBe("/metrics/expenses");
    expect(screen.getByRole("link", { name: /goals/i }).getAttribute("href")).toBe("/goals");
    expect(screen.getByText("1 ready")).toBeTruthy();
    expect(screen.getByText("1 missing")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /canonical metric api/i })).toBeNull();
  });

  it("generates report packs from the operator surface", async () => {
    const generatedRun = {
      id: "run_1",
      packSlug: "weekly-exec",
      packName: "Weekly Exec",
      generatedAt: "2026-06-04T18:40:00.000Z",
      markdown: "# Weekly Exec",
      csv: "Metric,Value",
      deterministicNotes: ["No material metric variances were detected."],
      slideJson: { title: "Weekly Exec", generatedAt: "2026-06-04T18:40:00.000Z", readiness: CEO_SNAPSHOT.readiness, sections: [], notes: [] },
      metrics: [],
      boardFinal: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/ceo/reports/run_1/approve") {
          return {
            ok: true,
            json: async () => ({
              ...generatedRun,
              boardFinal: {
                approvedAt: "2026-06-04T18:45:00.000Z",
                approvedById: "admin_1",
                overrideReason: "Finance reviewed stale source manually.",
              },
            }),
          };
        }
        return {
          ok: true,
          json: async () => generatedRun,
        };
      }),
    );

    render(<ReportsWorkspace snapshot={CEO_SNAPSHOT} />);

    expect(screen.getByRole("heading", { name: "Executive Report Packs" })).toBeTruthy();
    expect(screen.getByText("Weekly Exec")).toBeTruthy();
    expect(screen.getByText("Metric source trust is stale.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /generate weekly exec/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/ceo/reports",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ packSlug: "weekly-exec" }),
        }),
      );
    });
    expect(await screen.findByText("Generated run run_1")).toBeTruthy();
    expect(screen.getByText("Override reason required")).toBeTruthy();
    expect(screen.getByRole("button", { name: /approve board-final/i })).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByPlaceholderText("Record why this non-board-ready pack can be board-final."), {
      target: { value: "Finance reviewed stale source manually." },
    });
    fireEvent.click(screen.getByRole("button", { name: /approve board-final/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/ceo/reports/run_1/approve",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ overrideReason: "Finance reviewed stale source manually." }),
        }),
      );
    });
    expect(await screen.findByText("Board-final")).toBeTruthy();
    expect(screen.getByText("Override: Finance reviewed stale source manually.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /report api/i })).toBeNull();
  });

  it("shows pipeline queues and posts approval actions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true }),
      })),
    );

    render(<PipelinesWorkspace data={AUTOMATION_DATA} />);

    expect(screen.getByRole("heading", { name: "Pipeline Operations" })).toBeTruthy();
    expect(screen.getByText("Deal follow-up")).toBeTruthy();
    expect(screen.getByText("HubSpot timed out.")).toBeTruthy();
    expect(screen.getByText("Update close date")).toBeTruthy();
    expect(screen.getByText("Pipeline risk review")).toBeTruthy();
    expect(screen.getByText("Approval gated")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /approve approve_send/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/automations/approvals/approval_1/approve",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(screen.queryByRole("link", { name: /automation api/i })).toBeNull();
  });

  it("shows artifact inbox and posts recommendation actions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true }),
      })),
    );

    render(<PipelineArtifactsWorkspace data={AUTOMATION_DATA} />);

    expect(screen.getByRole("heading", { name: "Artifact Inbox" })).toBeTruthy();
    expect(screen.getByText("Meeting summary")).toBeTruthy();
    expect(screen.getByText("Customer wants pricing follow-up.")).toBeTruthy();
    expect(screen.getByText("Update close date")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /approve update close date/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/automations/recommendations/rec_1/approve",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(screen.queryByRole("link", { name: /artifacts api/i })).toBeNull();
  });
});
