import { describe, expect, it, vi } from "vitest";

import {
  WEBFLOW_CTA_BACKFILL_VERSION,
  buildWebflowCtaBackfillEvents,
  sendPostHogBatch,
  summarizeWebflowCtaBackfill,
} from "@/lib/analytics/webflow-cta-backfill";

describe("webflow CTA PostHog backfill", () => {
  it("builds a deterministic synthetic event set from the Webflow aggregates", () => {
    const first = buildWebflowCtaBackfillEvents({ runId: "run-1" });
    const second = buildWebflowCtaBackfillEvents({ runId: "run-2" });
    const summary = summarizeWebflowCtaBackfill();

    expect(summary.totalEvents).toBe(843);
    expect(summary.dateRange).toEqual({ from: "2026-03-19", to: "2026-06-26" });
    expect(first).toHaveLength(843);
    expect(first.map((event) => event.properties.$insert_id)).toEqual(
      second.map((event) => event.properties.$insert_id),
    );
    expect(first[0]).toMatchObject({
      event: "marketing_cta_clicked",
      properties: {
        $source: "webflow_backfill",
        $host: "www.arda.cards",
        imladris_backfill_version: WEBFLOW_CTA_BACKFILL_VERSION,
        synthetic: true,
      },
    });
  });

  it("sends the project key only in the PostHog batch body", async () => {
    const originalFetch = global.fetch;
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const [event] = buildWebflowCtaBackfillEvents({ runId: "run-1" });
      const status = await sendPostHogBatch({
        host: "https://posthog.test/",
        projectApiKey: "phc_test",
        batch: [event],
      });
      const [url, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

      expect(status).toBe(200);
      expect(String(url)).toBe("https://posthog.test/batch/");
      expect(init?.headers).toEqual({ "Content-Type": "application/json" });
      expect(body.api_key).toBe("phc_test");
      expect(JSON.stringify(body.batch)).not.toContain("phc_test");
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });
});
