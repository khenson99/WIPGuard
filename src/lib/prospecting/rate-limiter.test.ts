import { afterEach, describe, expect, it, vi } from "vitest";
import { throttledFetch } from "@/lib/prospecting/rate-limiter";

describe("throttledFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bypasses fetch cache for prospecting enrichment requests", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await throttledFetch("https://manufacturer.example/about", {
      headers: {
        Accept: "text/html",
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://manufacturer.example/about",
      expect.objectContaining({
        cache: "no-store",
        headers: expect.objectContaining({
          Accept: "text/html",
          "User-Agent": "The-Mother-Node-Prospecting/1.0 (+https://the-mother-node.com)",
        }),
      }),
    );
  });
});
