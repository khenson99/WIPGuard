import { vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("versioned integration routes", () => {
  it("exports funnel enrichment handler", async () => {
    const mod = await import("@/app/api/v1/analytics/funnel/enrich/[provider]/route");
    expect(typeof mod.POST).toBe("function");
  });

  it("exports Slack events handler", async () => {
    const mod = await import("@/app/api/v1/integrations/slack/events/route");
    expect(typeof mod.POST).toBe("function");
  });
});
