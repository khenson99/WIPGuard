import { beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationAiJobStatus } from "@/lib/automations/prisma-enums";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    automationAiJob: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    workflowApproval: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    workflowTriggerEvent: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    workflowRunStep: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    workflowRun: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    workflowDefinition: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    dealMeeting: {
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/automations/openai", () => ({
  buildAutomationAiResponseRequest: vi.fn(),
  createAutomationOpenAiResponse: vi.fn(),
  extractAutomationAiOutputText: vi.fn(),
  isTerminalAutomationAiStatus: vi.fn(),
  parseAutomationAiResponseEnvelope: vi.fn(),
  retrieveAutomationOpenAiResponse: vi.fn(),
  unwrapAutomationOpenAiWebhookEvent: vi.fn(),
}));

vi.mock("@/lib/automations/store", () => ({
  buildRunExecutionContext: vi.fn(),
  materializeSourceDocumentsFromTrigger: vi.fn(),
  persistAutomationEnvelope: vi.fn(),
}));

vi.mock("@/lib/automations/actions", () => ({
  executeAutomationAction: vi.fn(),
}));

vi.mock("@/lib/automations/recommendations", () => ({
  executeApprovedRecommendationsForRun: vi.fn(),
}));

vi.mock("@/lib/automations/service", () => ({
  integrationProviderFromString: vi.fn((value: string | null | undefined) => {
    const normalized = value?.trim().toUpperCase();
    if (normalized === "WIPGUARD" || normalized === "AIRTABLE") {
      return "AIRTABLE";
    }
    return normalized ?? null;
  }),
  normalizeWorkflowRolePolicy: vi.fn(() => ({
    approveRoles: ["admin", "member"],
  })),
}));

vi.mock("@/lib/permissions", () => ({
  getAppRole: vi.fn(),
}));

