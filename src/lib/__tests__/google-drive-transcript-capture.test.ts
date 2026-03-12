import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationProvider } from "@/generated/prisma/client";
import {
  runGoogleDriveTranscriptCapture,
  scoreTranscriptMatch,
} from "@/lib/integrations/google-drive-transcript-capture";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationRule: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
    integrationConnection: {
      updateMany: vi.fn(),
    },
    dealMeeting: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    integrationReceipt: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/integrations/token-refresh", () => ({
  getValidIntegrationAccessToken: vi.fn(),
}));

vi.mock("@/lib/integrations/ownership", () => ({
  resolveIntegrationOrganizationId: vi.fn(),
}));

vi.mock("@/lib/automations/runtime", () => ({
  enqueueWorkflowTriggerEvent: vi.fn(),
  dispatchWorkflowTriggerEvents: vi.fn(),
}));

vi.mock("@/lib/automations/store", () => ({
  persistStandaloneSourceDocument: vi.fn(),
}));

vi.mock("@/lib/integrations/circuit-breaker", () => ({
  CircuitOpenError: class CircuitOpenError extends Error {},
  getCircuitState: vi.fn(() => null),
  isCircuitClosed: vi.fn(async () => true),
  recordFailure: vi.fn(),
  recordSuccess: vi.fn(),
}));

describe("scoreTranscriptMatch", () => {
  it("prefers direct title and deal overlap over time-only overlap", () => {
    const file = {
      id: "file-1",
      name: "Acme corp demo transcript",
      modifiedTime: "2026-03-10T18:00:00.000Z",
      owners: [{ emailAddress: "rep@acme.test" }],
    };

    const strongMatch = scoreTranscriptMatch({
      file,
      meeting: {
        id: "meeting-strong",
        title: "Acme Corp Demo",
        status: "COMPLETED",
        startAt: "2026-03-10T17:30:00.000Z",
        endAt: "2026-03-10T18:15:00.000Z",
        dealId: "deal-1",
        dealName: "Acme Corp Expansion",
        hubspotDealId: "hs-1",
        companyName: "Acme Corp",
        attendeeEmails: ["rep@acme.test"],
      },
    });

    const weakMatch = scoreTranscriptMatch({
      file,
      meeting: {
        id: "meeting-weak",
        title: "Product Demo",
        status: "COMPLETED",
        startAt: "2026-03-10T18:00:00.000Z",
        endAt: "2026-03-10T18:30:00.000Z",
        dealId: "deal-2",
        dealName: "Different Account",
        hubspotDealId: "hs-2",
        companyName: "Other Company",
        attendeeEmails: ["someone-else@test.com"],
      },
    });

    expect(strongMatch).not.toBeNull();
    expect(weakMatch).not.toBeNull();
    expect((strongMatch?.score ?? 0) > (weakMatch?.score ?? 0)).toBe(true);
    expect(strongMatch?.reasons).toContain("deal");
    expect(strongMatch?.reasons).toContain("title");
  });

  it("returns null for low-confidence time-only candidates", () => {
    const result = scoreTranscriptMatch({
      file: {
        id: "file-2",
        name: "meeting notes",
        modifiedTime: "2026-03-10T18:00:00.000Z",
      },
      meeting: {
        id: "meeting-1",
        title: "Generic Sync",
        status: "COMPLETED",
        startAt: "2026-03-10T18:00:00.000Z",
        endAt: "2026-03-10T18:30:00.000Z",
        dealId: "deal-1",
        dealName: "Different Account",
        hubspotDealId: "hs-1",
        companyName: "Other Company",
        attendeeEmails: [],
      },
    });

    expect(result).toBeNull();
  });
});

