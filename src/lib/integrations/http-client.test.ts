import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithResilience } from "@/lib/integrations/http-client";

describe("integration http client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("bypasses fetch cache for integration HTTP requests by default", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await fetchWithResilience({
      url: "https://api.example.com/v1/resources",
      init: {
        headers: { Authorization: "Bearer token" },
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/v1/resources",
      expect.objectContaining({
        cache: "no-store",
        headers: { Authorization: "Bearer token" },
      }),
    );
  });
});
