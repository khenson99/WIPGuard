import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
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
  hasVisitorFunnelPrismaModels: vi.fn(() => true),
  VISITOR_FUNNEL_PRISMA_UNAVAILABLE_REASON:
    "Visitor funnel Prisma models are unavailable in this deployment.",
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
    const { hasVisitorFunnelPrismaModels } = await import(
      "@/lib/analytics/visitor-funnel-availability"
    );

    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-3", role: "admin" },
    } as never);
    vi.mocked(hasVisitorFunnelPrismaModels).mockReturnValue(false);
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
    };

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      accepted: 0,
      disabled: true,
      reason: "Visitor funnel Prisma models are unavailable in this deployment.",
      stored: 0,
    });
    expect(ingestVisitorEnrichmentSignals).not.toHaveBeenCalled();
  });

  afterAll(() => {
    if (originalSharedSecret == null) {
      delete process.env.VISITOR_FUNNEL_ENRICH_SECRET;
      return;
    }
    process.env.VISITOR_FUNNEL_ENRICH_SECRET = originalSharedSecret;
  });
});
