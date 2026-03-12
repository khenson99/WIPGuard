import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AutomationRecommendationStatus,
  AutomationSourceDocumentStatus,
} from "@/lib/automations/prisma-enums";
import {
  IntegrationProvider,
  Prisma,
} from "@/generated/prisma/client";
import {
  buildRunExecutionContext,
  materializeSourceDocumentsFromTrigger,
  persistStandaloneSourceDocument,
  persistAutomationEnvelope,
} from "@/lib/automations/store";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    automationSourceDocument: {
      upsert: vi.fn(),
    },
    automationArtifact: {
      upsert: vi.fn(),
    },
    automationRecommendation: {
      upsert: vi.fn(),
    },
    workflowDefinition: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    workflowRun: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

describe("automation store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("materializes fallback source documents with db-null structured data", async () => {
    vi.mocked(prisma.automationSourceDocument.upsert).mockResolvedValue({} as never);

    const count = await materializeSourceDocumentsFromTrigger({
      workflowId: "wf_1",
      runId: "run_1",
      operatorKey: "GTM_SCRUM",
      provider: IntegrationProvider.HUBSPOT,
      eventType: "meeting.completed",
      eventDedupeKey: "evt_1",
      payload: {
        transcript: "Customer asked for a recap",
        title: "Demo recap",
      },
    });

    expect(count).toBe(1);
    expect(prisma.automationSourceDocument.upsert).toHaveBeenCalledWith({
      where: { dedupeKey: "run_1:evt_1:document:fallback" },
      create: expect.objectContaining({
        workflowId: "wf_1",
        runId: "run_1",
        provider: IntegrationProvider.HUBSPOT,
        eventType: "meeting.completed",
        documentType: "transcript",
        status: AutomationSourceDocumentStatus.READY,
        structuredData: Prisma.DbNull,
        metadata: {
          eventDedupeKey: "evt_1",
        },
      }),
      update: expect.objectContaining({
        structuredData: Prisma.DbNull,
        observedAt: expect.any(Date),
      }),
    });
  });

  it("persists artifacts and approval-gated recommendations", async () => {
    vi.mocked(prisma.automationArtifact.upsert).mockResolvedValueOnce({
      id: "artifact_1",
    } as never);
    vi.mocked(prisma.automationRecommendation.upsert)
      .mockResolvedValueOnce({ id: "rec_1" } as never)
      .mockResolvedValueOnce({ id: "rec_2" } as never);

    const result = await persistAutomationEnvelope({
      workflowId: "wf_1",
      runId: "run_1",
      operatorKey: "GTM_SCRUM",
      createdByNodeKey: "draft_recommendations",
      requestedById: "user_1",
      envelope: {
        artifacts: [
          {
            artifactType: "brief",
            title: "Account brief",
            contentJson: {
              customer: "Acme",
            },
          },
        ],
        recommendations: [
          {
            recommendationType: "task",
            title: "Create task",
            summary: "Create a follow-up task.",
            actionType: "create_task",
          },
          {
            recommendationType: "email",
            title: "Email customer",
            summary: "Send a follow-up email.",
            actionType: "send_gmail_message",
          },
        ],
      },
    });

    expect(result).toEqual({
      artifactIds: ["artifact_1"],
      recommendationIds: ["rec_1", "rec_2"],
    });

    expect(prisma.automationRecommendation.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        create: expect.objectContaining({
          artifactId: "artifact_1",
          requiresApproval: false,
          status: AutomationRecommendationStatus.APPROVED,
          approvedAt: expect.any(Date),
        }),
      })
    );
    expect(prisma.automationRecommendation.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        create: expect.objectContaining({
          artifactId: "artifact_1",
          requiresApproval: true,
          status: AutomationRecommendationStatus.PENDING_APPROVAL,
          approvedAt: null,
        }),
      })
    );
  });

  it("persists standalone source documents through a system-managed archive workflow", async () => {
    vi.mocked(prisma.workflowDefinition.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.workflowDefinition.upsert).mockResolvedValue({
      id: "wf_archive_1",
    } as never);
    vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.workflowRun.create).mockResolvedValue({
      id: "run_archive_1",
    } as never);
    vi.mocked(prisma.automationSourceDocument.upsert).mockResolvedValue({
      id: "doc_archive_1",
    } as never);

    const result = await persistStandaloneSourceDocument({
      ownerId: "user_1",
      requestedById: "user_1",
      operatorKey: "SALES_FOLLOWUP",
      provider: IntegrationProvider.GOOGLE_WORKSPACE,
      eventType: "google-workspace.drive.transcript_captured",
      externalId: "file_1",
      triggerPayload: {
        fileId: "file_1",
      },
      documentType: "transcript",
      title: "Acme transcript",
      mimeType: "text/plain",
      sourceUrl: "https://drive.test/file_1",
      textContent: "Transcript body",
      metadata: {
        fileId: "file_1",
      },
      dedupeKey: "google-workspace:drive-transcript:file_1:2026-03-11t00:00:00.000z",
    });

    expect(result).toEqual({
      workflowId: "wf_archive_1",
      runId: "run_archive_1",
      sourceDocumentId: "doc_archive_1",
    });

    expect(prisma.workflowDefinition.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: expect.stringMatching(/^wf_sys_transcript_archive_/) },
        create: expect.objectContaining({
          ownerId: "user_1",
          name: "System Transcript Archive",
          isSystemManaged: true,
          providers: [IntegrationProvider.GOOGLE_WORKSPACE],
        }),
        update: expect.objectContaining({
          status: "ACTIVE",
          isSystemManaged: true,
        }),
      })
    );
    expect(prisma.workflowRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workflowId: "wf_archive_1",
          triggerType: "google-workspace.drive.transcript_captured",
          triggerId: "file_1",
        }),
      })
    );
    expect(prisma.automationSourceDocument.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          dedupeKey: "google-workspace:drive-transcript:file_1:2026-03-11t00:00:00.000z",
        },
        create: expect.objectContaining({
          workflowId: "wf_archive_1",
          runId: "run_archive_1",
          documentType: "transcript",
          title: "Acme transcript",
          textContent: "Transcript body",
        }),
      })
    );
  });

  it("builds execution context from run relations", async () => {
    vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue({
      triggerProvider: IntegrationProvider.HUBSPOT,
      triggerType: "deal.updated",
      triggerId: "deal_1",
      triggerPayload: {
        source: "webhook",
      },
      steps: [
        {
          nodeKey: "draft_brief",
          output: {
            summary: "Healthy pipeline",
          },
        },
      ],
      sourceDocuments: [
        {
          id: "doc_1",
          documentType: "notes",
          title: "Call notes",
          sourceUrl: null,
          textContent: "Need pricing details",
          structuredData: null,
          metadata: null,
          provider: IntegrationProvider.HUBSPOT,
          eventType: "deal.updated",
          externalId: "deal_1",
        },
      ],
      artifacts: [
        {
          id: "artifact_1",
          artifactType: "brief",
          title: "Brief",
          summary: "Account summary",
          content: null,
          contentJson: null,
          metadata: null,
          status: "READY",
        },
      ],
      recommendations: [
        {
          id: "rec_1",
          recommendationType: "task",
          title: "Create task",
          summary: "Follow up with pricing.",
          detail: null,
          actionType: "create_task",
          actionPayload: { priority: "P1" },
          requiresApproval: false,
          status: AutomationRecommendationStatus.APPROVED,
          priority: "P1",
          dueAt: new Date("2026-03-08T12:00:00.000Z"),
        },
      ],
    } as never);

    const context = await buildRunExecutionContext("run_1");

    expect(context).toEqual({
      trigger: {
        provider: IntegrationProvider.HUBSPOT,
        eventType: "deal.updated",
        externalId: "deal_1",
        payload: {
          source: "webhook",
        },
      },
      state: {
        draft_brief: {
          summary: "Healthy pipeline",
        },
      },
      sourceDocuments: [
        expect.objectContaining({
          id: "doc_1",
          documentType: "notes",
          title: "Call notes",
        }),
      ],
      artifacts: [
        expect.objectContaining({
          id: "artifact_1",
          artifactType: "brief",
          title: "Brief",
        }),
      ],
      recommendations: [
        expect.objectContaining({
          id: "rec_1",
          recommendationType: "task",
          title: "Create task",
          dueAt: "2026-03-08T12:00:00.000Z",
        }),
      ],
    });
  });
});