describe("runGoogleDriveTranscriptCapture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("archives transcripts, stores receipts, and dispatches transcript-ready events for matched demos", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { getValidIntegrationAccessToken } = await import("@/lib/integrations/token-refresh");
    const { resolveIntegrationOrganizationId } = await import("@/lib/integrations/ownership");
    const { enqueueWorkflowTriggerEvent, dispatchWorkflowTriggerEvents } = await import("@/lib/automations/runtime");
    const { persistStandaloneSourceDocument } = await import("@/lib/automations/store");

    vi.mocked(prisma.integrationRule.upsert).mockResolvedValue({
      id: "rule_1",
      key: "google_drive_transcript_capture",
      enabled: true,
      statusOverride: null,
      config: {
        folderIds: ["folder_1"],
        lookbackHours: 72,
        filenameKeywords: ["transcript", "chat", "meet", "demo"],
        maxFilesPerRun: 10,
      },
      checkpoint: {},
      lastObservedAt: null,
      lastRunAt: null,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    vi.mocked(getValidIntegrationAccessToken).mockResolvedValue("workspace-token");
    vi.mocked(resolveIntegrationOrganizationId).mockResolvedValue("org_1");
    vi.mocked(persistStandaloneSourceDocument).mockResolvedValue({
      workflowId: "wf_archive_1",
      runId: "run_archive_1",
      sourceDocumentId: "doc_archive_1",
    });
    vi.mocked(prisma.dealMeeting.findMany).mockResolvedValue([
      {
        id: "meeting_1",
        title: "Acme Corp Demo",
        status: "COMPLETED",
        startAt: new Date("2026-03-10T17:30:00.000Z"),
        endAt: new Date("2026-03-10T18:15:00.000Z"),
        dealId: "local_deal_1",
        deal: {
          id: "local_deal_1",
          name: "Acme Corp Expansion",
          hubspotDealId: "hs_1",
        },
        company: {
          name: "Acme Corp",
        },
        attendees: [{ email: "rep@acme.test" }],
      },
    ] as never);
    vi.mocked(prisma.dealMeeting.update).mockResolvedValue({
      id: "meeting_1",
      title: "Acme Corp Demo",
      startAt: new Date("2026-03-10T17:30:00.000Z"),
      endAt: new Date("2026-03-10T18:15:00.000Z"),
      status: "COMPLETED",
      dealId: "local_deal_1",
      deal: {
        id: "local_deal_1",
        name: "Acme Corp Expansion",
        hubspotDealId: "hs_1",
      },
    } as never);
    vi.mocked(dispatchWorkflowTriggerEvents).mockResolvedValue({
      processed: 1,
      startedRuns: 1,
      timedOutApprovals: 0,
    } as never);
    vi.mocked(prisma.integrationReceipt.upsert).mockResolvedValue({ id: "receipt_1" } as never);
    vi.mocked(prisma.integrationRule.update).mockResolvedValue({ id: "rule_1" } as never);
    vi.mocked(prisma.integrationConnection.updateMany).mockResolvedValue({ count: 1 } as never);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.startsWith("https://www.googleapis.com/drive/v3/files?")) {
          return new Response(
            JSON.stringify({
              files: [
                {
                  id: "file_1",
                  name: "Acme corp demo transcript",
                  mimeType: "text/plain",
                  webViewLink: "https://drive.test/file_1",
                  modifiedTime: "2026-03-10T18:00:00.000Z",
                  owners: [{ emailAddress: "rep@acme.test" }],
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        if (url.includes("/drive/v3/files/file_1?alt=media")) {
          return new Response("Transcript body", { status: 200 });
        }

        throw new Error(`Unexpected fetch ${url}`);
      }) as typeof fetch
    );

    const result = await runGoogleDriveTranscriptCapture({
      userId: "user_1",
    });

    expect(result).toMatchObject({
      scannedFiles: 1,
      matchedFiles: 1,
      unmatchedFiles: 0,
      dispatchedEvents: 1,
      failedFiles: 0,
      transcripts: [
        {
          fileId: "file_1",
          meetingId: "meeting_1",
          sourceDocumentId: "doc_archive_1",
        },
      ],
    });
    expect(persistStandaloneSourceDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "user_1",
        provider: IntegrationProvider.GOOGLE_WORKSPACE,
        documentType: "transcript",
        textContent: "Transcript body",
      })
    );
    expect(prisma.integrationReceipt.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          metadata: expect.objectContaining({
            sourceDocumentId: "doc_archive_1",
            matchedMeetingId: "meeting_1",
          }),
        }),
      })
    );
    expect(enqueueWorkflowTriggerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: IntegrationProvider.GOOGLE_WORKSPACE,
        eventType: "google-workspace.meet.transcript_ready",
        payload: expect.objectContaining({
          meetingId: "meeting_1",
          sourceDocumentId: "doc_archive_1",
          sourceDocument: expect.objectContaining({
            id: "doc_archive_1",
            workflowId: "wf_archive_1",
            runId: "run_archive_1",
          }),
          documents: [
            expect.objectContaining({
              documentType: "transcript",
              metadata: expect.objectContaining({
                archivedSourceDocumentId: "doc_archive_1",
              }),
            }),
          ],
        }),
      })
    );
  });
});
