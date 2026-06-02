import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import IntegrationsPage from "@/app/(dashboard)/integrations/page";
import { SOURCES_HOME } from "@/lib/platform/routes";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  }),
}));

describe("API meeting-place compatibility routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects /integrations to /sources", async () => {
    const { redirect } = await import("next/navigation");

    expect(() => IntegrationsPage()).toThrow(`NEXT_REDIRECT:${SOURCES_HOME}`);
    expect(redirect).toHaveBeenCalledWith(SOURCES_HOME);
  });

  it("removes legacy analytics and deal page surfaces", () => {
    expect(existsSync(join(process.cwd(), "src/app/(dashboard)/analytics/page.tsx"))).toBe(false);
    expect(existsSync(join(process.cwd(), "src/app/(dashboard)/deals/page.tsx"))).toBe(false);
    expect(existsSync(join(process.cwd(), "src/app/(dashboard)/deals/analytics/page.tsx"))).toBe(false);
  });
});
