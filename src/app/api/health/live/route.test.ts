import { describe, expect, it } from "vitest";
import packageJson from "../../../../../package.json";

describe("GET /api/health/live", () => {
  it("returns liveness data without checking dependencies", async () => {
    const { GET } = await import("@/app/api/health/live/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      version: packageJson.version,
    });
    expect(typeof body.timestamp).toBe("string");
  });
});
