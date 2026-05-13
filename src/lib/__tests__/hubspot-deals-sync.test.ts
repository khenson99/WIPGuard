import { beforeEach, describe, expect, it, vi } from "vitest";
import { DealStage, IntegrationConnectionStatus, IntegrationProvider } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { mapHubSpotStageToDealStage, syncDealsFromHubSpot } from "@/lib/deals/hubspot-sync";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationConnection: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    dealCompany: {
      upsert: vi.fn(),
    },
    dealContact: {
      upsert: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    deal: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    dealStageHistory: {
      create: vi.fn(),
    },
    dealMeeting: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/integrations/token-crypto", () => ({
  protectIntegrationSecret: vi.fn((value: string) => value),
  unprotectIntegrationSecret: vi.fn((value: string) =>
    typeof value === "string" && value.startsWith("plainv1.") ? value.slice("plainv1.".length) : value,
  ),
}));

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("HubSpot local deal sync", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    vi.mocked(prisma.integrationConnection.findUnique).mockResolvedValue({
      id: "conn-1",
      userId: "user-1",
      provider: IntegrationProvider.HUBSPOT,
      status: IntegrationConnectionStatus.CONNECTED,
      providerAccountId: "hubspot-account",
      accountLabel: "HubSpot",
      scopes: [],
      accessToken: "plainv1.hs-token",
      refreshToken: "plainv1.refresh-token",
      tokenType: "bearer",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      connectedAt: new Date(),
      lastSyncedAt: null,
      lastError: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.deal.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.deal.upsert).mockImplementation((async (args: {
      where: { hubspotDealId?: string };
      create: { stage: DealStage };
    }) => ({
      id: `local-${args.where.hubspotDealId ?? "unknown"}`,
      stage: args.create.stage,
    })) as never);
    vi.mocked(prisma.dealStageHistory.create).mockResolvedValue({} as never);
    vi.mocked(prisma.dealCompany.upsert).mockResolvedValue({ id: "company-1" } as never);
    vi.mocked(prisma.dealContact.upsert).mockResolvedValue({ id: "contact-1" } as never);
    vi.mocked(prisma.dealMeeting.upsert).mockResolvedValue({ id: "meeting-1" } as never);
  });

  it("maps the current main-pipeline stages to internal deal stages", () => {
    expect(mapHubSpotStageToDealStage("1499838171")).toBe(DealStage.LEAD);
    expect(mapHubSpotStageToDealStage("1955958510")).toBe(DealStage.QUALIFIED);
    expect(mapHubSpotStageToDealStage("1955580622")).toBe(DealStage.PROPOSAL);
    expect(mapHubSpotStageToDealStage("contractsent")).toBe(DealStage.NEGOTIATION);
    expect(mapHubSpotStageToDealStage("1499784890")).toBe(DealStage.CLOSED_LOST);
  });

  it("skips non-default pipelines during local deal sync", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const parsed = new URL(url);

      if (parsed.pathname === "/crm/v3/objects/deals") {
        return jsonResponse({
          results: [
            {
              id: "deal-proposal",
              properties: {
                dealname: "Proposal Deal",
                dealstage: "1955580622",
                pipeline: "default",
                amount: "1000",
                createdate: "2026-03-01T12:00:00.000Z",
                hs_lastmodifieddate: "2026-03-03T12:00:00.000Z",
              },
            },
            {
              id: "deal-qualified",
              properties: {
                dealname: "Qualified Deal",
                dealstage: "1955958510",
                pipeline: "default",
                amount: "2000",
                createdate: "2026-03-01T12:30:00.000Z",
                hs_lastmodifieddate: "2026-03-03T12:30:00.000Z",
              },
            },
            {
              id: "deal-ping-later",
              properties: {
                dealname: "Ping Later Deal",
                dealstage: "contractsent",
                pipeline: "default",
                amount: "3000",
                createdate: "2026-03-01T13:00:00.000Z",
                hs_lastmodifieddate: "2026-03-03T13:00:00.000Z",
              },
            },
            {
              id: "deal-subscription",
              properties: {
                dealname: "Zaybra Subscription",
                dealstage: "2239936224",
                pipeline: "1390107368",
                amount: "99",
                createdate: "2026-03-01T13:30:00.000Z",
                hs_lastmodifieddate: "2026-03-03T13:30:00.000Z",
              },
            },
          ],
        });
      }

      if (
        parsed.pathname === "/crm/v3/objects/contacts" ||
        parsed.pathname === "/crm/v3/objects/companies"
      ) {
        return jsonResponse({ results: [] });
      }

      if (parsed.pathname === "/crm/v3/objects/meetings") {
        return jsonResponse({
          results: [
            {
              id: "meeting-demo",
              properties: {
                hs_meeting_title: "Field Fastener & Arda Cards",
                hs_meeting_body: "A Sales Engineer will walk you through how Arda can eliminate stockouts and make ordering 10x faster.",
                hs_meeting_start_time: "2026-03-04T15:00:00.000Z",
                hs_meeting_end_time: "2026-03-04T15:45:00.000Z",
                hs_meeting_outcome: "COMPLETED",
              },
            },
          ],
        });
      }

      if (parsed.pathname === "/crm/v3/owners") {
        return jsonResponse({ results: [] });
      }

      if (parsed.pathname.includes("/associations/")) {
        return jsonResponse({ results: [] });
      }

      throw new Error(`Unexpected fetch: ${parsed.pathname}`);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const result = await syncDealsFromHubSpot("user-1");

    expect(result.deals).toBe(3);
    expect(result.meetings).toBe(1);
    expect(vi.mocked(prisma.deal.upsert).mock.calls).toHaveLength(3);
    expect(vi.mocked(prisma.dealMeeting.upsert).mock.calls[0][0]).toEqual(
      expect.objectContaining({
        create: expect.objectContaining({
          notes: "A Sales Engineer will walk you through how Arda can eliminate stockouts and make ordering 10x faster.",
        }),
        update: expect.objectContaining({
          notes: "A Sales Engineer will walk you through how Arda can eliminate stockouts and make ordering 10x faster.",
        }),
      }),
    );
    expect(
      vi.mocked(prisma.deal.upsert).mock.calls.map((call) => call[0].create.stage),
    ).toEqual([
      DealStage.PROPOSAL,
      DealStage.QUALIFIED,
      DealStage.NEGOTIATION,
    ]);

    const calls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(calls.some((url) => url.includes("/crm/v3/objects/deals/deal-subscription/associations/"))).toBe(false);
    expect(calls.some((url) => url.includes("properties=dealname%2Cdealstage%2Camount%2Cclosedate%2Ccreatedate%2Chs_analytics_source%2Chubspot_owner_id%2Chs_lastmodifieddate%2Cpipeline"))).toBe(true);
  });
});
