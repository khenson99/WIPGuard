import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpenseDashboard } from "./expense-dashboard";
import type { ExpenseDashboardData } from "@/lib/imladris/expense-dashboard";

vi.mock("chart.js/auto", () => ({
  default: class Chart {
    static getChart() {
      return undefined;
    }

    destroy() {}
  },
}));

const DATA: ExpenseDashboardData = {
  months: ["2026-03"],
  categories: ["cloud", "payroll", "travel"],
  categoryMonthly: {
    cloud: { "2026-03": 1200 },
    payroll: { "2026-03": 6300 },
    travel: { "2026-03": 43.6 },
  },
  categoryTotals: {
    cloud: 1200,
    payroll: 6300,
    travel: 43.6,
  },
  vendorMonthly: {
    "Amazon Web Services": { "2026-03": 1200 },
    "Elisha Eisen": { "2026-03": 6300 },
    "Kyle Henson": { "2026-03": 43.6 },
  },
  vendorTotals: {
    "Amazon Web Services": 1200,
    "Elisha Eisen": 6300,
    "Kyle Henson": 43.6,
  },
  vendorCategory: {
    "Amazon Web Services": "cloud",
    "Elisha Eisen": "payroll",
    "Kyle Henson": "travel",
  },
  txnIndex: {
    "cloud|2026-03": [
      {
        date: "2026-03-04",
        vendor: "Amazon Web Services",
        amount: 1200,
        description: "AWS hosting invoice",
        category: "cloud",
      },
    ],
    "payroll|2026-03": [
      {
        date: "2026-03-02",
        vendor: "Elisha Eisen",
        amount: 6300,
        description: "",
        category: "payroll",
      },
    ],
    "travel|2026-03": [
      {
        date: "2026-03-03",
        vendor: "Kyle Henson",
        amount: 43.6,
        description: "Reimbursement for expense at Lyft",
        category: "travel",
      },
    ],
  },
  chartSeries: {
    operatingInflows: [5000],
    operatingOutflows: [7543.6],
    grossBurn: [7543.6],
    netBurn: [2543.6],
    runwayCash: 100000,
  },
  refreshedAt: "2026-06-03T12:00:00.000Z",
};

