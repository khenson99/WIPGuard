import { describe, expect, it, vi } from "vitest";
import LegacyCompanyTrackerRedirect from "./page";

const redirectMock = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

describe("/metrics/company", () => {
  it("redirects the legacy route to the founder cockpit", async () => {
    await expect(
      LegacyCompanyTrackerRedirect({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_REDIRECT:/operating/company");
    expect(redirectMock).toHaveBeenCalledWith("/operating/company");
  });

  it("forwards the query string so ?demo opt-in survives", async () => {
    redirectMock.mockClear();
    await expect(
      LegacyCompanyTrackerRedirect({ searchParams: Promise.resolve({ demo: "" }) }),
    ).rejects.toThrow("NEXT_REDIRECT:/operating/company?demo=");
    expect(redirectMock).toHaveBeenCalledWith("/operating/company?demo=");
  });
});
