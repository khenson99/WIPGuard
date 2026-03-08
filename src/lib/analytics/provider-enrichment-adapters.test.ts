import { describe, expect, it, vi } from "vitest";
import {
  isUnifyPullRequest,
  normalizeNativeProviderSignals,
  pullUnifySignalsFromApi,
} from "@/lib/analytics/provider-enrichment-adapters";

describe("normalizeNativeProviderSignals", () => {
  it("normalizes RB2B webhook payloads", () => {
    const signals = normalizeNativeProviderSignals("rb2b", {
      "Business Email": "Prospect@Example.com",
      "First Name": "Ada",
      "Last Name": "Lovelace",
      "Company Name": "Example Co",
      Website: "https://example.com",
      "Captured URL": "https://wipguard.ai/pricing",
      Referrer: "https://www.reddit.com/r/startups",
      "Seen At": "2026-03-08T12:00:00.000Z",
      is_repeat_visit: true,
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      email: "prospect@example.com",
      fullName: "Ada Lovelace",
      companyName: "Example Co",
      domain: "example.com",
      confidence: 0.95,
      provenance: "inferred",
      occurredAt: "2026-03-08T12:00:00.000Z",
    });
    expect(signals[0]?.metadata).toMatchObject({
      referrer: "https://www.reddit.com/r/startups",
      capturedUrl: "https://wipguard.ai/pricing",
      isRepeatVisit: true,
    });
  });

  it("normalizes Clay HTTP API payloads with flexible aliases", () => {
    const signals = normalizeNativeProviderSignals("clay", {
      rows: [
        {
          rowId: "row-123",
          workEmail: "sales@example.com",
          companyDomain: "example.com",
          fullName: "Grace Hopper",
          companyName: "Example",
          confidence: 87,
          capturedUrl: "https://wipguard.ai/demo",
          referrerUrl: "https://www.reddit.com/r/revops",
          occurredAt: "2026-03-07T18:25:00.000Z",
        },
      ],
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      signalKey: "row-123",
      email: "sales@example.com",
      domain: "example.com",
      fullName: "Grace Hopper",
      companyName: "Example",
      confidence: 0.87,
      occurredAt: "2026-03-07T18:25:00.000Z",
    });
    expect(signals[0]?.metadata).toMatchObject({
      capturedUrl: "https://wipguard.ai/demo",
      referrer: "https://www.reddit.com/r/revops",
    });
  });

  it("normalizes Unify Data API records", () => {
    const signals = normalizeNativeProviderSignals("unify", {
      data: [
        {
          id: "rec_123",
          object: "website_visitors",
          created_at: "2026-03-06T10:00:00.000Z",
          updated_at: "2026-03-08T10:00:00.000Z",
          attributes: {
            anonymous_id: "anon-42",
            email: "founder@example.com",
            first_name: "Linus",
            last_name: "Torvalds",
            company_name: "Example Labs",
            website: "https://example.com",
            confidence_score: 0.91,
            seen_at: "2026-03-08T09:55:00.000Z",
          },
        },
      ],
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      signalKey: "rec_123",
      anonymousId: "anon-42",
      email: "founder@example.com",
      fullName: "Linus Torvalds",
      companyName: "Example Labs",
      domain: "example.com",
      confidence: 0.91,
      provenance: "exact",
      occurredAt: "2026-03-08T09:55:00.000Z",
    });
  });
});

describe("Unify pull helpers", () => {
  it("detects pull-mode requests", () => {
    expect(isUnifyPullRequest({ mode: "pull" })).toBe(true);
    expect(isUnifyPullRequest({ mode: "native" })).toBe(false);
  });

  it("pulls and filters Unify records from the Data API", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "old",
            updated_at: "2026-03-01T00:00:00.000Z",
            attributes: {
              email: "old@example.com",
              website: "https://old.example.com",
            },
          },
          {
            id: "new",
            updated_at: "2026-03-08T00:00:00.000Z",
            attributes: {
              email: "new@example.com",
              website: "https://new.example.com",
              seen_at: "2026-03-08T00:00:00.000Z",
            },
          },
        ],
      }),
    });

    const signals = await pullUnifySignalsFromApi({
      apiKey: "unify-key",
      objectName: "website_visitors",
      updatedAfter: "2026-03-05T00:00:00.000Z",
      maxRecords: 1,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(signals).toHaveLength(1);
    expect(signals[0]?.signalKey).toBe("new");
    expect(signals[0]?.email).toBe("new@example.com");
  });
});