describe("ExpenseDashboard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the imported financial dashboard shell and six internal tabs", () => {
    render(<ExpenseDashboard initialData={DATA} />);

    expect(screen.getByRole("heading", { name: "Arda Financial Dashboard" })).toBeTruthy();
    expect(screen.getByText(/Mercury Data \(Cash Basis\)/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh data" })).toBeTruthy();
    expect(screen.getByText("Board Burn Context")).toBeTruthy();
    expect(screen.getByText("Primary burn driver")).toBeTruthy();
    expect(screen.getByText("Payroll")).toBeTruthy();
    expect(screen.getByText("Vendor concentration")).toBeTruthy();
    ["Overview", "Category x Month", "Categories", "Vendors", "Runway", "Recommendations"].forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    });
    expect(screen.getByText("Monthly Operating Cash Flows")).toBeTruthy();
    expect(screen.getByText("Spend by Category (6 Months)")).toBeTruthy();
  });

  it("switches tabs and expands category drilldowns", async () => {
    const user = userEvent.setup();
    render(<ExpenseDashboard initialData={DATA} />);

    await user.click(screen.getByRole("button", { name: "Categories" }));
    expect(screen.getByText("All Categories")).toBeTruthy();

    const cloudRow = screen.getByRole("button", { name: /cloud/i });
    await user.click(cloudRow);

    expect(screen.getByText("cloud - Vendors (1)")).toBeTruthy();
    expect(screen.getByText("Amazon Web Services")).toBeTruthy();
  });

  it("shows vendor transaction drilldowns", async () => {
    const user = userEvent.setup();
    render(<ExpenseDashboard initialData={DATA} />);

    await user.click(screen.getByRole("button", { name: "Vendors" }));
    const vendorsView = screen.getByTestId("expense-view-vendors");
    await user.click(within(vendorsView).getByRole("button", { name: /Amazon Web Services/i }));

    expect(screen.getByText("Amazon Web Services - 1 transactions ($1,200)")).toBeTruthy();
    expect(screen.getByText("AWS hosting invoice")).toBeTruthy();
  });

  it("renders provider-shaped numeric envelopes without losing currency values", async () => {
    const user = userEvent.setup();
    const wrappedData: ExpenseDashboardData = {
      ...DATA,
      categoryMonthly: {
        cloud: { "2026-03": { data: { attributes: { value: "$1,200.50" } } } as never },
        payroll: { "2026-03": { metricValue: "6300" } as never },
        travel: { "2026-03": { amount: "43.60" } as never },
      },
      categoryTotals: {
        cloud: { data: { attributes: { value: "$1,200.50" } } } as never,
        payroll: { metricValue: "6300" } as never,
        travel: { amount: "43.60" } as never,
      },
      vendorMonthly: {
        "Amazon Web Services": { "2026-03": { data: { value: "$1,200.50" } } as never },
        "Elisha Eisen": { "2026-03": { metric_value: "6300" } as never },
        "Kyle Henson": { "2026-03": { amount: "43.60" } as never },
      },
      vendorTotals: {
        "Amazon Web Services": { data: { value: "$1,200.50" } } as never,
        "Elisha Eisen": { metric_value: "6300" } as never,
        "Kyle Henson": { amount: "43.60" } as never,
      },
      txnIndex: {
        "cloud|2026-03": [
          {
            date: "2026-03-04",
            vendor: "Amazon Web Services",
            amount: { value: "1200.50" } as never,
            description: "AWS hosting invoice",
            category: "cloud",
          },
        ],
        "payroll|2026-03": [
          {
            date: "2026-03-02",
            vendor: "Elisha Eisen",
            amount: { metricValue: "6300" } as never,
            description: "",
            category: "payroll",
          },
        ],
        "travel|2026-03": [
          {
            date: "2026-03-03",
            vendor: "Kyle Henson",
            amount: { amount: "43.60" } as never,
            description: "Reimbursement for expense at Lyft",
            category: "travel",
          },
        ],
      },
      chartSeries: {
        operatingInflows: [{ value: "5000" } as never],
        operatingOutflows: [{ amount: "7544.10" } as never],
        grossBurn: [{ value: "7544.10" } as never],
        netBurn: [{ metricValue: "2544.10" } as never],
        runwayCash: { data: { attributes: { value: "USD 100,000" } } } as never,
      },
    };
    render(<ExpenseDashboard initialData={wrappedData} />);

    expect(screen.getByText("$100,000")).toBeTruthy();
    expect(screen.queryByText(/\bNaN\b/)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Categories" }));
    expect(screen.getAllByText("$1,201").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Vendors" }));
    const vendorsView = screen.getByTestId("expense-view-vendors");
    await user.click(within(vendorsView).getByRole("button", { name: /Amazon Web Services/i }));

    expect(screen.getByText("Amazon Web Services - 1 transactions ($1,201)")).toBeTruthy();
    expect(screen.getByText("$1,200.50")).toBeTruthy();
    expect(screen.queryByText(/\bNaN\b/)).toBeNull();
  });

  it("refreshes from the local WIPGuard expense dashboard API", async () => {
    const user = userEvent.setup();
    const nextData: ExpenseDashboardData = {
      ...DATA,
      categoryTotals: { cloud: 2400 },
      categories: ["cloud"],
      categoryMonthly: { cloud: { "2026-03": 2400 } },
      vendorTotals: { "Amazon Web Services": 2400 },
      vendorMonthly: { "Amazon Web Services": { "2026-03": 2400 } },
      vendorCategory: { "Amazon Web Services": "cloud" },
      txnIndex: {
        "cloud|2026-03": [
          {
            date: "2026-03-04",
            vendor: "Amazon Web Services",
            amount: 2400,
            description: "AWS hosting invoice",
            category: "cloud",
          },
        ],
      },
      chartSeries: {
        operatingInflows: [0],
        operatingOutflows: [2400],
        grossBurn: [2400],
        netBurn: [2400],
        runwayCash: 100000,
      },
      refreshedAt: "2026-06-03T13:00:00.000Z",
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => nextData,
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);
    render(<ExpenseDashboard initialData={DATA} />);

    await user.click(screen.getByRole("button", { name: "Refresh data" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/imladris/dashboards/expenses?range=180d",
      expect.objectContaining({
        cache: "no-store",
        credentials: "include",
      }),
    );
    expect(await screen.findByText("Financial data refreshed at Jun 3, 2026, 1:00 PM.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Categories" }));
    expect(screen.getAllByText("$2,400").length).toBeGreaterThan(0);
  });
});
