import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  makePortfolio,
} from "@/components/analytics/__tests__/customer-success-test-helpers";
import { CustomerSuccessPortfolioPanels } from "@/components/analytics/customer-success-portfolio-panels";

describe("CustomerSuccessPortfolioPanels", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows a loading state before the portfolio resolves", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise(() => {
            // Keep the promise pending to hold the initial loading state.
          })
      )
    );

    const { container } = render(<CustomerSuccessPortfolioPanels />);

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.queryByText("Portfolio Accounts")).toBeNull();
  });

  it("shows an error banner when the portfolio request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: "Portfolio exploded" }),
      }))
    );

    render(<CustomerSuccessPortfolioPanels />);

    await waitFor(() => {
      expect(screen.getByText("Portfolio exploded")).toBeTruthy();
    });
  });

  it("renders the portfolio panels when the request succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => makePortfolio(),
      }))
    );

    render(<CustomerSuccessPortfolioPanels />);

    await waitFor(() => {
      expect(screen.getByText("Portfolio Accounts")).toBeTruthy();
    });

    expect(screen.getByText("Accounts With Coda")).toBeTruthy();
    expect(screen.getAllByText("At Risk").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Missing pylon/).length).toBeGreaterThan(0);
    expect(screen.getByText("Leading Indicator Pressure")).toBeTruthy();
    expect(screen.getByText("Health Distribution")).toBeTruthy();
    expect(screen.getByText("Attention Queue")).toBeTruthy();
    expect(screen.getByText("Renewal risk rising")).toBeTruthy();
    expect(screen.getByText("Recent Activity")).toBeTruthy();
    expect(screen.getByText("Primary Signal")).toBeTruthy();
  });
});
