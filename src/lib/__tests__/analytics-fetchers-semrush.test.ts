import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSemrushData } from "@/lib/analytics/fetchers-semrush";

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain" } });
}

describe("analytics semrush fetcher", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the provided domain across SEMrush requests", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("type=domain_ranks")) {
        return textResponse("Ot;Oc;Ad;At;Ac;Or\n1000;120;15;200;30;350\n");
      }
      if (url.includes("type=backlinks_overview")) {
        return textResponse("ascore;total\n48;1234\n");
      }
      if (url.includes("type=domain_organic_organic")) {
        return textResponse("Dn;Np;Or;Ot\ncompetitor.com;20;100;50\n");
      }
      if (url.includes("type=domain_organic")) {
        return textResponse("Ph;Po;Nq;Cp;Tr;Ur\nworkflow app;2;1200;3.4;15.2;/blog/workflow\n");
      }

      return textResponse("unexpected request", 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchSemrushData("semrush-token", "https://Example.com/path");

    expect(data.domain).toBe("example.com");
    expect(data.organicTraffic).toBe(1000);
    expect(data.paidTraffic).toBe(200);
    expect(data.authorityScore).toBe(48);
    expect(data.topKeywords[0]?.keyword).toBe("workflow app");

    const requestUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(requestUrls.some((url) => url.includes("domain=example.com"))).toBe(true);
    expect(requestUrls.some((url) => url.includes("target=example.com"))).toBe(true);
  });

  it("throws deterministically for missing or invalid domains", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await expect(fetchSemrushData("semrush-token", "invalid-domain")).rejects.toThrow(
      "SEMrush domain must be a valid root domain (for example: example.com)."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
