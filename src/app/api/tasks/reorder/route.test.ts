import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

describe("PATCH /api/tasks/reorder", () => {
  it("returns 410 because task reordering is retired", async () => {
    const { PATCH } = await import("@/app/api/tasks/reorder/route");
    const response = await PATCH(
      new NextRequest("http://localhost/api/tasks/reorder", {
        method: "PATCH",
      })
    );
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(410);
    expect(payload.error).toBe("Tasks have been retired with the Work section.");
  });
});
