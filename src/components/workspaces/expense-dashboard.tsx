"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Chart from "chart.js/auto";
import type { ExpenseDashboardData, ExpenseDashboardTransaction } from "@/lib/imladris/expense-dashboard";

type ExpenseView = "overview" | "heatmap" | "categories" | "vendors" | "runway" | "recs";

const VIEW_ITEMS: Array<{ id: ExpenseView; label: string; ariaLabel?: string }> = [
  { id: "overview", label: "Overview" },
  { id: "heatmap", label: "Category × Month", ariaLabel: "Category x Month" },
  { id: "categories", label: "Categories" },
  { id: "vendors", label: "Vendors" },
  { id: "runway", label: "Runway" },
  { id: "recs", label: "Recommendations" },
];

const CATEGORY_COLORS: Record<string, string> = {
  payroll: "#3b82f6",
  uncategorized: "#6b7280",
  marketing: "#f59e0b",
  contractors: "#a78bfa",
  travel: "#14b8a6",
  finance: "#64748b",
  software: "#ec4899",
  hardware: "#fb923c",
  cloud: "#06b6d4",
  conferences: "#84cc16",
  owner_reimbursement: "#f43f5e",
  food: "#8b5cf6",
  rent: "#d946ef",
  legal: "#0ea5e9",
  tax: "#eab308",
  shipping: "#22c55e",
};

function fmt(value: number): string {
  const absolute = Math.abs(value);
  const formatted = absolute.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return value < 0 ? `-$${formatted}` : `$${formatted}`;
}

function fmt2(value: number): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function pct(value: number, total: number): string {
  return total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "0%";
}

function shortMonth(month: string): string {
  const [year, monthNumber] = month.split("-");
  const label = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    Number(monthNumber) - 1
  ];
  return `${label ?? monthNumber} ${year?.slice(2) ?? ""}`;
}