describe("automation runtime AI lifecycle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it("dispatches queued AI jobs and keeps non-terminal responses running", async () => {
    const { prisma } = await import("@/lib/prisma");
    const {
      createAutomationOpenAiResponse,
      extractAutomationAiOutputText,
      isTerminalAutomationAiStatus,
    } = await import("@/lib/automations/openai");

    vi.mocked(prisma.automationAiJob.findMany).mockResolvedValue([
      {
        id: "job_queue_1",
        requestPayload: {
          model: "gpt-4.1-mini",
          input: [{ role: "user", content: "hello" }],
        },
        attemptCount: 0,
      },
    ] as never);
    vi.mocked(prisma.automationAiJob.findUnique).mockResolvedValue({
      id: "job_queue_1",
      run: { requestedById: "user_1" },
    } as never);
    vi.mocked(createAutomationOpenAiResponse).mockResolvedValue({
      id: "resp_queue_1",
      status: "in_progress",
    } as never);
    vi.mocked(extractAutomationAiOutputText).mockReturnValue("still running");
    vi.mocked(isTerminalAutomationAiStatus).mockReturnValue(false);

    const { dispatchAutomationAiJobs } = await import("@/lib/automations/runtime");
    const processed = await dispatchAutomationAiJobs(1);

    expect(processed).toBe(1);
    expect(createAutomationOpenAiResponse).toHaveBeenCalledWith({
      model: "gpt-4.1-mini",
      input: [{ role: "user", content: "hello" }],
    });
    expect(prisma.automationAiJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job_queue_1" },
        data: expect.objectContaining({
          status: AutomationAiJobStatus.REQUESTED,
          lastError: null,
        }),
      })
    );
    expect(prisma.automationAiJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job_queue_1" },
        data: expect.objectContaining({
          status: AutomationAiJobStatus.RUNNING,
          responseId: "resp_queue_1",
          outputText: "still running",
        }),
      })
    );
  });

  it("marks queued AI jobs failed when dispatch to OpenAI errors", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { createAutomationOpenAiResponse } = await import("@/lib/automations/openai");

    vi.mocked(prisma.automationAiJob.findMany).mockResolvedValue([
      {
        id: "job_dispatch_fail_1",
        requestPayload: {
          model: "gpt-4.1-mini",
          input: [{ role: "user", content: "hello" }],
        },
        attemptCount: 2,
      },
    ] as never);
    vi.mocked(createAutomationOpenAiResponse).mockRejectedValue(
      new Error("OpenAI request failed")
    );

    const { dispatchAutomationAiJobs } = await import("@/lib/automations/runtime");
    const processed = await dispatchAutomationAiJobs(1);

    expect(processed).toBe(1);
    expect(createAutomationOpenAiResponse).toHaveBeenCalledWith({
      model: "gpt-4.1-mini",
      input: [{ role: "user", content: "hello" }],
    });
    expect(prisma.automationAiJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job_dispatch_fail_1" },
        data: expect.objectContaining({
          status: AutomationAiJobStatus.REQUESTED,
          attemptCount: { increment: 1 },
          lastError: null,
        }),
      })
    );
    expect(prisma.automationAiJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job_dispatch_fail_1" },
        data: expect.objectContaining({
          status: AutomationAiJobStatus.FAILED,
          attemptCount: { increment: 1 },
          lastError: "OpenAI request failed",
          nextAttemptAt: expect.any(Date),
        }),
      })
    );
  });

  it("polls in-flight AI jobs and settles completed responses", async () => {
    const { prisma } = await import("@/lib/prisma");
    const {
      extractAutomationAiOutputText,
      isTerminalAutomationAiStatus,
      parseAutomationAiResponseEnvelope,
      retrieveAutomationOpenAiResponse,
    } = await import("@/lib/automations/openai");
    const { buildRunExecutionContext, persistAutomationEnvelope } = await import(
      "@/lib/automations/store"
    );

    vi.mocked(prisma.automationAiJob.findMany).mockResolvedValue([
      {
        id: "job_poll_1",
        responseId: "resp_poll_1",
        attemptCount: 1,
      },
    ] as never);
    vi.mocked(prisma.automationAiJob.findUnique).mockResolvedValue({
      id: "job_poll_1",
      workflowId: "wf_poll_1",
      runId: "run_poll_1",
      stepId: "step_poll_1",
      operatorKey: "ADS_OPTIMIZER",
      nodeKey: "triage_dropoff",
      jobType: "ai_analyze",
      metadata: { parsedToolDefinitions: [] },
      run: {
        requestedById: "user_1",
        triggerType: "analytics.funnel.dropoff_detected",
        triggerPayload: { alertId: "alert_poll_1" },
      },
    } as never);
    vi.mocked(retrieveAutomationOpenAiResponse).mockResolvedValue({
      id: "resp_poll_1",
      status: "completed",
    } as never);
    vi.mocked(extractAutomationAiOutputText).mockReturnValue("poll result");
    vi.mocked(isTerminalAutomationAiStatus).mockReturnValue(true);
    vi.mocked(parseAutomationAiResponseEnvelope).mockReturnValue({
      summary: "Polled funnel diagnosis",
      raw: { summary: "Polled funnel diagnosis" },
    } as never);
    vi.mocked(persistAutomationEnvelope).mockResolvedValue({
      artifactIds: ["artifact_poll_1"],
      recommendationIds: ["recommendation_poll_1"],
    } as never);
    vi.mocked(prisma.workflowDefinition.findUnique).mockResolvedValue({
      graph: {
        nodes: [
          {
            key: "triage_dropoff",
            type: "ACTION",
            label: "Triage Funnel Dropoff",
            config: {
              actionType: "ai_analyze",
            },
          },
        ],
        edges: [],
      },
    } as never);
    vi.mocked(prisma.workflowRunStep.findFirst).mockResolvedValue({
      output: {
        artifactIds: ["artifact_poll_1"],
        recommendationIds: ["recommendation_poll_1"],
      },
    } as never);
    vi.mocked(buildRunExecutionContext).mockResolvedValue({
      trigger: {
        provider: "WIPGUARD",
        eventType: "analytics.funnel.dropoff_detected",
        externalId: "alert_poll_1",
      },
      state: {},
    } as never);

    const { pollAutomationAiJobs } = await import("@/lib/automations/runtime");
    const processed = await pollAutomationAiJobs(10);

    expect(processed).toBe(1);
    expect(retrieveAutomationOpenAiResponse).toHaveBeenCalledWith("resp_poll_1");
    expect(persistAutomationEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "wf_poll_1",
        runId: "run_poll_1",
        aiJobId: "job_poll_1",
      })
    );
    expect(prisma.automationAiJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job_poll_1" },
        data: expect.objectContaining({
          status: AutomationAiJobStatus.SUCCEEDED,
          responseStatus: "completed",
          outputText: "poll result",
        }),
      })
    );
    expect(prisma.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run_poll_1" },
        data: expect.objectContaining({
          status: "SUCCEEDED",
          error: null,
        }),
      })
    );
    expect(prisma.dealMeeting.update).not.toHaveBeenCalled();
  });

  it("denormalizes demo scorecards onto meetings for transcript-ready runs", async () => {
    const { prisma } = await import("@/lib/prisma");
    const {
      extractAutomationAiOutputText,
      isTerminalAutomationAiStatus,
      parseAutomationAiResponseEnvelope,
      retrieveAutomationOpenAiResponse,
    } = await import("@/lib/automations/openai");
    const { persistAutomationEnvelope } = await import("@/lib/automations/store");

    vi.mocked(prisma.automationAiJob.findMany).mockResolvedValue([
      {
        id: "job_demo_1",
        responseId: "resp_demo_1",
        attemptCount: 1,
      },
    ] as never);
    vi.mocked(prisma.automationAiJob.findUnique).mockResolvedValue({
      id: "job_demo_1",
      workflowId: "wf_demo_1",
      runId: "run_demo_1",
      stepId: "step_demo_1",
      operatorKey: "SALES_FOLLOWUP",
      nodeKey: "analyze_followup",
      jobType: "ai_analyze",
      metadata: { parsedToolDefinitions: [] },
      run: {
        requestedById: "user_1",
        triggerType: "google-workspace.meet.transcript_ready",
        triggerPayload: { meetingId: "meeting_demo_1" },
      },
    } as never);
    vi.mocked(retrieveAutomationOpenAiResponse).mockResolvedValue({
      id: "resp_demo_1",
      status: "completed",
    } as never);
    vi.mocked(extractAutomationAiOutputText).mockReturnValue("demo result");
    vi.mocked(isTerminalAutomationAiStatus).mockReturnValue(true);
    vi.mocked(parseAutomationAiResponseEnvelope).mockReturnValue({
      summary: "Demo analyzed",
      raw: { summary: "Demo analyzed" },
      artifacts: [
        {
          artifactType: "demo_quality_scorecard",
          title: "Scorecard",
          summary: "Strong discovery, unclear next step owner.",
          contentJson: {
            overallScore: 84,
            strengths: ["Strong discovery"],
            gaps: ["Next-step ownership"],
            customerSignals: ["Budget confirmed"],
            nextSteps: ["Send recap"],
            outcomeConfidence: "high",
          },
        },
        {
          artifactType: "demo_coaching_memo",
          title: "Coaching Memo",
          content: "Coaching content",
        },
      ],
      recommendations: [],
    } as never);
    vi.mocked(persistAutomationEnvelope).mockResolvedValue({
      artifactIds: ["artifact_score_1", "artifact_memo_1"],
      recommendationIds: [],
    } as never);
    vi.mocked(prisma.workflowDefinition.findUnique).mockResolvedValue({
      graph: {
        nodes: [
          {
            key: "analyze_followup",
            type: "ACTION",
            label: "Analyze Follow-up",
            config: {
              actionType: "ai_analyze",
            },
          },
        ],
        edges: [],
      },
    } as never);
    vi.mocked(prisma.workflowRunStep.findFirst).mockResolvedValue({
      output: {
        artifactIds: ["artifact_score_1"],
        recommendationIds: [],
      },
    } as never);
    vi.mocked(prisma.dealMeeting.update).mockResolvedValue({ id: "meeting_demo_1" } as never);

    const { pollAutomationAiJobs } = await import("@/lib/automations/runtime");
    const processed = await pollAutomationAiJobs(10);

    expect(processed).toBe(1);
    expect(persistAutomationEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        envelope: expect.objectContaining({
          artifacts: expect.arrayContaining([
            expect.objectContaining({
              artifactType: "demo_quality_scorecard",
              sourceDocumentId: null,
            }),
            expect.objectContaining({
              artifactType: "demo_coaching_memo",
              sourceDocumentId: null,
            }),
            expect.objectContaining({
              artifactType: "deal_next_step_memo",
              sourceDocumentId: null,
            }),
          ]),
        }),
      })
    );
    expect(prisma.dealMeeting.update).toHaveBeenCalledWith({
      where: { id: "meeting_demo_1" },
      data: expect.objectContaining({
        analysisArtifactId: "artifact_score_1",
        demoQualityScore: 84,
        demoQualitySummary: "Strong discovery, unclear next step owner.",
        demoStrengthsJson: ["Strong discovery"],
        demoGapsJson: ["Next-step ownership"],
        analyzedAt: expect.any(Date),
      }),
    });
  });

  it("normalizes transcript-ready artifact envelopes and anchors them to the archived transcript", async () => {
    const { prisma } = await import("@/lib/prisma");
    const {
      extractAutomationAiOutputText,
      isTerminalAutomationAiStatus,
      parseAutomationAiResponseEnvelope,
      retrieveAutomationOpenAiResponse,
    } = await import("@/lib/automations/openai");
    const { persistAutomationEnvelope } = await import("@/lib/automations/store");

    vi.mocked(prisma.automationAiJob.findMany).mockResolvedValue([
      {
        id: "job_demo_2",
        responseId: "resp_demo_2",
        attemptCount: 1,
      },
    ] as never);
    vi.mocked(prisma.automationAiJob.findUnique).mockResolvedValue({
      id: "job_demo_2",
      workflowId: "wf_demo_2",
      runId: "run_demo_2",
      stepId: "step_demo_2",
      operatorKey: "SALES_FOLLOWUP",
      nodeKey: "analyze_followup",
      jobType: "ai_analyze",
      metadata: { parsedToolDefinitions: [] },
      run: {
        requestedById: "user_1",
        triggerType: "google-workspace.meet.transcript_ready",
        triggerPayload: {
          meetingId: "meeting_demo_2",
          sourceDocumentId: "doc_transcript_1",
        },
      },
    } as never);
    vi.mocked(retrieveAutomationOpenAiResponse).mockResolvedValue({
      id: "resp_demo_2",
      status: "completed",
    } as never);
    vi.mocked(extractAutomationAiOutputText).mockReturnValue("demo result");
    vi.mocked(isTerminalAutomationAiStatus).mockReturnValue(true);
    vi.mocked(parseAutomationAiResponseEnvelope).mockReturnValue({
      summary: "Strong discovery call",
      raw: { summary: "Strong discovery call" },
      artifacts: [
        {
          artifactType: "demo_quality_scorecard",
          title: "Scorecard",
          contentJson: {
            overallScore: 91,
            strengths: ["Strong discovery"],
            nextSteps: ["Send pricing recap", "Book technical validation"],
            outcomeConfidence: "high",
          },
        },
      ],
      recommendations: [],
    } as never);
    vi.mocked(persistAutomationEnvelope).mockResolvedValue({
      artifactIds: ["artifact_score_2", "artifact_memo_2", "artifact_next_2"],
      recommendationIds: [],
    } as never);
    vi.mocked(prisma.workflowDefinition.findUnique).mockResolvedValue({
      graph: {
        nodes: [
          {
            key: "analyze_followup",
            type: "ACTION",
            label: "Analyze Follow-up",
            config: {
              actionType: "ai_analyze",
            },
          },
        ],
        edges: [],
      },
    } as never);
    vi.mocked(prisma.workflowRunStep.findFirst).mockResolvedValue({
      output: {
        artifactIds: ["artifact_score_2"],
        recommendationIds: [],
      },
    } as never);
    vi.mocked(prisma.dealMeeting.update).mockResolvedValue({ id: "meeting_demo_2" } as never);

    const { pollAutomationAiJobs } = await import("@/lib/automations/runtime");
    const processed = await pollAutomationAiJobs(10);

    expect(processed).toBe(1);
    expect(persistAutomationEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        envelope: expect.objectContaining({
          artifacts: [
            expect.objectContaining({
              artifactType: "demo_quality_scorecard",
              sourceDocumentId: "doc_transcript_1",
              contentJson: {
                overallScore: 91,
                strengths: ["Strong discovery"],
                gaps: [],
                customerSignals: [],
                nextSteps: ["Send pricing recap", "Book technical validation"],
                outcomeConfidence: "high",
              },
            }),
            expect.objectContaining({
              artifactType: "demo_coaching_memo",
              sourceDocumentId: "doc_transcript_1",
              content: "Strong discovery call",
            }),
            expect.objectContaining({
              artifactType: "deal_next_step_memo",
              sourceDocumentId: "doc_transcript_1",
              content: "Send pricing recap\nBook technical validation",
            }),
          ],
        }),
      })
    );
  });

  it("marks polled AI jobs failed when response retrieval errors", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { retrieveAutomationOpenAiResponse } = await import("@/lib/automations/openai");

    vi.mocked(prisma.automationAiJob.findMany).mockResolvedValue([
      {
        id: "job_poll_fail_1",
        responseId: "resp_poll_fail_1",
        attemptCount: 2,
      },
    ] as never);
    vi.mocked(retrieveAutomationOpenAiResponse).mockRejectedValue(
      new Error("OpenAI poll timeout")
    );

    const { pollAutomationAiJobs } = await import("@/lib/automations/runtime");
    const processed = await pollAutomationAiJobs(10);

    expect(processed).toBe(1);
    expect(retrieveAutomationOpenAiResponse).toHaveBeenCalledWith("resp_poll_fail_1");
    expect(prisma.automationAiJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job_poll_fail_1" },
        data: expect.objectContaining({
          status: AutomationAiJobStatus.FAILED,
          lastError: "OpenAI poll timeout",
          nextAttemptAt: expect.any(Date),
        }),
      })
    );
  });

  it("skips creating duplicate workflow runs when a trigger event replays", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { materializeSourceDocumentsFromTrigger } = await import(
      "@/lib/automations/store"
    );

    vi.mocked(prisma.workflowApproval.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.workflowTriggerEvent.findMany).mockResolvedValue([
      {
        id: "event_dup_1",
        provider: "WIPGUARD",
        eventType: "analytics.funnel.dropoff_detected",
        externalId: "alert_1",
        payload: { stage: "landing_page" },
        idempotencyKey: "dropoff:alert_1",
        attemptCount: 0,
      },
    ] as never);
    vi.mocked(prisma.workflowDefinition.findMany).mockResolvedValue([
      {
        id: "wf_dropoff_1",
        operatorKey: "ADS_OPTIMIZER",
        graph: {
          nodes: [
            {
              key: "trigger_funnel_dropoff",
              type: "TRIGGER",
              label: "Funnel Dropoff Detected",
              config: {
                provider: "wipguard",
                eventType: "analytics.funnel.dropoff_detected",
              },
            },
          ],
          edges: [],
        },
      },
    ] as never);
    vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue({
      id: "run_existing_1",
    } as never);

    const { dispatchWorkflowTriggerEvents } = await import("@/lib/automations/runtime");
    const result = await dispatchWorkflowTriggerEvents(10);

    expect(result).toEqual({
      processed: 1,
      startedRuns: 0,
      timedOutApprovals: 0,
    });
    expect(prisma.workflowRun.create).not.toHaveBeenCalled();
    expect(materializeSourceDocumentsFromTrigger).not.toHaveBeenCalled();
    expect(prisma.workflowTriggerEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "event_dup_1" },
        data: expect.objectContaining({
          status: "DISPATCHED",
          lastError: null,
        }),
      })
    );
  });

  it("dead-letters trigger events after repeated dispatch failures", async () => {
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(prisma.workflowApproval.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.workflowTriggerEvent.findMany).mockResolvedValue([
      {
        id: "event_dead_1",
        provider: "WIPGUARD",
        eventType: "analytics.funnel.dropoff_detected",
        externalId: "alert_2",
        payload: {},
        idempotencyKey: "dropoff:alert_2",
        attemptCount: 5,
      },
    ] as never);
    vi.mocked(prisma.workflowDefinition.findMany).mockRejectedValue(
      new Error("workflow registry unavailable")
    );

    const { dispatchWorkflowTriggerEvents } = await import("@/lib/automations/runtime");
    const result = await dispatchWorkflowTriggerEvents(10);

    expect(result).toEqual({
      processed: 1,
      startedRuns: 0,
      timedOutApprovals: 0,
    });
    expect(prisma.workflowTriggerEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "event_dead_1" },
        data: expect.objectContaining({
          status: "DEAD_LETTER",
          attemptCount: 6,
          lastError: "workflow registry unavailable",
        }),
      })
    );
  });

  it("routes timed out approvals into their timeout edge", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { executeApprovedRecommendationsForRun } = await import(
      "@/lib/automations/recommendations"
    );
    const { buildRunExecutionContext } = await import("@/lib/automations/store");

    vi.mocked(prisma.workflowApproval.findMany).mockResolvedValue([
      {
        id: "approval_timeout_1",
        runId: "run_timeout_1",
        workflowId: "wf_timeout_1",
        nodeKey: "approval_review",
        run: {
          workflow: {
            graph: {
              nodes: [
                {
                  key: "approval_review",
                  type: "APPROVAL",
                  label: "Review Recommendations",
                  config: {},
                },
                {
                  key: "execute_recommendations",
                  type: "ACTION",
                  label: "Execute Recommendations",
                  config: {
                    actionType: "execute_recommendation",
                    recommendationIds: ["recommendation_timeout_1"],
                    actionTypes: ["create_task"],
                    limit: 3,
                  },
                },
              ],
              edges: [
                {
                  source: "approval_review",
                  target: "execute_recommendations",
                  conditionLabel: "timeout",
                  priority: 0,
                },
              ],
            },
          },
        },
      },
    ] as never);
    vi.mocked(buildRunExecutionContext).mockResolvedValue({
      trigger: {
        provider: "WIPGUARD",
        eventType: "analytics.funnel.dropoff_detected",
        externalId: "alert_timeout_1",
      },
      state: {},
    } as never);
    vi.mocked(prisma.workflowRunStep.create).mockResolvedValueOnce({
      id: "step_timeout_1",
    } as never);
    vi.mocked(executeApprovedRecommendationsForRun).mockResolvedValue({
      attempted: 1,
      executed: 1,
      failed: 0,
      recommendationIds: ["recommendation_timeout_1"],
    } as never);

    const { processTimedOutApprovals } = await import("@/lib/automations/runtime");
    const processed = await processTimedOutApprovals(20);

    expect(processed).toBe(1);
    expect(prisma.workflowApproval.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "approval_timeout_1" },
        data: expect.objectContaining({
          status: "TIMED_OUT",
        }),
      })
    );
    expect(executeApprovedRecommendationsForRun).toHaveBeenCalledWith({
      runId: "run_timeout_1",
      recommendationIds: ["recommendation_timeout_1"],
      actionTypes: ["create_task"],
      limit: 3,
    });
    expect(prisma.workflowRunStep.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runId: "run_timeout_1",
          nodeKey: "execute_recommendations",
          nodeType: "ACTION",
        }),
      })
    );
    expect(prisma.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run_timeout_1" },
        data: expect.objectContaining({
          status: "SUCCEEDED",
          error: null,
        }),
      })
    );
  });

  it("pauses workflow runs when they reach an approval node", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { buildRunExecutionContext } = await import("@/lib/automations/store");

    vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue({
      id: "run_approval_1",
      workflowId: "wf_approval_1",
      startedAt: null,
      workflow: {
        graph: {
          nodes: [
            {
              key: "trigger_review",
              type: "TRIGGER",
              label: "Review Trigger",
              config: {
                provider: "wipguard",
                eventType: "review.requested",
              },
            },
            {
              key: "approval_review",
              type: "APPROVAL",
              label: "Review Recommendations",
              config: {
                approverId: "user_admin_1",
                timeoutMinutes: 30,
              },
            },
          ],
          edges: [
            {
              source: "trigger_review",
              target: "approval_review",
              priority: 0,
            },
          ],
        },
      },
    } as never);
    vi.mocked(buildRunExecutionContext).mockResolvedValue({
      trigger: {
        provider: "WIPGUARD",
        eventType: "review.requested",
        externalId: "review_1",
      },
      state: {},
    } as never);
    vi.mocked(prisma.workflowRunStep.create)
      .mockResolvedValueOnce({ id: "step_trigger_approval_1" } as never)
      .mockResolvedValueOnce({ id: "step_approval_1" } as never);

    const { executeWorkflowRun } = await import("@/lib/automations/runtime");
    await executeWorkflowRun("run_approval_1");

    expect(prisma.workflowApproval.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runId: "run_approval_1",
          stepId: "step_approval_1",
          nodeKey: "approval_review",
          approverId: "user_admin_1",
          status: "PENDING",
          timeoutAt: expect.any(Date),
        }),
      })
    );
    expect(prisma.workflowRunStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "step_approval_1" },
        data: expect.objectContaining({
          status: "WAITING_APPROVAL",
          output: { waitingApproval: true },
          finishedAt: expect.any(Date),
        }),
      })
    );
    expect(prisma.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run_approval_1" },
        data: expect.objectContaining({
          status: "WAITING_APPROVAL",
        }),
      })
    );
    expect(prisma.workflowDefinition.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wf_approval_1" },
        data: expect.objectContaining({
          lastError: null,
        }),
      })
    );
  });

  it("resumes approved workflow approvals into downstream recommendation execution", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { executeApprovedRecommendationsForRun } = await import(
      "@/lib/automations/recommendations"
    );
    const { buildRunExecutionContext } = await import("@/lib/automations/store");
    const { getAppRole } = await import("@/lib/permissions");

    vi.mocked(prisma.workflowApproval.findUnique).mockResolvedValue({
      id: "approval_resume_1",
      runId: "run_approval_resume_1",
      nodeKey: "approval_review",
      stepId: "step_approval_resume_1",
      status: "PENDING",
      approverId: null,
      run: {
        workflowId: "wf_approval_resume_1",
        workflow: {
          rolePolicy: null,
        },
      },
    } as never);
    vi.mocked(getAppRole).mockResolvedValue("admin" as never);
    vi.mocked(prisma.workflowDefinition.findUnique).mockResolvedValue({
      graph: {
        nodes: [
          {
            key: "approval_review",
            type: "APPROVAL",
            label: "Review Recommendations",
            config: {},
          },
          {
            key: "execute_recommendations",
            type: "ACTION",
            label: "Execute Recommendations",
            config: {
              actionType: "execute_recommendation",
              recommendationIds: ["recommendation_approval_1"],
              actionTypes: ["create_task"],
              limit: 2,
            },
          },
        ],
        edges: [
          {
            source: "approval_review",
            target: "execute_recommendations",
            conditionLabel: "approved",
            priority: 0,
          },
        ],
      },
    } as never);
    vi.mocked(buildRunExecutionContext).mockResolvedValue({
      trigger: {
        provider: "WIPGUARD",
        eventType: "review.requested",
        externalId: "review_resume_1",
      },
      state: {},
    } as never);
    vi.mocked(executeApprovedRecommendationsForRun).mockResolvedValue({
      attempted: 1,
      executed: 1,
      failed: 0,
      recommendationIds: ["recommendation_approval_1"],
    } as never);
    vi.mocked(prisma.workflowRunStep.create).mockResolvedValueOnce({
      id: "step_exec_approval_1",
    } as never);

    const { resolveWorkflowApproval } = await import("@/lib/automations/runtime");
    await resolveWorkflowApproval({
      approvalId: "approval_resume_1",
      actorUserId: "user_admin_1",
      decision: "approve",
      note: "Ship it",
    });

    expect(getAppRole).toHaveBeenCalledWith("user_admin_1");
    expect(prisma.workflowApproval.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "approval_resume_1" },
        data: expect.objectContaining({
          status: "APPROVED",
          decisionNote: "Ship it",
          approverId: "user_admin_1",
          resolvedAt: expect.any(Date),
        }),
      })
    );
    expect(prisma.workflowRunStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "step_approval_resume_1" },
        data: expect.objectContaining({
          status: "SUCCEEDED",
          output: {
            decision: "approve",
            note: "Ship it",
          },
          finishedAt: expect.any(Date),
        }),
      })
    );
    expect(executeApprovedRecommendationsForRun).toHaveBeenCalledWith({
      runId: "run_approval_resume_1",
      recommendationIds: ["recommendation_approval_1"],
      actionTypes: ["create_task"],
      limit: 2,
    });
    expect(prisma.workflowRunStep.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runId: "run_approval_resume_1",
          nodeKey: "execute_recommendations",
          nodeType: "ACTION",
        }),
      })
    );
    expect(prisma.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run_approval_resume_1" },
        data: expect.objectContaining({
          status: "SUCCEEDED",
          error: null,
        }),
      })
    );
    expect(prisma.workflowDefinition.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wf_approval_resume_1" },
        data: expect.objectContaining({
          lastError: null,
        }),
      })
    );
  });

  it("dispatches trigger events into a workflow run that waits on AI output", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { buildAutomationAiResponseRequest } = await import("@/lib/automations/openai");
    const { buildRunExecutionContext, materializeSourceDocumentsFromTrigger } =
      await import("@/lib/automations/store");

    vi.mocked(prisma.workflowApproval.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.workflowTriggerEvent.findMany).mockResolvedValue([
      {
        id: "event_wait_1",
        provider: "WIPGUARD",
        eventType: "analytics.funnel.dropoff_detected",
        externalId: "alert_wait_1",
        payload: { stage: "pricing_page", dropoffPct: 37 },
        idempotencyKey: "dropoff:alert_wait_1",
        attemptCount: 0,
      },
    ] as never);
    vi.mocked(prisma.workflowDefinition.findMany).mockResolvedValue([
      {
        id: "wf_wait_1",
        operatorKey: "ADS_OPTIMIZER",
        graph: {
          nodes: [
            {
              key: "trigger_funnel_dropoff",
              type: "TRIGGER",
              label: "Funnel Dropoff Detected",
              config: {
                provider: "wipguard",
                eventType: "analytics.funnel.dropoff_detected",
              },
            },
            {
              key: "triage_dropoff",
              type: "ACTION",
              label: "Triage Funnel Dropoff",
              config: {
                actionType: "ai_analyze",
                promptVersion: "2026-03-08",
              },
            },
          ],
          edges: [
            {
              source: "trigger_funnel_dropoff",
              target: "triage_dropoff",
              priority: 0,
            },
          ],
        },
      },
    ] as never);
    vi.mocked(prisma.workflowRun.findUnique)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValue({
        id: "run_wait_1",
        workflowId: "wf_wait_1",
        startedAt: null,
        workflow: {
          operatorKey: "ADS_OPTIMIZER",
          graph: {
            nodes: [
              {
                key: "trigger_funnel_dropoff",
                type: "TRIGGER",
                label: "Funnel Dropoff Detected",
                config: {
                  provider: "wipguard",
                  eventType: "analytics.funnel.dropoff_detected",
                },
              },
              {
                key: "triage_dropoff",
                type: "ACTION",
                label: "Triage Funnel Dropoff",
                config: {
                  actionType: "ai_analyze",
                  promptVersion: "2026-03-08",
                },
              },
            ],
            edges: [
              {
                source: "trigger_funnel_dropoff",
                target: "triage_dropoff",
                priority: 0,
              },
            ],
          },
        },
      } as never);
    vi.mocked(prisma.workflowRun.create).mockResolvedValue({
      id: "run_wait_1",
    } as never);
    vi.mocked(prisma.workflowRunStep.create)
      .mockResolvedValueOnce({ id: "step_trigger_1" } as never)
      .mockResolvedValueOnce({ id: "step_action_1" } as never);
    vi.mocked(prisma.automationAiJob.upsert).mockResolvedValue({
      id: "job_wait_1",
      model: "gpt-4.1-mini",
    } as never);
    vi.mocked(buildRunExecutionContext).mockResolvedValue({
      trigger: {
        provider: "WIPGUARD",
        eventType: "analytics.funnel.dropoff_detected",
        externalId: "alert_wait_1",
      },
      state: {},
    } as never);
    vi.mocked(materializeSourceDocumentsFromTrigger).mockResolvedValue(undefined as never);
    vi.mocked(buildAutomationAiResponseRequest).mockReturnValue({
      request: {
        model: "gpt-4.1-mini",
        input: [{ role: "user", content: "Investigate the funnel dropoff." }],
      },
      parsedToolDefinitions: [],
    } as never);

    const { dispatchWorkflowTriggerEvents } = await import("@/lib/automations/runtime");
    const result = await dispatchWorkflowTriggerEvents(10);

    expect(result).toEqual({
      processed: 1,
      startedRuns: 1,
      timedOutApprovals: 0,
    });
    expect(materializeSourceDocumentsFromTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "wf_wait_1",
        runId: "run_wait_1",
        operatorKey: "ADS_OPTIMIZER",
        provider: "WIPGUARD",
        eventType: "analytics.funnel.dropoff_detected",
        eventDedupeKey: "dropoff:alert_wait_1",
      })
    );
    expect(buildAutomationAiResponseRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeKey: "triage_dropoff",
        actionType: "ai_analyze",
        metadata: expect.objectContaining({
          workflowId: "wf_wait_1",
          runId: "run_wait_1",
          stepId: "step_action_1",
        }),
      })
    );
    expect(prisma.automationAiJob.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dedupeKey: "run_wait_1:triage_dropoff:ai" },
        create: expect.objectContaining({
          workflowId: "wf_wait_1",
          runId: "run_wait_1",
          stepId: "step_action_1",
          status: AutomationAiJobStatus.QUEUED,
        }),
      })
    );
    expect(prisma.workflowRunStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "step_action_1" },
        data: expect.objectContaining({
          status: "WAITING_EXTERNAL",
          output: expect.objectContaining({
            actionType: "ai_analyze",
            aiJobId: "job_wait_1",
            waitingExternal: true,
          }),
        }),
      })
    );
    expect(prisma.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run_wait_1" },
        data: expect.objectContaining({
          status: "WAITING_EXTERNAL",
          error: null,
          finishedAt: null,
        }),
      })
    );
    expect(prisma.workflowTriggerEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "event_wait_1" },
        data: expect.objectContaining({
          status: "DISPATCHED",
          lastError: null,
        }),
      })
    );
  });

  it("settles completed AI webhooks into artifacts and resumes the workflow", async () => {
    const { prisma } = await import("@/lib/prisma");
    const {
      extractAutomationAiOutputText,
      isTerminalAutomationAiStatus,
      parseAutomationAiResponseEnvelope,
      retrieveAutomationOpenAiResponse,
      unwrapAutomationOpenAiWebhookEvent,
    } = await import("@/lib/automations/openai");
    const { buildRunExecutionContext, persistAutomationEnvelope } = await import(
      "@/lib/automations/store"
    );

    vi.mocked(unwrapAutomationOpenAiWebhookEvent).mockResolvedValue({
      type: "response.completed",
      data: { id: "resp_complete_1" },
    } as never);
    vi.mocked(retrieveAutomationOpenAiResponse).mockResolvedValue({
      id: "resp_complete_1",
      status: "completed",
    } as never);
    vi.mocked(extractAutomationAiOutputText).mockReturnValue("final analysis");
    vi.mocked(isTerminalAutomationAiStatus).mockReturnValue(true);
    vi.mocked(parseAutomationAiResponseEnvelope).mockReturnValue({
      summary: "Recovered funnel diagnosis",
      raw: { summary: "Recovered funnel diagnosis" },
    } as never);
    vi.mocked(persistAutomationEnvelope).mockResolvedValue({
      artifactIds: ["artifact_1"],
      recommendationIds: ["recommendation_1"],
    } as never);
    vi.mocked(buildRunExecutionContext).mockResolvedValue({} as never);

    vi.mocked(prisma.automationAiJob.findUnique)
      .mockResolvedValueOnce({ id: "job_complete_1" } as never)
      .mockResolvedValueOnce({
        id: "job_complete_1",
        workflowId: "wf_1",
        runId: "run_1",
        stepId: "step_1",
        operatorKey: "ADS_OPTIMIZER",
        nodeKey: "triage_dropoff",
        jobType: "ai_analyze",
        metadata: { parsedToolDefinitions: [] },
        run: { requestedById: "user_1" },
      } as never);

    vi.mocked(prisma.workflowDefinition.findUnique).mockResolvedValue({
      graph: {
        nodes: [
          {
            key: "triage_dropoff",
            type: "ACTION",
            label: "Triage Funnel Dropoff",
            config: {},
          },
        ],
        edges: [],
      },
    } as never);
    vi.mocked(prisma.workflowRunStep.findFirst).mockResolvedValue({ output: {} } as never);

    const { processAutomationAiWebhook } = await import("@/lib/automations/runtime");
    const result = await processAutomationAiWebhook("{}", new Headers());

    expect(result).toEqual({
      handled: true,
      responseId: "resp_complete_1",
      eventType: "response.completed",
    });
    expect(persistAutomationEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "wf_1",
        runId: "run_1",
        aiJobId: "job_complete_1",
        operatorKey: "ADS_OPTIMIZER",
        createdByNodeKey: "triage_dropoff",
        requestedById: "user_1",
      })
    );
    expect(prisma.automationAiJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job_complete_1" },
        data: expect.objectContaining({
          status: AutomationAiJobStatus.SUCCEEDED,
          responseStatus: "completed",
          outputText: "final analysis",
        }),
      })
    );
    expect(prisma.workflowRunStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "step_1" },
        data: expect.objectContaining({
          output: expect.objectContaining({
            artifactIds: ["artifact_1"],
            recommendationIds: ["recommendation_1"],
          }),
        }),
      })
    );
    expect(prisma.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run_1" },
        data: expect.objectContaining({
          status: "SUCCEEDED",
          error: null,
        }),
      })
    );
  });

  it("resumes completed AI webhooks into downstream recommendation execution", async () => {
    const { prisma } = await import("@/lib/prisma");
    const {
      extractAutomationAiOutputText,
      isTerminalAutomationAiStatus,
      parseAutomationAiResponseEnvelope,
      retrieveAutomationOpenAiResponse,
      unwrapAutomationOpenAiWebhookEvent,
    } = await import("@/lib/automations/openai");
    const { executeApprovedRecommendationsForRun } = await import(
      "@/lib/automations/recommendations"
    );
    const { buildRunExecutionContext, persistAutomationEnvelope } = await import(
      "@/lib/automations/store"
    );

    vi.mocked(unwrapAutomationOpenAiWebhookEvent).mockResolvedValue({
      type: "response.completed",
      data: { id: "resp_resume_1" },
    } as never);
    vi.mocked(retrieveAutomationOpenAiResponse).mockResolvedValue({
      id: "resp_resume_1",
      status: "completed",
    } as never);
    vi.mocked(extractAutomationAiOutputText).mockReturnValue("resume analysis");
    vi.mocked(isTerminalAutomationAiStatus).mockReturnValue(true);
    vi.mocked(parseAutomationAiResponseEnvelope).mockReturnValue({
      summary: "Recovered funnel diagnosis",
      raw: { summary: "Recovered funnel diagnosis" },
    } as never);
    vi.mocked(persistAutomationEnvelope).mockResolvedValue({
      artifactIds: ["artifact_resume_1"],
      recommendationIds: ["recommendation_1"],
    } as never);
    vi.mocked(buildRunExecutionContext).mockResolvedValue({
      trigger: {
        provider: "WIPGUARD",
        eventType: "analytics.funnel.dropoff_detected",
        externalId: "alert_resume_1",
      },
      state: {},
    } as never);
    vi.mocked(executeApprovedRecommendationsForRun).mockResolvedValue({
      attempted: 1,
      executed: 1,
      failed: 0,
      recommendationIds: ["recommendation_1"],
    } as never);

    vi.mocked(prisma.automationAiJob.findUnique)
      .mockResolvedValueOnce({ id: "job_resume_1" } as never)
      .mockResolvedValueOnce({
        id: "job_resume_1",
        workflowId: "wf_resume_1",
        runId: "run_resume_1",
        stepId: "step_ai_1",
        operatorKey: "ADS_OPTIMIZER",
        nodeKey: "triage_dropoff",
        jobType: "ai_analyze",
        metadata: { parsedToolDefinitions: [] },
        run: { requestedById: "user_1" },
      } as never);
    vi.mocked(prisma.workflowDefinition.findUnique).mockResolvedValue({
      graph: {
        nodes: [
          {
            key: "triage_dropoff",
            type: "ACTION",
            label: "Triage Funnel Dropoff",
            config: {
              actionType: "ai_analyze",
            },
          },
          {
            key: "execute_recommendations",
            type: "ACTION",
            label: "Execute Recommendations",
            config: {
              actionType: "execute_recommendation",
              recommendationIds: ["recommendation_1"],
              actionTypes: ["create_task"],
              limit: 5,
            },
          },
        ],
        edges: [
          {
            source: "triage_dropoff",
            target: "execute_recommendations",
            priority: 0,
          },
        ],
      },
    } as never);
    vi.mocked(prisma.workflowRunStep.findFirst).mockResolvedValue({
      output: {
        artifactIds: ["artifact_resume_1"],
        recommendationIds: ["recommendation_1"],
      },
    } as never);
    vi.mocked(prisma.workflowRunStep.create).mockResolvedValueOnce({
      id: "step_exec_1",
    } as never);

    const { processAutomationAiWebhook } = await import("@/lib/automations/runtime");
    const result = await processAutomationAiWebhook("{}", new Headers());

    expect(result).toEqual({
      handled: true,
      responseId: "resp_resume_1",
      eventType: "response.completed",
    });
    expect(persistAutomationEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "wf_resume_1",
        runId: "run_resume_1",
        aiJobId: "job_resume_1",
      })
    );
    expect(executeApprovedRecommendationsForRun).toHaveBeenCalledWith({
      runId: "run_resume_1",
      recommendationIds: ["recommendation_1"],
      actionTypes: ["create_task"],
      limit: 5,
    });
    expect(prisma.workflowRunStep.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runId: "run_resume_1",
          nodeKey: "execute_recommendations",
          nodeType: "ACTION",
        }),
      })
    );
    expect(prisma.workflowRunStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "step_exec_1" },
        data: expect.objectContaining({
          status: "SUCCEEDED",
          output: expect.objectContaining({
            actionType: "execute_recommendation",
            attempted: 1,
            executed: 1,
            recommendationIds: ["recommendation_1"],
          }),
        }),
      })
    );
    expect(prisma.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run_resume_1" },
        data: expect.objectContaining({
          status: "SUCCEEDED",
          error: null,
        }),
      })
    );
  });

  it("fails completed AI jobs when envelope parsing breaks", async () => {
    const { prisma } = await import("@/lib/prisma");
    const {
      extractAutomationAiOutputText,
      isTerminalAutomationAiStatus,
      parseAutomationAiResponseEnvelope,
      retrieveAutomationOpenAiResponse,
      unwrapAutomationOpenAiWebhookEvent,
    } = await import("@/lib/automations/openai");

    vi.mocked(unwrapAutomationOpenAiWebhookEvent).mockResolvedValue({
      type: "response.completed",
      data: { id: "resp_parse_fail_1" },
    } as never);
    vi.mocked(retrieveAutomationOpenAiResponse).mockResolvedValue({
      id: "resp_parse_fail_1",
      status: "completed",
    } as never);
    vi.mocked(extractAutomationAiOutputText).mockReturnValue("broken output");
    vi.mocked(isTerminalAutomationAiStatus).mockReturnValue(true);
    vi.mocked(parseAutomationAiResponseEnvelope).mockImplementation(() => {
      throw new Error("Envelope parse failed");
    });

    vi.mocked(prisma.automationAiJob.findUnique)
      .mockResolvedValueOnce({ id: "job_parse_fail_1" } as never)
      .mockResolvedValueOnce({
        id: "job_parse_fail_1",
        workflowId: "wf_parse_1",
        runId: "run_parse_1",
        stepId: "step_parse_1",
        operatorKey: "ADS_OPTIMIZER",
        nodeKey: "triage_dropoff",
        jobType: "ai_analyze",
        metadata: { parsedToolDefinitions: [] },
        run: { requestedById: "user_1" },
      } as never);

    const { processAutomationAiWebhook } = await import("@/lib/automations/runtime");
    const result = await processAutomationAiWebhook("{}", new Headers());

    expect(result).toEqual({
      handled: true,
      responseId: "resp_parse_fail_1",
      eventType: "response.completed",
    });
    expect(prisma.automationAiJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job_parse_fail_1" },
        data: expect.objectContaining({
          status: AutomationAiJobStatus.FAILED,
          lastError: "Envelope parse failed",
        }),
      })
    );
    expect(prisma.workflowRunStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "step_parse_1" },
        data: expect.objectContaining({
          status: "FAILED",
          error: "Envelope parse failed",
        }),
      })
    );
    expect(prisma.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run_parse_1" },
        data: expect.objectContaining({
          status: "FAILED",
          error: "Envelope parse failed",
        }),
      })
    );
  });

  it("cancels workflow runs when the background response is cancelled", async () => {
    const { prisma } = await import("@/lib/prisma");
    const {
      extractAutomationAiOutputText,
      isTerminalAutomationAiStatus,
      retrieveAutomationOpenAiResponse,
      unwrapAutomationOpenAiWebhookEvent,
    } = await import("@/lib/automations/openai");

    vi.mocked(unwrapAutomationOpenAiWebhookEvent).mockResolvedValue({
      type: "response.completed",
      data: { id: "resp_cancel_1" },
    } as never);
    vi.mocked(retrieveAutomationOpenAiResponse).mockResolvedValue({
      id: "resp_cancel_1",
      status: "cancelled",
    } as never);
    vi.mocked(extractAutomationAiOutputText).mockReturnValue(null as never);
    vi.mocked(isTerminalAutomationAiStatus).mockReturnValue(true);

    vi.mocked(prisma.automationAiJob.findUnique)
      .mockResolvedValueOnce({ id: "job_cancel_1" } as never)
      .mockResolvedValueOnce({
        id: "job_cancel_1",
        workflowId: "wf_cancel_1",
        runId: "run_cancel_1",
        stepId: "step_cancel_1",
        operatorKey: "ADS_OPTIMIZER",
        nodeKey: "triage_dropoff",
        jobType: "ai_analyze",
        metadata: { parsedToolDefinitions: [] },
        run: { requestedById: "user_1" },
      } as never);

    const { processAutomationAiWebhook } = await import("@/lib/automations/runtime");
    const result = await processAutomationAiWebhook("{}", new Headers());

    expect(result).toEqual({
      handled: true,
      responseId: "resp_cancel_1",
      eventType: "response.completed",
    });
    expect(prisma.automationAiJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job_cancel_1" },
        data: expect.objectContaining({
          status: AutomationAiJobStatus.CANCELED,
          lastError: "Background response cancelled",
        }),
      })
    );
    expect(prisma.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run_cancel_1" },
        data: expect.objectContaining({
          status: "CANCELED",
          error: "Background response cancelled",
        }),
      })
    );
  });
});
