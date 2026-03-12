import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/automations/runtime", () => ({
  enqueueWorkflowTriggerEvent: vi.fn(),
  dispatchWorkflowTriggerEvents: vi.fn(async () => ({ startedRuns: 1 })),
}));

vi.mock("@/lib/automations/store", () => ({
  persistStandaloneSourceDocument: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationRule: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
    integrationReceipt: {
      upsert: vi.fn(),
    },
    integrationConnection: {
      updateMany: vi.fn(),
    },
    dealMeeting: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/integrations/ownership", () => ({
  resolveIntegrationOrganizationId: vi.fn(),
}));

vi.mock("@/lib/integrations/token-refresh", () => ({
  getValidIntegrationAccessToken: vi.fn(),
}));

vi.mock("@/lib/integrations/with-retries", () => ({
  withRetries: vi.fn(async (fn: () => Promise<unknown>) => await fn()),
}));

vi.mock("@/lib/integrations/circuit-breaker", () => ({
  CircuitOpenError: class CircuitOpenError extends Error {},
  getCircuitState: vi.fn(() => null),
  isCircuitClosed: vi.fn(async () => true),
  recordFailure: vi.fn(),
  recordSuccess: vi.fn(),
}));

import {
  runGoogleDriveTranscriptCapture,
  scoreTranscriptMatch,
} from "@/lib/integrations/google-drive-transcript-capture";
import { IntegrationProvider } from "@/generated/prisma/client";
import { enqueueWorkflowTriggerEvent } from "@/lib/automations/runtime";
import { persistStandaloneSourceDocument } from "@/lib/automations/store";
import { prisma } from "@/lib/prisma";
import { resolveIntegrationOrganizationId } from "@/lib/integrations/ownership";
import { getValidIntegrationAccessToken } from "@/lib/integrations/token-refresh";

describe("scoreTranscriptMatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("emits transcript-ready events with the archived source document payload", async () => {
    vi.mocked(prisma.integrationRule.upsert).mockResolvedValue({
      id: "rule-1",
      key: "google_drive_transcript_capture",
      enabled: true,
      statusOverride: null,
      config: {
        folderIds: ["folder-1"],
        lookbackHours: 24,
        filenameKeywords: ["transcript"],
        maxFilesPerRun: 10,
      },
      checkpoint: {},
      lastObservedAt: null,
      lastRunAt: null,
      lastError: null,
    } as never);
    vi.mocked(resolveIntegrationOrganizationId).mockResolvedValue("org-1" as never);
    vi.mocked(getValidIntegrationAccessToken).mockResolvedValue("token-1" as never);
    vi.mocked(persistStandaloneSourceDocument).mockResolvedValue({
      workflowId: "wf-archive-1",
      runId: "run-archive-1",
      sourceDocumentId: "doc-archive-1",
    } as never);
    vi.mocked(prisma.dealMeeting.findMany).mockResolvedValue([
      {
        id: "meeting-1",
        title: "Acme Demo",
        status: "COMPLETED",
        startAt: new Date("2026-03-10T17:30:00.000Z"),
        endAt: new Date("2026-03-10T18:15:00.000Z"),
        dealId: "deal-1",
        deal: {
          id: "deal-1",
          name: "Acme Corp Expansion",
          hubspotDealId: "hs-1",
        },
        company: { name: "Acme Corp" },
        attendees: [{ email: "rep@acme.test" }],
      },
    ] as never);
    vi.mocked(prisma.dealMeeting.update).mockResolvedValue({
      id: "meeting-1",
      title: "Acme Demo",
      startAt: new Date("2026-03-10T17:30:00.000Z"),
      endAt: new Date("2026-03-10T18:15:00.000Z"),
      status: "COMPLETED",
      dealId: "deal-1",
      deal: {
        id: "deal-1",
        name: "Acme Corp Expansion",
        hubspotDealId: "hs-1",
      },
    } as never);
    vi.mocked(prisma.integrationReceipt.upsert).mockResolvedValue({} as never);
    vi.mocked(prisma.integrationRule.update).mockResolvedValue({} as never);
    vi.mocked(prisma.integrationConnection.updateMany).mockResolvedValue({ count: 1 } as never);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("/drive/v3/files?")) {
          return {
            ok: true,
            json: async () => ({
              files: [
                {
                  id: "file-1",
                  name: "Acme corp demo transcript",
                  mimeType: "text/plain",
                  webViewLink: "https://drive.test/file-1",
                  modifiedTime: "2026-03-10T18:00:00.000Z",
                  owners: [{ emailAddress: "rep@acme.test" }],
                },
              ],
            }),
          } as Response;
        }

        return {
          ok: true,
          text: async () => "Customer: Budget approved.\nRep: Next step is proposal.",
        } as Response;
      }),
    );

    const result = await runGoogleDriveTranscriptCapture({ userId: "user-1" });

    expect(result.matchedFiles).toBe(1);
    expect(enqueueWorkflowTriggerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: IntegrationProvider.GOOGLE_WORKSPACE,
        eventType: "google-workspace.meet.transcript_ready",
        payload: expect.objectContaining({
          sourceDocumentId: "doc-archive-1",
          sourceDocument: expect.objectContaining({
            id: "doc-archive-1",
            documentType: "transcript",
            title: "Acme corp demo transcript",
            sourceUrl: "https://drive.test/file-1",
            textContent: "Customer: Budget approved.\nRep: Next step is proposal.",
          }),
        }),
      }),
    );
  });
});