function reportDateLabel(date = new Date()): string {
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function refreshDateLabel(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function sortedCategories(data: ExpenseDashboardData): string[] {
  return Object.keys(data.categoryTotals).sort((left, right) => data.categoryTotals[right] - data.categoryTotals[left]);
}

function sortedVendors(data: ExpenseDashboardData): string[] {
  return Object.keys(data.vendorTotals).sort((left, right) => data.vendorTotals[right] - data.vendorTotals[left]);
}

function transactionsForMonth(data: ExpenseDashboardData, month: string): ExpenseDashboardTransaction[] {
  return Object.entries(data.txnIndex)
    .filter(([key]) => key.endsWith(`|${month}`))
    .flatMap(([, txns]) => txns)
    .sort((left, right) => right.amount - left.amount);
}

function transactionsForVendor(data: ExpenseDashboardData, vendor: string): ExpenseDashboardTransaction[] {
  return Object.values(data.txnIndex)
    .flatMap((txns) => txns)
    .filter((txn) => txn.vendor === vendor)
    .sort((left, right) => right.date.localeCompare(left.date));
}

function totalSpend(data: ExpenseDashboardData): number {
  return Object.values(data.categoryTotals).reduce((sum, value) => sum + value, 0);
}

function KpiCards({ data }: { data: ExpenseDashboardData }) {
  const cash = data.chartSeries.runwayCash ?? 0;
  const outflows = data.chartSeries.operatingOutflows;
  const inflows = data.chartSeries.operatingInflows;
  const recentGross = outflows.slice(-3);
  const recentNet = data.chartSeries.netBurn.slice(-3);
  const avgGross = recentGross.length ? recentGross.reduce((sum, value) => sum + value, 0) / recentGross.length : 0;
  const avgNet = recentNet.length ? recentNet.reduce((sum, value) => sum + value, 0) / recentNet.length : 0;
  const latestOutflow = outflows.at(-1) ?? 0;
  const latestInflow = inflows.at(-1) ?? 0;
  const runway = avgNet > 0 ? cash / avgNet : 0;

  return (
    <div className="expense-grid expense-g4">
      <div className="expense-card">
        <div className="expense-card-label">Total Cash & Equivalents</div>
        <div className="expense-card-value expense-green">{fmt(cash)}</div>
        <div className="expense-card-sub">Latest Mercury account balance</div>
      </div>
      <div className="expense-card">
        <div className="expense-card-label">3-Mo Avg Net Burn</div>
        <div className="expense-card-value expense-yellow">{fmt(avgNet)}/mo</div>
        <div className="expense-card-sub">Gross: {fmt(avgGross)}/mo</div>
      </div>
      <div className="expense-card">
        <div className="expense-card-label">Runway (3-Mo Avg)</div>
        <div className="expense-card-value expense-yellow">{runway > 0 ? `${runway.toFixed(1)} months` : "—"}</div>
        <div className="expense-card-sub">At latest rate: {latestOutflow - latestInflow > 0 ? `${(cash / (latestOutflow - latestInflow)).toFixed(1)} mo` : "—"} · Target: 9+ mo</div>
      </div>
      <div className="expense-card">
        <div className="expense-card-label">Seed Round</div>
        <div className="expense-card-value expense-green">$3,269,997</div>
        <div className="expense-card-sub">Closed Mar 9-11 · Treasury earning ~$5.6K/mo</div>
      </div>
    </div>
  );
}

function DetailTable({
  title,
  transactions,
  includeDescription = false,
}: {
  title: string;
  transactions: ExpenseDashboardTransaction[];
  includeDescription?: boolean;
}) {
  return (
    <div className="expense-detail-panel">
      <div className="mb-2 font-semibold">{title}</div>
      {transactions.length === 0 ? (
        <div className="text-[var(--expense-text-muted)]">No transactions</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              {includeDescription ? <th>Description</th> : <th>Vendor</th>}
              <th>Category</th>
              <th className="expense-num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((txn, index) => (
              <tr key={`${txn.date}-${txn.vendor}-${txn.amount}-${index}`}>
                <td>{txn.date}</td>
                <td className={includeDescription ? "max-w-[300px] overflow-hidden text-ellipsis" : undefined}>
                  {includeDescription ? txn.description || "—" : txn.vendor}
                </td>
                <td><span className="expense-badge expense-badge-blue">{txn.category}</span></td>
                <td className="expense-num expense-neg">{fmt2(txn.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function OverviewView({ data, onMonth }: { data: ExpenseDashboardData; onMonth: (month: string) => void }) {
  const [activeMonth, setActiveMonth] = useState<string | null>(null);

  const handleMonth = (month: string) => {
    setActiveMonth((current) => (current === month ? null : month));
    onMonth(month);
  };

  return (
    <div id="view-overview">
      <div className="expense-grid expense-g2 expense-section">
        <div className="expense-card">
          <div className="expense-section-title">Monthly Operating Cash Flows</div>
          <div className="expense-chart-wrap"><canvas id="flowChart" /></div>
        </div>
        <div className="expense-card">
          <div className="expense-section-title">Spend by Category (6 Months)</div>
          <div className="expense-chart-wrap"><canvas id="catPieChart" /></div>
        </div>
      </div>
      <div className="expense-grid expense-g2 expense-section">
        <div className="expense-card">
          <div className="expense-section-title">Burn Trend</div>
          <div className="expense-chart-wrap"><canvas id="burnChart" /></div>
        </div>
        <div className="expense-card">
          <div className="expense-section-title">Category Trend (Stacked)</div>
          <div className="expense-chart-wrap"><canvas id="stackedChart" /></div>
        </div>
      </div>
      <div className="expense-card expense-section">
        <div className="expense-section-title">Monthly Operating Flows</div>
        <div className="expense-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th className="expense-num">Op. Inflows</th>
                <th className="expense-num">Op. Outflows</th>
                <th className="expense-num">Net Operating</th>
                <th className="expense-num">Financing</th>
              </tr>
            </thead>
            <tbody>
              {data.months.map((month, index) => {
                const inflow = data.chartSeries.operatingInflows[index] ?? 0;
                const outflow = data.chartSeries.operatingOutflows[index] ?? 0;
                const netOperating = inflow - outflow;
                return (
                  <tr key={month}>
                    <td>
                      <button className="expense-row-button" type="button" onClick={() => handleMonth(month)}>
                        {month}
                      </button>
                    </td>
                    <td className="expense-num expense-pos">{fmt(inflow)}</td>
                    <td className="expense-num expense-neg">{fmt(outflow)}</td>
                    <td className={`expense-num ${netOperating >= 0 ? "expense-pos" : "expense-neg"}`}>{fmt(netOperating)}</td>
                    <td className="expense-num">—</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {activeMonth ? (
          <DetailTable
            title={`All Outflows: ${shortMonth(activeMonth)} (${transactionsForMonth(data, activeMonth).length} transactions, ${fmt(transactionsForMonth(data, activeMonth).reduce((sum, txn) => sum + txn.amount, 0))})`}
            transactions={transactionsForMonth(data, activeMonth)}
          />
        ) : null}
      </div>
    </div>
  );
}

function HeatmapView({ data }: { data: ExpenseDashboardData }) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const categories = sortedCategories(data);
  const maxValue = Math.max(1, ...categories.flatMap((category) => data.months.map((month) => data.categoryMonthly[category]?.[month] ?? 0)));
  const [activeCategory, activeMonth] = activeKey?.split("|") ?? [];

  return (
    <div id="view-heatmap">
      <div className="expense-card">
        <div className="expense-section-title">
          Spend Heatmap: Category × Month
          <span className="text-xs font-normal text-[var(--expense-text-secondary)]">Click any cell to see transactions</span>
        </div>
        <div className="expense-table-wrap">
          <table>
            <thead>
              <tr>
                <th className="min-w-[140px]">Category</th>
                {data.months.map((month) => <th key={month} className="expense-num min-w-[90px]">{shortMonth(month)}</th>)}
                <th className="expense-num min-w-[100px]">Total</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category}>
                  <td className="font-semibold">
                    <span className="expense-swatch" style={{ background: CATEGORY_COLORS[category] ?? "#666" }} />
                    {category}
                  </td>
                  {data.months.map((month) => {
                    const value = data.categoryMonthly[category]?.[month] ?? 0;
                    const intensity = value > 0 ? Math.max(0.05, Math.min(0.6, value / maxValue)) : 0;
                    const key = `${category}|${month}`;
                    return (
                      <td key={key} className="expense-num">
                        <button
                          className="expense-heatmap-cell"
                          style={{ background: value > 0 ? `rgba(96,165,250,${intensity})` : "transparent" }}
                          type="button"
                          onClick={() => setActiveKey((current) => (current === key ? null : key))}
                        >
                          {value > 0 ? fmt(value) : "—"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="expense-num font-semibold">{fmt(data.categoryTotals[category])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {activeKey && activeCategory && activeMonth ? (
          <DetailTable
            title={`${activeCategory} · ${shortMonth(activeMonth)} - ${(data.txnIndex[activeKey] ?? []).length} transactions (${fmt((data.txnIndex[activeKey] ?? []).reduce((sum, txn) => sum + txn.amount, 0))})`}
            transactions={data.txnIndex[activeKey] ?? []}
          />
        ) : null}
      </div>
    </div>
  );
}

function CategoriesView({ data }: { data: ExpenseDashboardData }) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const categories = sortedCategories(data);
  const spend = totalSpend(data);
  const completeMonths = Math.max(1, data.months.length);
  const vendorTotals = activeCategory
    ? Object.values(data.txnIndex)
        .flatMap((txns) => txns)
        .filter((txn) => txn.category === activeCategory)
        .reduce<Record<string, number>>((acc, txn) => {
          acc[txn.vendor] = (acc[txn.vendor] ?? 0) + txn.amount;
          return acc;
        }, {})
    : {};
  const vendors = Object.entries(vendorTotals).sort((left, right) => right[1] - left[1]);

  return (
    <div id="view-categories">
      <div className="expense-card">
        <div className="expense-section-title">
          All Categories
          <span className="text-xs font-normal text-[var(--expense-text-secondary)]">Click a row to drill into vendors & transactions</span>
        </div>
        <div className="expense-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th className="expense-num">6-Mo Total</th>
                <th className="expense-num">% of Spend</th>
                <th className="expense-num">~Monthly</th>
                {data.months.map((month) => <th key={month} className="expense-num">{shortMonth(month)}</th>)}
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => {
                const total = data.categoryTotals[category];
                return (
                  <tr key={category}>
                    <td>
                      <button className="expense-row-button" type="button" onClick={() => setActiveCategory((current) => (current === category ? null : category))}>
                        <span className="expense-swatch" style={{ background: CATEGORY_COLORS[category] ?? "#666" }} />
                        {category}
                      </button>
                    </td>
                    <td className="expense-num">{fmt(total)}</td>
                    <td className="expense-num">{pct(total, spend)}</td>
                    <td className="expense-num text-[var(--expense-text-secondary)]">{fmt(total / completeMonths)}</td>
                    {data.months.map((month) => {
                      const value = data.categoryMonthly[category]?.[month] ?? 0;
                      return <td key={`${category}-${month}`} className="expense-num">{value > 0 ? fmt(value) : "—"}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {activeCategory ? (
          <div className="expense-detail-panel">
            <div className="mb-2 font-semibold">{activeCategory} - Vendors ({vendors.length})</div>
            <table>
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th className="expense-num">Total</th>
                  <th className="expense-num">% of Category</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map(([vendor, amount]) => (
                  <tr key={vendor}>
                    <td>{vendor}</td>
                    <td className="expense-num expense-neg">{fmt(amount)}</td>
                    <td className="expense-num">{pct(amount, data.categoryTotals[activeCategory])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function VendorsView({ data }: { data: ExpenseDashboardData }) {
  const [filter, setFilter] = useState<string | null>(null);
  const [activeVendor, setActiveVendor] = useState<string | null>(null);
  const categories = Array.from(new Set(Object.values(data.vendorCategory))).sort();
  const vendors = sortedVendors(data).filter((vendor) => !filter || data.vendorCategory[vendor] === filter);
  const spend = Object.values(data.vendorTotals).reduce((sum, value) => sum + value, 0);
  const activeTransactions = activeVendor ? transactionsForVendor(data, activeVendor) : [];

  return (
    <div id="view-vendors" data-testid="expense-view-vendors">
      <div className="expense-tabs">
        <button className={`expense-tab ${filter ? "" : "active"}`} type="button" onClick={() => setFilter(null)}>All</button>
        {categories.map((category) => (
          <button key={category} className={`expense-tab ${filter === category ? "active" : ""}`} type="button" onClick={() => setFilter(category)}>
            {category}
          </button>
        ))}
      </div>
      <div className="expense-card">
        <div className="expense-section-title">
          Top Vendors
          <span className="text-xs font-normal text-[var(--expense-text-secondary)]">Click a row to see all transactions</span>
        </div>
        <div className="expense-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Category</th>
                <th className="expense-num">Total</th>
                <th className="expense-num">% of Spend</th>
                {data.months.map((month) => <th key={month} className="expense-num">{shortMonth(month)}</th>)}
              </tr>
            </thead>
            <tbody>
              {vendors.map((vendor) => {
                const category = data.vendorCategory[vendor] ?? "";
                return (
                  <tr key={vendor}>
                    <td>
                      <button className="expense-row-button" type="button" onClick={() => setActiveVendor((current) => (current === vendor ? null : vendor))}>
                        {vendor}
                      </button>
                    </td>
                    <td><span className="expense-badge" style={{ background: CATEGORY_COLORS[category] ?? "#334155", color: "#fff" }}>{category}</span></td>
                    <td className="expense-num">{fmt(data.vendorTotals[vendor])}</td>
                    <td className="expense-num">{pct(data.vendorTotals[vendor], spend)}</td>
                    {data.months.map((month) => {
                      const value = data.vendorMonthly[vendor]?.[month] ?? 0;
                      return <td key={`${vendor}-${month}`} className="expense-num">{value > 0 ? fmt(value) : "—"}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {activeVendor ? (
          <DetailTable
            title={`${activeVendor} - ${activeTransactions.length} transactions (${fmt(activeTransactions.reduce((sum, txn) => sum + txn.amount, 0))})`}
            transactions={activeTransactions}
            includeDescription
          />
        ) : null}
      </div>
    </div>
  );
}

function RunwayView({ data }: { data: ExpenseDashboardData }) {
  const cash = data.chartSeries.runwayCash ?? 0;
  const latestBurn = data.chartSeries.netBurn.at(-1) ?? data.chartSeries.operatingOutflows.at(-1) ?? 0;
  const avgBurn = data.chartSeries.netBurn.length
    ? data.chartSeries.netBurn.reduce((sum, value) => sum + value, 0) / data.chartSeries.netBurn.length
    : latestBurn;
  const scenarios = [
    ["Current", latestBurn],
    ["Average", avgBurn],
    ["10% cost reduction", avgBurn * 0.9],
    ["20% cost reduction", avgBurn * 0.8],
    ["30% cost reduction", avgBurn * 0.7],
    ["50% cost reduction", avgBurn * 0.5],
  ] as const;
  const financingEvents = [
    ["Mar 9", "STAGE 2 CAPITAL FUND IV A LP", 1_213_032],
    ["Mar 9", "GRID CAPITAL FUND I-A, LP", 302_023],
    ["Mar 9", "STAGE 2 CAPITAL FUND IV LP", 286_968],
    ["Mar 10", "SAAS VENTURES III LP", 420_000],
    ["Mar 10", "CATALYST FUND IV", 200_000],
    ["Mar 11", "FIRST ORDER FUND LP", 150_000],
    ["Mar 11", "GRID CAPITAL FUND I, LP", 697_976],
  ] as const;

  return (
    <div id="view-runway">
      <div className="expense-grid expense-g2">
        <div className="expense-card">
          <div className="expense-section-title">Runway Scenarios</div>
          <table>
            <thead>
              <tr><th>Scenario</th><th className="expense-num">Monthly Burn</th><th className="expense-num">Runway</th><th>Status</th></tr>
            </thead>
            <tbody>
              {scenarios.map(([label, burn]) => {
                const runway = burn > 0 ? cash / burn : 0;
                const healthy = runway >= 9;
                return (
                  <tr key={label}>
                    <td>{label}</td>
                    <td className="expense-num expense-neg">{fmt(burn)}</td>
                    <td className="expense-num">{runway > 0 ? `${runway.toFixed(1)} mo` : "—"}</td>
                    <td><span className={`expense-badge ${healthy ? "expense-badge-green" : "expense-badge-yellow"}`}>{healthy ? "HEALTHY" : "WATCH"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="expense-card-sub mt-3">Total cash: {fmt(cash)}</div>
        </div>
        <div className="expense-card">
          <div className="expense-section-title">Runway Sensitivity</div>
          <div className="expense-chart-wrap"><canvas id="runwayChart" /></div>
        </div>
      </div>
      <div className="expense-card expense-section">
        <div className="expense-section-title">Financing Events</div>
        <table>
          <thead>
            <tr><th>Date</th><th>Investor</th><th className="expense-num">Amount</th></tr>
          </thead>
          <tbody>
            {financingEvents.map(([date, investor, amount]) => (
              <tr key={`${date}-${investor}`}>
                <td>{date}</td>
                <td>{investor}</td>
                <td className="expense-num expense-pos">{fmt(amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}><strong>Total</strong></td>
              <td className="expense-num expense-pos"><strong>$3,269,997</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function RecommendationsView() {
  const recommendations = [
    {
      title: "1. Determine If April Legal Cost Is One-Time",
      badge: "High Priority",
      confidence: "High Confidence",
      effort: "Low Effort",
      detail: "April net burn was $295,306 — driven by $174K Pillsbury legal fees (likely financing close). 3-mo avg burn rose from $114K to $176,465/mo.",
      next: "Confirm Pillsbury cost is closing-related and not recurring. Reset baseline excluding it.",
      color: "#f59e0b",
    },
    {
      title: "2. Uncategorized Spend (0.4% of total)",
      badge: "Resolved",
      confidence: "High Confidence",
      effort: "Low Effort",
      detail: "$3,583 uncategorized — down from $128,000 after applying overrides. EWALLET-DIVVYP, SSBTRUSTOPS, AMEX EPAYMENT, Pillsbury, Alliant Insurance now mapped.",
      next: "Review remaining uncategorized vendors quarterly.",
      color: "#f59e0b",
    },
    {
      title: "3. Evaluate GrowthHit Marketing Contract ($10K/mo)",
      badge: "Review",
      confidence: "Medium Confidence",
      effort: "Low Effort",
      detail: "$60,000 over 6 months. Potential savings: $10K/mo ($120K/yr).",
      next: "Review pipeline attribution. Pause if ROI unclear.",
      color: "#3b82f6",
    },
    {
      title: "4. Review Contractor Spend (~$3K/mo)",
      badge: "Review",
      confidence: "Medium Confidence",
      effort: "Medium Effort",
      detail: "Teamswell ($5.3K), Tenpoint Labs ($8K), Squared Away ($2.4K). With payroll scaling, some may be redundant.",
      next: "Review each contractor's scope vs. new FTE roles.",
      color: "#3b82f6",
    },
    {
      title: "5. Audit SaaS Subscriptions (~$7K/mo)",
      badge: "Review",
      confidence: "Medium Confidence",
      effort: "Medium Effort",
      detail: "354 software transactions. AWS $2.5K/mo, Anthropic $1.4K/mo, Google $2K/mo. Potential savings: $1-3K/mo.",
      next: "Inventory all active SaaS. Cancel unused licenses. Right-size cloud.",
      color: "#3b82f6",
    },
    {
      title: "6. Establish Travel Policy (~$2K/mo)",
      badge: "Low Priority",
      confidence: "Low Confidence",
      effort: "Low Effort",
      detail: "$64K across 349 transactions (6% of spend). Potential savings: $3-5K/mo.",
      next: "Set per-trip caps, require pre-approval >$500.",
      color: "#64748b",
    },
  ] as const;
  return (
    <div id="view-recs">
      {recommendations.map((recommendation) => (
        <div key={recommendation.title} className="expense-card mb-3" style={{ borderLeft: `4px solid ${recommendation.color}` }}>
          <div className="mb-1 text-[15px] font-bold">{recommendation.title}</div>
          <div className="mb-2 flex gap-2">
            <span className={`expense-badge ${recommendation.badge === "Resolved" ? "expense-badge-green" : recommendation.badge === "High Priority" ? "expense-badge-yellow" : recommendation.badge === "Low Priority" ? "expense-badge-gray" : "expense-badge-blue"}`}>{recommendation.badge}</span>
            <span className={`expense-badge ${recommendation.confidence === "High Confidence" ? "expense-badge-green" : recommendation.confidence === "Medium Confidence" ? "expense-badge-yellow" : "expense-badge-gray"}`}>{recommendation.confidence}</span>
            <span className={`expense-badge ${recommendation.effort === "Medium Effort" ? "expense-badge-yellow" : "expense-badge-gray"}`}>{recommendation.effort}</span>
          </div>
          <div className="text-[13px] text-[#cbd5e1]">
            {recommendation.detail}
            <br />
            <strong>Next:</strong> {recommendation.next}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ExpenseDashboard({ initialData }: { initialData: ExpenseDashboardData }) {
  const [data, setData] = useState(initialData);
  const [activeView, setActiveView] = useState<ExpenseView>("overview");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [refreshStatus, setRefreshStatus] = useState(() => `Financial data refreshed at ${refreshDateLabel(initialData.refreshedAt)}.`);
  const reportDate = useMemo(() => reportDateLabel(new Date()), []);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const chartIds = ["flowChart", "catPieChart", "burnChart", "stackedChart", "runwayChart"];
    const destroyCharts = () => {
      chartIds.forEach((id) => {
        const element = document.getElementById(id);
        if (element instanceof HTMLCanvasElement) {
          Chart.getChart(element)?.destroy();
        }
      });
    };
    destroyCharts();

    if (data.months.length === 0) return;
    const months = data.months;
    const labels = months.map(shortMonth);
    const categories = sortedCategories(data);
    const opIn = data.chartSeries.operatingInflows;
    const opOut = data.chartSeries.operatingOutflows;
    const netOp = opIn.map((value, index) => value - (opOut[index] ?? 0));
    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#94a3b8", font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: "#94a3b8" }, grid: { color: "#1a2536" } },
        y: { ticks: { color: "#94a3b8", callback: (value: string | number) => `$${(Number(value) / 1000).toFixed(0)}K` }, grid: { color: "#1a2536" } },
      },
    };

    const flow = document.getElementById("flowChart") as HTMLCanvasElement | null;
    if (flow) {
      new Chart(flow, {
        type: "bar",
        data: {
          labels,
          datasets: [
            { label: "Inflows", data: opIn, backgroundColor: "#4ade80", borderRadius: 3 },
            { label: "Outflows", data: opOut, backgroundColor: "#f87171", borderRadius: 3 },
            { label: "Net", data: netOp, type: "line", borderColor: "#60a5fa", backgroundColor: "transparent", borderWidth: 2 },
          ],
        },
        options: chartOptions,
      });
    }

    const pie = document.getElementById("catPieChart") as HTMLCanvasElement | null;
    if (pie) {
      new Chart(pie, {
        type: "doughnut",
        data: {
          labels: categories,
          datasets: [{ data: categories.map((category) => data.categoryTotals[category]), backgroundColor: categories.map((category) => CATEGORY_COLORS[category] ?? "#666"), borderWidth: 0 }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "right", labels: { color: "#94a3b8", font: { size: 11 }, padding: 6 } } } },
      });
    }

    const burn = document.getElementById("burnChart") as HTMLCanvasElement | null;
    if (burn) {
      new Chart(burn, {
        type: "line",
        data: {
          labels,
          datasets: [
            { label: "Gross Burn", data: data.chartSeries.grossBurn, borderColor: "#f87171", backgroundColor: "rgba(248,113,113,0.08)", fill: true, tension: 0.3 },
            { label: "Net Burn", data: data.chartSeries.netBurn, borderColor: "#fbbf24", backgroundColor: "rgba(251,191,36,0.08)", fill: true, tension: 0.3 },
          ],
        },
        options: chartOptions,
      });
    }

    const stacked = document.getElementById("stackedChart") as HTMLCanvasElement | null;
    if (stacked) {
      new Chart(stacked, {
        type: "bar",
        data: {
          labels,
          datasets: categories.slice(0, 8).map((category) => ({
            label: category,
            data: months.map((month) => data.categoryMonthly[category]?.[month] ?? 0),
            backgroundColor: CATEGORY_COLORS[category] ?? "#666",
            borderRadius: 1,
          })),
        },
        options: {
          ...chartOptions,
          scales: {
            x: { stacked: true, ticks: { color: "#94a3b8" }, grid: { color: "#1a2536" } },
            y: { stacked: true, ticks: { color: "#94a3b8", callback: (value: string | number) => `$${(Number(value) / 1000).toFixed(0)}K` }, grid: { color: "#1a2536" } },
          },
        },
      });
    }

    const runway = document.getElementById("runwayChart") as HTMLCanvasElement | null;
    if (runway) {
      const cash = data.chartSeries.runwayCash ?? 0;
      const burns = Array.from({ length: 31 }, (_, index) => 50000 + index * 10000);
      new Chart(runway, {
        type: "line",
        data: {
          labels: burns.map((burnValue) => `$${burnValue / 1000}K`),
          datasets: [
            { label: "Runway (months)", data: burns.map((burnValue) => cash / burnValue), borderColor: "#4ade80", backgroundColor: "rgba(74,222,128,0.08)", fill: true, tension: 0.3, pointRadius: 0 },
            { label: "9-mo target", data: burns.map(() => 9), borderColor: "#f87171", borderDash: [5, 5], pointRadius: 0, borderWidth: 1 },
          ],
        },
        options: chartOptions,
      });
    }

    return () => {
      destroyCharts();
    };
  }, [data, activeView]);

  async function refreshFinancialData() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsRefreshing(true);
    setRefreshError("");
    setRefreshStatus("Refreshing financial data.");
    try {
      const response = await fetch("/api/imladris/dashboards/expenses?range=180d", {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body.error === "string" ? body.error : "Unable to refresh financial data.");
      }
      const nextData = (await response.json()) as ExpenseDashboardData;
      setData(nextData);
      setRefreshStatus(`Financial data refreshed at ${refreshDateLabel(nextData.refreshedAt)}.`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setRefreshError(error instanceof Error ? error.message : "Refresh failed. The dashboard is still showing the previous data.");
      setRefreshStatus("Refresh failed. Previous data is still displayed.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsRefreshing(false);
    }
  }

  return (
    <div className="expense-dashboard h-full overflow-y-auto" aria-busy={isRefreshing}>
      <style>{EXPENSE_DASHBOARD_CSS}</style>
      <div className="expense-container">
        <div className="expense-page-header">
          <div className="min-w-0">
            <h1>Arda Financial Dashboard</h1>
            <p className="expense-subtitle">Arda Systems Limited · {reportDate} · Mercury Data (Cash Basis) · Click any cell, category, or vendor to drill down</p>
          </div>
          <div className="expense-header-actions">
            <button className="expense-refresh-btn" type="button" aria-busy={isRefreshing} disabled={isRefreshing} onClick={refreshFinancialData}>
              {isRefreshing ? "Refreshing..." : "Refresh data"}
            </button>
            <div className="expense-refresh-status" aria-live="polite">{refreshStatus}</div>
            {refreshError ? <div className="expense-refresh-error" role="alert">{refreshError}</div> : null}
          </div>
        </div>

        <div className="expense-alert">
          <div className="expense-alert-icon">!</div>
          <div>
            <div className="expense-alert-title">WATCH: April Burn Spike — Legal Fees Closing Series</div>
            <div className="expense-alert-detail">April net burn was $295,306, driven by $174K Pillsbury Winthrop legal fees (financing close). 3-mo avg burn rose to $176,465/mo (was $113,807). Runway at 3-mo avg: 14.5 months. Determine if April legal cost is one-time before treating this as the new baseline.</div>
          </div>
        </div>

        <KpiCards data={data} />

        <div className="expense-nav" aria-label="Expense dashboard views">
          {VIEW_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`expense-nav-btn ${activeView === item.id ? "active" : ""}`}
              type="button"
              aria-label={item.ariaLabel}
              onClick={() => setActiveView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {data.months.length === 0 ? (
          <div className="expense-card expense-section">
            <div className="expense-section-title">No Mercury expense data available</div>
            <p className="text-sm text-[var(--expense-text-secondary)]">Run the Mercury cashflow sync to populate transactions for this dashboard.</p>
          </div>
        ) : (
          <>
            {activeView === "overview" ? <OverviewView data={data} onMonth={() => undefined} /> : null}
            {activeView === "heatmap" ? <HeatmapView data={data} /> : null}
            {activeView === "categories" ? <CategoriesView data={data} /> : null}
            {activeView === "vendors" ? <VendorsView data={data} /> : null}
            {activeView === "runway" ? <RunwayView data={data} /> : null}
            {activeView === "recs" ? <RecommendationsView /> : null}
          </>
        )}

        <div className="expense-footer">
          Cash-basis report from Mercury checking + Treasury · No revenue/AR/AP visibility · Category mapping automated · Generated {reportDate}
        </div>
      </div>
    </div>
  );
}

const EXPENSE_DASHBOARD_CSS = `
.expense-dashboard {
  --expense-bg-primary: #0f172a;
  --expense-bg-card: #1e293b;
  --expense-bg-hover: #273548;
  --expense-bg-active: #334155;
  --expense-border: #334155;
  --expense-text-primary: #e2e8f0;
  --expense-text-secondary: #94a3b8;
  --expense-text-muted: #64748b;
  --expense-green: #4ade80;
  --expense-red: #f87171;
  --expense-yellow: #fbbf24;
  --expense-blue: #60a5fa;
  background: var(--expense-bg-primary);
  color: var(--expense-text-primary);
  font-size: 14px;
  line-height: 1.5;
}
.expense-container { max-width: 1440px; margin: 0 auto; padding: 20px; }
.expense-dashboard h1 { font-size: 24px; font-weight: 700; letter-spacing: 0; }
.expense-subtitle { color: var(--expense-text-secondary); font-size: 13px; margin-bottom: 20px; }
.expense-page-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 20px; }
.expense-header-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0; }
.expense-refresh-btn { min-height: 38px; padding: 0 14px; border: 1px solid var(--expense-border); border-radius: 6px; background: var(--expense-bg-card); color: var(--expense-text-primary); font: inherit; font-weight: 600; cursor: pointer; transition: background 0.15s, border-color 0.15s, opacity 0.15s; }
.expense-refresh-btn:hover:not(:disabled) { background: var(--expense-bg-hover); border-color: var(--expense-blue); }
.expense-refresh-btn:focus-visible { outline: 3px solid var(--expense-blue); outline-offset: 2px; }
.expense-refresh-btn:disabled { cursor: wait; opacity: 0.7; }
.expense-refresh-status { color: var(--expense-text-secondary); font-size: 12px; text-align: right; }
.expense-refresh-error { max-width: 360px; color: #fecaca; background: #7f1d1d; border: 1px solid #ef4444; border-radius: 6px; padding: 8px 10px; font-size: 12px; text-align: left; }
.expense-nav { display: flex; gap: 4px; margin: 20px 0; background: var(--expense-bg-card); border-radius: 8px; padding: 4px; border: 1px solid var(--expense-border); overflow-x: auto; }
.expense-nav-btn { padding: 8px 16px; border: 0; background: transparent; color: var(--expense-text-secondary); cursor: pointer; border-radius: 6px; font-size: 13px; font-weight: 500; transition: all 0.15s; white-space: nowrap; }
.expense-nav-btn:hover { background: var(--expense-bg-hover); color: var(--expense-text-primary); }
.expense-nav-btn.active { background: var(--expense-bg-active); color: var(--expense-text-primary); }
.expense-alert { background: linear-gradient(135deg, #78350f, #713f12); border: 1px solid #f59e0b; border-radius: 10px; padding: 14px 18px; margin-bottom: 20px; display: flex; gap: 10px; align-items: flex-start; }
.expense-alert-icon { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 999px; border: 1px solid #f59e0b; color: #fcd34d; font-size: 13px; font-weight: 800; flex: 0 0 auto; }
.expense-alert-title { font-weight: 700; font-size: 14px; color: #fcd34d; }
.expense-alert-detail { font-size: 12px; color: #fef3c7; margin-top: 2px; }
.expense-grid { display: grid; gap: 16px; }
.expense-g4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.expense-g2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.expense-card { background: var(--expense-bg-card); border: 1px solid var(--expense-border); border-radius: 10px; padding: 16px; }
.expense-card-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--expense-text-secondary); margin-bottom: 4px; }
.expense-card-value { font-size: 28px; font-weight: 700; }
.expense-card-sub { font-size: 12px; color: var(--expense-text-secondary); margin-top: 2px; }
.expense-green { color: var(--expense-green); }
.expense-yellow { color: var(--expense-yellow); }
.expense-section { margin-top: 20px; }
.expense-section-title { font-size: 16px; font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.expense-table-wrap { overflow-x: auto; }
.expense-dashboard table { width: 100%; border-collapse: collapse; font-size: 13px; }
.expense-dashboard th { text-align: left; padding: 8px 10px; background: var(--expense-bg-primary); color: var(--expense-text-secondary); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; position: sticky; top: 0; z-index: 1; }
.expense-dashboard th.expense-num, .expense-dashboard td.expense-num { text-align: right; }
.expense-dashboard td { padding: 8px 10px; border-top: 1px solid #1a2536; white-space: nowrap; }
.expense-dashboard tr:hover td { background: var(--expense-bg-hover); }
.expense-row-button { color: inherit; background: transparent; border: 0; font: inherit; font-weight: 600; cursor: pointer; text-align: left; display: inline-flex; align-items: center; gap: 6px; }
.expense-row-button:hover { color: var(--expense-blue); }
.expense-neg { color: var(--expense-red); }
.expense-pos { color: var(--expense-green); }
.expense-badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
.expense-badge-green { background: #14532d; color: #86efac; }
.expense-badge-yellow { background: #78350f; color: #fbbf24; }
.expense-badge-blue { background: #1e3a5f; color: #93c5fd; }
.expense-badge-gray { background: #334155; color: #94a3b8; }
.expense-chart-wrap { position: relative; height: 280px; }
.expense-detail-panel { background: var(--expense-bg-primary); border: 1px solid var(--expense-border); border-radius: 10px; padding: 16px; margin-top: 12px; max-height: 400px; overflow-y: auto; }
.expense-detail-panel table td { font-size: 12px; padding: 6px 8px; }
.expense-tabs { display: flex; gap: 2px; margin-bottom: 12px; overflow-x: auto; }
.expense-tab { padding: 6px 14px; background: var(--expense-bg-card); border: 1px solid var(--expense-border); color: var(--expense-text-secondary); cursor: pointer; font-size: 12px; border-radius: 6px; transition: all 0.15s; white-space: nowrap; }
.expense-tab:hover { color: var(--expense-text-primary); }
.expense-tab.active { background: var(--expense-bg-active); color: var(--expense-text-primary); border-color: var(--expense-blue); }
.expense-heatmap-cell { width: 100%; padding: 6px 8px; text-align: right; font-size: 12px; font-variant-numeric: tabular-nums; cursor: pointer; transition: outline 0.1s; border: 0; border-radius: 2px; color: var(--expense-text-primary); }
.expense-heatmap-cell:hover { outline: 2px solid var(--expense-blue); outline-offset: -2px; }
.expense-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: middle; flex: 0 0 auto; }
.expense-footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--expense-border); font-size: 12px; color: var(--expense-text-muted); text-align: center; }
@media (max-width: 900px) {
  .expense-page-header { flex-direction: column; }
  .expense-header-actions { align-items: stretch; width: 100%; }
  .expense-g4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .expense-g2 { grid-template-columns: 1fr; }
}
`;
