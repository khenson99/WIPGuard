import { beforeEach, describe, expect, it, vi } from "vitest";
import AnalyticsPage from "@/app/(dashboard)/analytics/page";
import IntegrationsPage from "@/app/(dashboard)/integrations/page";
import DealsPage from "@/app/(dashboard)/deals/page";
import DealsAnalyticsPage from "@/app/(dashboard)/deals/analytics/page";
import { METRICS_HOME, SOURCES_HOME } from "@/lib/platform/routes";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  }),
}));

describe("API meeting-place compatibility routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects /analytics to /metrics", async () => {
    const { redirect } = await import("next/navigation");

    expect(() => AnalyticsPage()).toThrow(`NEXT_REDIRECT:${METRICS_HOME}`);
    expect(redirect).toHaveBeenCalledWith(METRICS_HOME);
  });

  it("redirects /integrations to /sources", async () => {
    const { redirect } = await import("next/navigation");

    expect(() => IntegrationsPage()).toThrow(`NEXT_REDIRECT:${SOURCES_HOME}`);
    expect(redirect).toHaveBeenCalledWith(SOURCES_HOME);
  });

  it("redirects deal surfaces to source or metric context", async () => {
    const { redirect } = await import("next/navigation");

    expect(() => DealsPage()).toThrow(`NEXT_REDIRECT:${SOURCES_HOME}`);
    expect(() => DealsAnalyticsPage()).toThrow(`NEXT_REDIRECT:${METRICS_HOME}`);
    expect(redirect).toHaveBeenCalledWith(SOURCES_HOME);
    expect(redirect).toHaveBeenCalledWith(METRICS_HOME);
  });
});
