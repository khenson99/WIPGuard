import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeAnalyticsData,
  makePortfolio,
} from "@/components/analytics/__tests__/customer-success-test-helpers";
import { CustomerSuccessTab } from "@/components/analytics/customer-success-tab";

describe("CustomerSuccessTab", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders the customer-success portfolio and integration-led recommendations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/customer-success/portfolio") {
          return {
            ok: true,
            status: 200,
            json: async () => makePortfolio(),
          } as Response;
        }

        throw new Error(`Unexpected fetch: ${String(input)}`);
      })
    );

    render(<CustomerSuccessTab data={makeAnalyticsData()} />);

    await waitFor(() => {
      expect(screen.getByText("Portfolio Accounts")).toBeTruthy();
    });

    expect(screen.getAllByText("Acme Co").length).toBeGreaterThan(0);
    expect(screen.getByText("Renewal risk rising")).toBeTruthy();
    expect(screen.getByText("QBR completed")).toBeTruthy();
    expect(screen.getByText("Integration Delivery Status")).toBeTruthy();
    expect(screen.getByText("Accounts With Coda")).toBeTruthy();
    expect(screen.getAllByText("At Risk").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Missing pylon/).length).toBeGreaterThan(0);
    expect(screen.getByText("Connected but stale")).toBeTruthy();
    expect(screen.getByText("Leading Indicator Pressure")).toBeTruthy();
    expect(screen.getByText("Accounts with indicator scores below 65 across the portfolio.")).toBeTruthy();
    expect(screen.getAllByText("account below threshold")).toHaveLength(5);
    expect(screen.getByText("Primary Signal")).toBeTruthy();
    expect(screen.getAllByText("Activity recency").length).toBeGreaterThan(0);
    expect(screen.getAllByText("7d since touch").length).toBeGreaterThan(0);
    expect(screen.getByText("Rebalance urgent queue ownership")).toBeTruthy();
    expect(screen.getByText("Throttle backlog inflow")).toBeTruthy();
    expect(screen.getByText("Review overdue task assignments")).toBeTruthy();

    const table = screen.getByRole("table");
    const dataRows = within(table).getAllByRole("row").slice(1);
    expect(dataRows[0]?.textContent).toContain("Acme Co");

    fireEvent.change(screen.getByLabelText("Sort portfolio accounts"), {
      target: { value: "alerts" },
    });

    const alertSortedRows = within(table).getAllByRole("row").slice(1);
    expect(alertSortedRows[0]?.textContent).toContain("Beacon Ltd");

    fireEvent.click(screen.getByLabelText("Only risky signals"));

    await waitFor(() => {
      expect(screen.getByText("Showing 1 account with weakest leading indicator below 65.")).toBeTruthy();
    });

    const filteredRows = within(table).getAllByRole("row").slice(1);
    expect(filteredRows).toHaveLength(1);
    expect(filteredRows[0]?.textContent).toContain("Acme Co");

    fireEvent.click(screen.getByRole("button", { name: /Activity recency/i }));

    await waitFor(() => {
      expect(screen.getByText("Indicator filter: Activity recency.")).toBeTruthy();
    });

    const indicatorFilteredRows = within(table).getAllByRole("row").slice(1);
    expect(indicatorFilteredRows).toHaveLength(1);
    expect(indicatorFilteredRows[0]?.textContent).toContain("Acme Co");

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    await waitFor(() => {
      expect(screen.queryByText("Indicator filter: Activity recency.")).toBeNull();
    });

    expect((screen.getByLabelText("Sort portfolio accounts") as HTMLSelectElement).value).toBe("primary-signal");
    expect((screen.getByLabelText("Only risky signals") as HTMLInputElement).checked).toBe(false);
    expect(window.sessionStorage.getItem("customer-success:portfolio:sort")).toBe("primary-signal");
    expect(window.sessionStorage.getItem("customer-success:portfolio:weak-signal-only")).toBe("false");
    expect(window.sessionStorage.getItem("customer-success:portfolio:indicator-filter")).toBeNull();

    const resetRows = within(table).getAllByRole("row").slice(1);
    expect(resetRows).toHaveLength(2);
    expect(resetRows[0]?.textContent).toContain("Acme Co");
  });

  it("shows the portfolio-only fallback when integration analytics are unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => makePortfolio(),
      }))
    );

    render(<CustomerSuccessTab data={null} />);

    await waitFor(() => {
      expect(screen.getByText("Customer Records")).toBeTruthy();
    });

    expect(
      screen.getByText(
        "Portfolio data is available, but customer-success integration analytics are not configured for the selected range."
      )
    ).toBeTruthy();
    expect(screen.getAllByText("Not provisioned").length).toBeGreaterThan(0);
  });

  it("persists portfolio sort and weak-signal filter in session storage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => makePortfolio(),
      }))
    );

    const view = render(<CustomerSuccessTab data={makeAnalyticsData()} />);

    await waitFor(() => {
      expect(screen.getByText("Portfolio Accounts")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("Sort portfolio accounts"), {
      target: { value: "alerts" },
    });
    fireEvent.click(screen.getByLabelText("Only risky signals"));
    fireEvent.click(screen.getByRole("button", { name: /Activity recency/i }));

    expect(window.sessionStorage.getItem("customer-success:portfolio:sort")).toBe("alerts");
    expect(window.sessionStorage.getItem("customer-success:portfolio:weak-signal-only")).toBe("true");
    expect(window.sessionStorage.getItem("customer-success:portfolio:indicator-filter")).toBe("recency");

    view.unmount();
    render(<CustomerSuccessTab data={makeAnalyticsData()} />);

    await waitFor(() => {
      expect(screen.getByText("Showing 1 account with weakest leading indicator below 65.")).toBeTruthy();
    });

    expect((screen.getByLabelText("Sort portfolio accounts") as HTMLSelectElement).value).toBe("alerts");
    expect((screen.getByLabelText("Only risky signals") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("Indicator filter: Activity recency.")).toBeTruthy();
  });
});
