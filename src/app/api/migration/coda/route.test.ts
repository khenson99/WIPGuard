import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

describe("Coda migration route retirement", () => {
  it("returns 410 for retired Coda task migration reads and writes", async () => {
    const { GET, POST } = await import("@/app/api/migration/coda/route");

    const getResponse = await GET(new NextRequest("http://localhost/api/migration/coda"));
    const postResponse = await POST(
      new NextRequest("http://localhost/api/migration/coda", {
        method: "POST",
        body: JSON.stringify({ action: "migrate", rows: [] }),
        headers: { "content-type": "application/json" },
      })
    );

    expect(getResponse.status).toBe(410);
    expect(postResponse.status).toBe(410);

    await expect(getResponse.json()).resolves.toEqual({
      error: "Coda task migration has been retired with the Work section.",
    });
    await expect(postResponse.json()).resolves.toEqual({
      error: "Coda task migration has been retired with the Work section.",
    });
  });
});
