import { describe, expect, it } from "vitest";

describe("GET /api/standup", () => {
  it("returns 410 because standup is retired", async () => {
    const { GET } = await import("@/app/api/standup/route");
    const response = await GET();
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(410);
    expect(payload.error).toBe("Standup has been retired with the Work section.");
  });
});
