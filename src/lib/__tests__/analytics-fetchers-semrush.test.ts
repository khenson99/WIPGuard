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

  it("bypasses fetch cache so scheduled SEMrush syncs pull fresh provider data", async () => {
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

    await fetchSemrushData("semrush-token", "example.com");

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const calls = fetchMock.mock.calls as unknown as Array<[
      RequestInfo | URL,
      RequestInit | undefined,
    ]>;
    for (const [, init] of calls) {
      expect(init).toEqual(expect.objectContaining({
        cache: "no-store",
      }));
      expect(init).not.toEqual(expect.objectContaining({
        next: expect.anything(),
      }));
    }
  });

  it("throws deterministically for missing or invalid domains", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await expect(fetchSemrushData("semrush-token", "invalid-domain")).rejects.toThrow(
      "SEMrush domain must be a valid root domain (for example: example.com)."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses quoted SEMrush export fields containing semicolons", async () => {
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
        return textResponse(
          'Ph;Po;Nq;Cp;Tr;Ur\n"workflow; automation";2;1200;3.4;15.2;"https://example.com/blog;utm=semrush"\n'
        );
      }

      return textResponse("unexpected request", 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchSemrushData("semrush-token", "example.com");

    expect(data.topKeywords[0]).toEqual(expect.objectContaining({
      keyword: "workflow; automation",
      position: 2,
      volume: 1200,
      cpc: 3.4,
      traffic: 15.2,
      url: "https://example.com/blog;utm=semrush",
    }));
  });

  it("preserves SEMrush metrics when numeric export fields include currency or percent formatting", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("type=domain_ranks")) {
        return textResponse(
          'Ot;Oc;Ad;At;Ac;Or\n"1,234";"$5,678.90";15;"2,345";"$67.89";"3,500"\n'
        );
      }
      if (url.includes("type=backlinks_overview")) {
        return textResponse('ascore;total\n"48.5%";"1,234,567"\n');
      }
      if (url.includes("type=domain_organic_organic")) {
        return textResponse('Dn;Np;Or;Ot\ncompetitor.com;"1,200";"2,500";"45,678"\n');
      }
      if (url.includes("type=domain_organic")) {
        return textResponse(
          'Ph;Po;Nq;Cp;Tr;Ur\nworkflow app;"2";"12,000";"$3.40";"15.2%";/blog/workflow\n'
        );
      }

      return textResponse("unexpected request", 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchSemrushData("semrush-token", "example.com");

    expect(data.organicKeywords).toBe(3500);
    expect(data.organicTraffic).toBe(1234);
    expect(data.organicTrafficCost).toBe(5678.9);
    expect(data.paidTraffic).toBe(2345);
    expect(data.paidTrafficCost).toBe(67.89);
    expect(data.authorityScore).toBe(48.5);
    expect(data.backlinks).toBe(1_234_567);
    expect(data.topKeywords[0]).toEqual(expect.objectContaining({
      position: 2,
      volume: 12_000,
      cpc: 3.4,
      traffic: 15.2,
    }));
    expect(data.organicCompetitors[0]).toEqual(expect.objectContaining({
      commonKeywords: 1200,
      organicKeywords: 2500,
      organicTraffic: 45_678,
    }));
  });

  it("marks SEMrush payloads truncated when keyword fetches exceed the retained slice", async () => {
    const keywordRows = Array.from({ length: 1001 }, (_, index) =>
      `keyword ${index + 1};${index + 1};100;1.25;${1000 - index};https://example.com/${index + 1}`
    ).join("\n");
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
        return textResponse(`Ph;Po;Nq;Cp;Tr;Ur\n${keywordRows}\n`);
      }

      return textResponse("unexpected request", 500);
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchSemrushData("semrush-token", "example.com");
    const keywordRequest = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .find((url) => url.searchParams.get("type") === "domain_organic");

    expect(keywordRequest?.searchParams.get("display_limit")).toBe("1001");
    expect(data.topKeywords).toHaveLength(1000);
    expect(data.topKeywords.at(-1)?.keyword).toBe("keyword 1000");
    expect(data._meta).toEqual(expect.objectContaining({
      truncated: true,
      truncatedResources: ["topKeywords"],
    }));
  });
});
