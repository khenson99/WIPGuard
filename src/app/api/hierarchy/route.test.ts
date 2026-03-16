import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

describe("GET /api/hierarchy", () => {
  it("returns 410 because hierarchy data was retired with the Work section", async () => {
    const { GET } = await import("@/app/api/hierarchy/route");

    const response = await GET(new NextRequest("http://localhost/api/hierarchy"));
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body).toEqual({
      error: "The hierarchy endpoint has been retired with the Work section.",
    });
  });
});
