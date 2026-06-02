import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockIntegrationConnectionUpdateMany = vi.hoisted(() => vi.fn());
const mockIntegrationConnectionUpsert = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationConnection: {
      updateMany: mockIntegrationConnectionUpdateMany,
      upsert: mockIntegrationConnectionUpsert,
    },
  },
}));

vi.mock("@/lib/analytics/provider-enrichment-adapters", () => ({
  isUnifyPullRequest: vi.fn(),
  normalizeNativeProviderSignals: vi.fn(),
  pullUnifySignalsFromApi: vi.fn(),
}));

vi.mock("@/lib/analytics/visitor-funnel", () => ({
  ingestVisitorEnrichmentSignals: vi.fn(),
}));

vi.mock("@/lib/analytics/visitor-funnel-availability", () => ({
  getVisitorFunnelPrisma: vi.fn(() => ({})),
  VISITOR_FUNNEL_PRISMA_UNAVAILABLE_REASON:
    "Visitor funnel Prisma models are unavailable in this deployment.",
}));

vi.mock("@/lib/imladris/ingestion", () => ({
  ingestImladrisRawRecords: vi.fn(),
}));

describe("POST /api/analytics/funnel/enrich/[provider]", () => {
  const originalSharedSecret = process.env.VISITOR_FUNNEL_ENRICH_SECRET;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    delete process.env.VISITOR_FUNNEL_ENRICH_SECRET;
  });

  it("returns a normalized preview for admin dry runs without writing signals", async () => {
    const { auth } = await import("@/lib/auth");
    const { normalizeNativeProviderSignals } = await import("@/lib/analytics/provider-enrichment-adapters");
    const { ingestVisitorEnrichmentSignals } = await import("@/lib/analytics/visitor-funnel");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-1", role: "admin" },
    } as never);
    vi.mocked(normalizeNativeProviderSignals).mockReturnValue([
      {
        signalKey: "row-1",
        email: "sample@example.com",
        domain: "example.com",
        companyName: "Example Co",
        confidence: 0.87,
        occurredAt: "2026-03-08T12:00:00.000Z",
        provenance: "inferred",
        metadata: {
          capturedUrl: "https://wipguard.ai/demo",
          referrer: "https://www.reddit.com/r/revops",
        },
      },
    ]);

    const { POST } = await import("@/app/api/analytics/funnel/enrich/[provider]/route");
    const request = new Request("http://localhost/api/analytics/funnel/enrich/clay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dryRun: true,
        rows: [{ rowId: "row-1" }],
      }),
    }) as unknown as NextRequest;

    const response = await POST(request, {
      params: Promise.resolve({ provider: "clay" }),
    });
    const body = (await response.json()) as {
      accepted: number;
      dryRun: boolean;
      preview: Array<Record<string, unknown>>;
      received: number;
      stored: number;
      message: string;
    };

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      accepted: 1,
      dryRun: true,
      received: 1,
      stored: 0,
    });
    expect(body.message).toContain("No records were stored");
    expect(body.preview[0]).toMatchObject({
      signalKey: "row-1",
      email: "sample@example.com",
      domain: "example.com",
      companyName: "Example Co",
      capturedUrl: "https://wipguard.ai/demo",
      referrer: "https://www.reddit.com/r/revops",
    });
    expect(ingestVisitorEnrichmentSignals).not.toHaveBeenCalled();
  });

  it("blocks dry-run validation for non-admin callers even with a valid webhook secret", async () => {
    process.env.VISITOR_FUNNEL_ENRICH_SECRET = "shared-secret";

    const { auth } = await import("@/lib/auth");
    const { normalizeNativeProviderSignals } = await import("@/lib/analytics/provider-enrichment-adapters");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "member-1", role: "member" },
    } as never);

    const { POST } = await import("@/app/api/analytics/funnel/enrich/[provider]/route");
    const request = new Request("http://localhost/api/analytics/funnel/enrich/rb2b", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-secret": "shared-secret",
      },
      body: JSON.stringify({
        dryRun: true,
        "Business Email": "sample@example.com",
      }),
    }) as unknown as NextRequest;

    const response = await POST(request, {
      params: Promise.resolve({ provider: "rb2b" }),
    });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(403);
    expect(body.error).toContain("admin");
    expect(normalizeNativeProviderSignals).not.toHaveBeenCalled();
  });

  it("returns a warning response when dry-run normalization finds no signals", async () => {
    const { auth } = await import("@/lib/auth");
    const { normalizeNativeProviderSignals } = await import("@/lib/analytics/provider-enrichment-adapters");
    const { ingestVisitorEnrichmentSignals } = await import("@/lib/analytics/visitor-funnel");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-2", role: "admin" },
    } as never);
    vi.mocked(normalizeNativeProviderSignals).mockReturnValue([]);

    const { POST } = await import("@/app/api/analytics/funnel/enrich/[provider]/route");
    const request = new Request("http://localhost/api/analytics/funnel/enrich/clay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dryRun: true,
        rows: [{ rowId: "missing" }],
      }),
    }) as unknown as NextRequest;

    const response = await POST(request, {
      params: Promise.resolve({ provider: "clay" }),
    });
    const body = (await response.json()) as {
      accepted: number;
      dryRun: boolean;
      message: string;
      received: number;
      stored: number;
    };

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      accepted: 0,
      dryRun: true,
      received: 0,
      stored: 0,
    });
    expect(body.message).toContain("sample payload");
    expect(ingestVisitorEnrichmentSignals).not.toHaveBeenCalled();
  });

  it("returns a disabled response when funnel Prisma models are unavailable", async () => {
    const { auth } = await import("@/lib/auth");
    const { normalizeNativeProviderSignals } = await import(
      "@/lib/analytics/provider-enrichment-adapters"
    );
    const { ingestVisitorEnrichmentSignals } = await import(
      "@/lib/analytics/visitor-funnel"
    );
    const { getVisitorFunnelPrisma } = await import(
      "@/lib/analytics/visitor-funnel-availability"
    );

    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-3", role: "admin" },
    } as never);
    vi.mocked(getVisitorFunnelPrisma).mockReturnValue(null);
    vi.mocked(normalizeNativeProviderSignals).mockReturnValue([
      {
        signalKey: "row-1",
        email: "sample@example.com",
        domain: "example.com",
        companyName: "Example Co",
        confidence: 0.9,
        occurredAt: "2026-03-08T12:00:00.000Z",
        provenance: "exact",
        metadata: {},
      },
    ]);

    const { POST } = await import("@/app/api/analytics/funnel/enrich/[provider]/route");
    const request = new NextRequest("http://localhost/api/analytics/funnel/enrich/clay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rows: [{ rowId: "row-1" }],
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ provider: "clay" }),
    });
    const body = (await response.json()) as {
      accepted: number;
      disabled: boolean;
      reason: string;
      stored: number;
      rows: Array<Record<string, unknown>>;
    };

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      accepted: 1,
      disabled: true,
      reason: "Visitor funnel Prisma models are unavailable in this deployment.",
      stored: 0,
    });
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({
      row_id: "row-1",
      email: "sample@example.com",
      domain: "example.com",
      company: "Example Co",
      confidence: 0.9,
      occurred_at: "2026-03-08T12:00:00.000Z",
    });
    expect(ingestVisitorEnrichmentSignals).not.toHaveBeenCalled();
  });

  it("rejects truncated Unify pull responses without writing signals", async () => {
    const { auth } = await import("@/lib/auth");
    const {
      isUnifyPullRequest,
      pullUnifySignalsFromApi,
    } = await import("@/lib/analytics/provider-enrichment-adapters");
    const { ingestVisitorEnrichmentSignals } = await import(
      "@/lib/analytics/visitor-funnel"
    );

    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-4", role: "admin" },
    } as never);
    vi.mocked(isUnifyPullRequest).mockReturnValue(true);
    vi.mocked(pullUnifySignalsFromApi).mockResolvedValue({
      signals: [
        {
          signalKey: "rec_1",
          domain: "example.com",
        },
      ],
      truncated: true,
      totalFiltered: 2,
      returned: 1,
      maxRecords: 1,
    });

    const { POST } = await import("@/app/api/analytics/funnel/enrich/[provider]/route");
    const request = new NextRequest("http://localhost/api/analytics/funnel/enrich/unify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "pull",
        apiKey: "unify-key",
        objectName: "website_visitors",
        updatedAfter: "2026-03-05T00:00:00.000Z",
        maxRecords: 1,
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ provider: "unify" }),
    });
    const body = (await response.json()) as { error: string; received: number };

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      error: "Unify pull returned 1/2 filtered records; no enrichment signals were stored.",
      received: 1,
    });
    expect(ingestVisitorEnrichmentSignals).not.toHaveBeenCalled();
  });

  it("persists push enrichment payloads as Imladris raw records before storing visitor signals", async () => {
    process.env.VISITOR_FUNNEL_ENRICH_SECRET = "shared-secret";

    const { auth } = await import("@/lib/auth");
    const { normalizeNativeProviderSignals } = await import(
      "@/lib/analytics/provider-enrichment-adapters"
    );
    const { ingestVisitorEnrichmentSignals } = await import(
      "@/lib/analytics/visitor-funnel"
    );
    const { ingestImladrisRawRecords } = await import("@/lib/imladris/ingestion");

    vi.mocked(auth).mockResolvedValue(null as never);
    vi.mocked(normalizeNativeProviderSignals).mockReturnValue([
      {
        signalKey: "clay-row-1",
        anonymousId: "anon-1",
        email: "sample@example.com",
        domain: "example.com",
        companyName: "Example Co",
        confidence: 0.92,
        occurredAt: "2026-03-08T12:00:00.000Z",
        provenance: "exact",
        metadata: {
          capturedUrl: "https://wipguard.ai/pricing",
        },
      },
    ]);
    vi.mocked(ingestImladrisRawRecords).mockResolvedValue({
      syncRunId: "raw-run-1",
      status: "SUCCESS",
      recordCount: 2,
      acceptedCount: 2,
      errorCount: 0,
    });
    vi.mocked(ingestVisitorEnrichmentSignals).mockResolvedValue({
      accepted: 1,
      stored: 1,
    });
    mockIntegrationConnectionUpdateMany.mockResolvedValue({ count: 1 });

    const { POST } = await import("@/app/api/analytics/funnel/enrich/[provider]/route");
    const request = new NextRequest("http://localhost/api/analytics/funnel/enrich/clay", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-secret": "shared-secret",
      },
      body: JSON.stringify({
        rows: [{ rowId: "clay-row-1", email: "sample@example.com" }],
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ provider: "clay" }),
    });
    const body = (await response.json()) as {
      accepted: number;
      stored: number;
      mode: string;
      provider: string;
      received: number;
    };

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      accepted: 1,
      stored: 1,
      mode: "native",
      provider: "clay",
      received: 1,
    });
    expect(ingestImladrisRawRecords).toHaveBeenCalledOnce();
    expect(ingestVisitorEnrichmentSignals).toHaveBeenCalledOnce();
    expect(
      vi.mocked(ingestImladrisRawRecords).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(ingestVisitorEnrichmentSignals).mock.invocationCallOrder[0],
    );

    const rawInput = vi.mocked(ingestImladrisRawRecords).mock.calls[0]?.[0];
    expect(rawInput).toMatchObject({
      provider: "UNIFY",
      context: {
        userId: null,
        organizationId: null,
      },
      mode: "incremental",
      checkpoint: {
        providerKey: "clay",
        deliveryMode: "push",
        signalCount: 1,
      },
    });
    expect(rawInput?.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          objectType: "snapshot",
          payload: expect.objectContaining({
            snapshotKey: "visitorFunnel",
            provider: "UNIFY",
            enrichmentProvider: "clay",
            deliveryMode: "push",
            signals: expect.any(Array),
          }),
        }),
        expect.objectContaining({
          objectType: "signal",
          externalId: "visitorFunnel:signal:clay-row-1",
          payload: expect.objectContaining({
            snapshotKey: "visitorFunnel",
            sourcePath: "signals",
            signalKey: "clay-row-1",
            enrichmentProvider: "clay",
          }),
        }),
      ]),
    );
  });

  it("marks authenticated push enrichment ingestion as a fresh integration sync", async () => {
    const { auth } = await import("@/lib/auth");
    const { normalizeNativeProviderSignals } = await import(
      "@/lib/analytics/provider-enrichment-adapters"
    );
    const { ingestVisitorEnrichmentSignals } = await import(
      "@/lib/analytics/visitor-funnel"
    );
    const { ingestImladrisRawRecords } = await import("@/lib/imladris/ingestion");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-push-1", role: "admin", organizationId: "org-1" },
    } as never);
    vi.mocked(normalizeNativeProviderSignals).mockReturnValue([
      {
        signalKey: "clay-row-1",
        email: "sample@example.com",
        domain: "example.com",
        companyName: "Example Co",
        confidence: 0.92,
        occurredAt: "2026-03-08T12:00:00.000Z",
        provenance: "exact",
        metadata: {},
      },
    ]);
    vi.mocked(ingestImladrisRawRecords).mockResolvedValue({
      syncRunId: "raw-run-1",
      status: "SUCCESS",
      recordCount: 2,
      acceptedCount: 2,
      errorCount: 0,
    });
    vi.mocked(ingestVisitorEnrichmentSignals).mockResolvedValue({
      accepted: 1,
      stored: 1,
    });
    mockIntegrationConnectionUpdateMany.mockResolvedValue({ count: 1 });

    const { POST } = await import("@/app/api/analytics/funnel/enrich/[provider]/route");
    const request = new NextRequest("http://localhost/api/analytics/funnel/enrich/clay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rows: [{ rowId: "clay-row-1", email: "sample@example.com" }],
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ provider: "clay" }),
    });
    const body = (await response.json()) as {
      accepted: number;
      stored: number;
    };

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      accepted: 1,
      stored: 1,
    });
    expect(mockIntegrationConnectionUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: "admin-push-1",
        provider: "UNIFY",
      },
      data: {
        status: "CONNECTED",
        lastSyncedAt: expect.any(Date),
        lastError: null,
      },
    });
    expect(
      vi.mocked(ingestVisitorEnrichmentSignals).mock.invocationCallOrder[0],
    ).toBeLessThan(mockIntegrationConnectionUpdateMany.mock.invocationCallOrder[0]);
  });

  it("creates a missing Unify connection row after authenticated push enrichment succeeds", async () => {
    const { auth } = await import("@/lib/auth");
    const { normalizeNativeProviderSignals } = await import(
      "@/lib/analytics/provider-enrichment-adapters"
    );
    const { ingestVisitorEnrichmentSignals } = await import(
      "@/lib/analytics/visitor-funnel"
    );
    const { ingestImladrisRawRecords } = await import("@/lib/imladris/ingestion");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-push-create", role: "admin", organizationId: "org-1" },
    } as never);
    vi.mocked(normalizeNativeProviderSignals).mockReturnValue([
      {
        signalKey: "clay-row-create",
        email: "sample-create@example.com",
        domain: "example.com",
        confidence: 0.93,
        occurredAt: "2026-03-08T12:00:00.000Z",
        provenance: "exact",
        metadata: {},
      },
    ]);
    vi.mocked(ingestImladrisRawRecords).mockResolvedValue({
      syncRunId: "raw-run-create",
      status: "SUCCESS",
      recordCount: 2,
      acceptedCount: 2,
      errorCount: 0,
    });
    vi.mocked(ingestVisitorEnrichmentSignals).mockResolvedValue({
      accepted: 1,
      stored: 1,
    });
    mockIntegrationConnectionUpdateMany.mockResolvedValue({ count: 0 });
    mockIntegrationConnectionUpsert.mockResolvedValue({});

    const { POST } = await import("@/app/api/analytics/funnel/enrich/[provider]/route");
    const request = new NextRequest("http://localhost/api/analytics/funnel/enrich/clay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rows: [{ rowId: "clay-row-create", email: "sample-create@example.com" }],
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ provider: "clay" }),
    });
    const body = (await response.json()) as {
      accepted: number;
      statusPersistenceErrors?: string[];
      stored: number;
    };

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      accepted: 1,
      stored: 1,
    });
    expect(body.statusPersistenceErrors).toBeUndefined();
    expect(mockIntegrationConnectionUpsert).toHaveBeenCalledWith({
      where: {
        userId_provider: {
          userId: "admin-push-create",
          provider: "UNIFY",
        },
      },
      update: {
        status: "CONNECTED",
        lastSyncedAt: expect.any(Date),
        lastError: null,
      },
      create: {
        userId: "admin-push-create",
        provider: "UNIFY",
        status: "CONNECTED",
        lastSyncedAt: expect.any(Date),
        lastError: null,
      },
    });
  });

  it("keeps successful push ingestion accepted when integration freshness persistence fails", async () => {
    const { auth } = await import("@/lib/auth");
    const { normalizeNativeProviderSignals } = await import(
      "@/lib/analytics/provider-enrichment-adapters"
    );
    const { ingestVisitorEnrichmentSignals } = await import(
      "@/lib/analytics/visitor-funnel"
    );
    const { ingestImladrisRawRecords } = await import("@/lib/imladris/ingestion");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-push-2", role: "admin", organizationId: "org-1" },
    } as never);
    vi.mocked(normalizeNativeProviderSignals).mockReturnValue([
      {
        signalKey: "clay-row-2",
        email: "sample-2@example.com",
        domain: "example.com",
        confidence: 0.88,
        occurredAt: "2026-03-08T12:05:00.000Z",
        provenance: "exact",
        metadata: {},
      },
    ]);
    vi.mocked(ingestImladrisRawRecords).mockResolvedValue({
      syncRunId: "raw-run-2",
      status: "SUCCESS",
      recordCount: 2,
      acceptedCount: 2,
      errorCount: 0,
    });
    vi.mocked(ingestVisitorEnrichmentSignals).mockResolvedValue({
      accepted: 1,
      stored: 1,
    });
    mockIntegrationConnectionUpdateMany.mockRejectedValue(
      new Error("connection status db unavailable"),
    );

    const { POST } = await import("@/app/api/analytics/funnel/enrich/[provider]/route");
    const request = new NextRequest("http://localhost/api/analytics/funnel/enrich/clay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rows: [{ rowId: "clay-row-2", email: "sample-2@example.com" }],
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ provider: "clay" }),
    });
    const body = (await response.json()) as {
      accepted: number;
      stored: number;
      statusPersistenceErrors?: string[];
    };

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      accepted: 1,
      stored: 1,
      statusPersistenceErrors: [
        "Integration connection freshness persistence failed: connection status db unavailable",
      ],
    });
    expect(ingestVisitorEnrichmentSignals).toHaveBeenCalledOnce();
  });

  it("rejects raw ingestion failures without storing visitor signals", async () => {
    const { auth } = await import("@/lib/auth");
    const { ingestVisitorEnrichmentSignals } = await import(
      "@/lib/analytics/visitor-funnel"
    );
    const { ingestImladrisRawRecords } = await import("@/lib/imladris/ingestion");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-raw-1", role: "admin", organizationId: "org-1" },
    } as never);
    vi.mocked(ingestImladrisRawRecords).mockResolvedValue({
      syncRunId: "raw-run-partial",
      status: "PARTIAL",
      recordCount: 2,
      acceptedCount: 1,
      errorCount: 1,
    });
    vi.mocked(ingestVisitorEnrichmentSignals).mockResolvedValue({
      accepted: 1,
      stored: 1,
    });

    const { POST } = await import("@/app/api/analytics/funnel/enrich/[provider]/route");
    const request = new NextRequest("http://localhost/api/analytics/funnel/enrich/rb2b", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        signals: [
          {
            signalKey: "rb2b-row-1",
            domain: "example.com",
            confidence: 0.91,
            occurredAt: "2026-03-08T12:00:00.000Z",
          },
        ],
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ provider: "rb2b" }),
    });
    const body = (await response.json()) as {
      error: string;
      rawAccepted: number;
      rawRecordCount: number;
    };

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      error: "Imladris raw ingestion partially succeeded for rb2b; enrichment signals were not stored.",
      rawAccepted: 1,
      rawRecordCount: 2,
    });
    expect(ingestImladrisRawRecords).toHaveBeenCalledOnce();
    expect(ingestVisitorEnrichmentSignals).not.toHaveBeenCalled();
    expect(mockIntegrationConnectionUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: "admin-raw-1",
        provider: "UNIFY",
      },
      data: {
        status: "ERROR",
        lastSyncedAt: null,
        lastError:
          "Imladris raw ingestion partially succeeded for rb2b; enrichment signals were not stored.",
      },
    });
  });

  it("creates a missing Unify connection row when raw enrichment ingestion fails", async () => {
    const { auth } = await import("@/lib/auth");
    const { ingestVisitorEnrichmentSignals } = await import(
      "@/lib/analytics/visitor-funnel"
    );
    const { ingestImladrisRawRecords } = await import("@/lib/imladris/ingestion");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-raw-create", role: "admin", organizationId: "org-1" },
    } as never);
    vi.mocked(ingestImladrisRawRecords).mockResolvedValue({
      syncRunId: "raw-run-error-create",
      status: "ERROR",
      recordCount: 2,
      acceptedCount: 0,
      errorCount: 2,
    });
    mockIntegrationConnectionUpdateMany.mockResolvedValue({ count: 0 });
    mockIntegrationConnectionUpsert.mockResolvedValue({});

    const { POST } = await import("@/app/api/analytics/funnel/enrich/[provider]/route");
    const request = new NextRequest("http://localhost/api/analytics/funnel/enrich/rb2b", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        signals: [
          {
            signalKey: "rb2b-row-create",
            domain: "example.com",
            confidence: 0.91,
            occurredAt: "2026-03-08T12:00:00.000Z",
          },
        ],
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ provider: "rb2b" }),
    });
    const body = (await response.json()) as {
      error: string;
      statusPersistenceErrors?: string[];
    };

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      error: "Imladris raw ingestion failed for rb2b; enrichment signals were not stored.",
    });
    expect(body.statusPersistenceErrors).toBeUndefined();
    expect(ingestVisitorEnrichmentSignals).not.toHaveBeenCalled();
    expect(mockIntegrationConnectionUpsert).toHaveBeenCalledWith({
      where: {
        userId_provider: {
          userId: "admin-raw-create",
          provider: "UNIFY",
        },
      },
      update: {
        status: "ERROR",
        lastSyncedAt: null,
        lastError:
          "Imladris raw ingestion failed for rb2b; enrichment signals were not stored.",
      },
      create: {
        userId: "admin-raw-create",
        provider: "UNIFY",
        status: "ERROR",
        lastSyncedAt: null,
        lastError:
          "Imladris raw ingestion failed for rb2b; enrichment signals were not stored.",
      },
    });
  });

  afterAll(() => {
    if (originalSharedSecret == null) {
      delete process.env.VISITOR_FUNNEL_ENRICH_SECRET;
      return;
    }
    process.env.VISITOR_FUNNEL_ENRICH_SECRET = originalSharedSecret;
  });
});
