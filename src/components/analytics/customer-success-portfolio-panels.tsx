"use client";

import { useState } from "react";
import type { CustomerSuccessPortfolio } from "@/lib/customer-success/types";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-error-banner";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { DashboardStaleBanner } from "@/components/dashboard/dashboard-stale-banner";
import { useDashboardResource } from "@/components/dashboard/use-dashboard-resource";
import { deriveCustomerSuccessPortfolioView } from "@/components/analytics/customer-success-portfolio-selectors";
import {
  LeadingIndicatorPressurePanel,
  PortfolioAlertsPanel,
  PortfolioAccountsTable,
  PortfolioAttentionQueuePanel,
  PortfolioHealthDistributionPanel,
  PortfolioRecentActivityPanel,
  PortfolioSummaryCards,
} from "@/components/analytics/customer-success-portfolio-sections";
import {
  formatDate,
  formatNumber,
  healthTone,
} from "@/components/analytics/customer-success-formatters";
import { useCustomerSuccessPortfolioView } from "@/components/analytics/use-customer-success-portfolio-view";

function syncRunTone(status: "SUCCESS" | "PARTIAL" | "ERROR"): string {
  if (status === "SUCCESS") return "border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)]";
  if (status === "PARTIAL") return "border-[var(--warning)]/30 bg-[var(--warning)]/10 text-[var(--warning)]";
  return "border-red-500/30 bg-red-500/10 text-red-500";
}

export function CustomerSuccessPortfolioPanels() {
  const {
    accountSort,
    setAccountSort,
    showOnlyWeakSignals,
    setShowOnlyWeakSignals,
    indicatorFilter,
    setIndicatorFilter,
    clearFilters,
  } = useCustomerSuccessPortfolioView();
  const [syncingRelationships, setSyncingRelationships] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const resource = useDashboardResource<CustomerSuccessPortfolio>({
    cacheKey: "customer-success:portfolio",
    deps: [],
    async load({ signal }) {
      const response = await fetch("/api/customer-success/portfolio", {
        cache: "no-store",
        signal,
      });
      const body = (await response.json()) as CustomerSuccessPortfolio | { error?: string };
      if (!response.ok) {
        throw new Error(body && "error" in body && body.error ? body.error : "Failed to load customer success portfolio");
      }
      return body as CustomerSuccessPortfolio;
    },
    getLastUpdatedAt: (payload) => payload.generatedAt,
  });

  if (resource.loading && !resource.data) {
    return <DashboardLoadingState message="Loading customer-success portfolio..." className="h-64" />;
  }

  if (resource.error && !resource.data) {
    return <DashboardErrorBanner message={resource.error} />;
  }

  if (!resource.data) {
    return <DashboardErrorBanner message="Customer-success portfolio data is unavailable." />;
  }

  const portfolio = resource.data;
  const accountsWithCoda = portfolio.accounts.filter((account) => !(account.relationship?.missingSources ?? []).includes("coda")).length;
  const coverageGaps = portfolio.accounts.filter((account) => (account.relationship?.missingSources.length ?? 0) > 0).length;
  const weakSignalThreshold = 65;
  const {
    filteredAccounts,
    hasActiveFilters,
    indicatorFilterLabel,
    leadingIndicatorPressure,
  } = deriveCustomerSuccessPortfolioView({
    accountSort,
    indicatorFilter,
    portfolio,
    showOnlyWeakSignals,
    weakSignalThreshold,
  });

  async function syncRelationshipData() {
    setSyncError(null);
    setSyncMessage(null);
    setSyncingRelationships(true);
    try {
      const response = await fetch("/api/retention/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: "full" }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; completed?: string[] };
      if (!response.ok) {
        throw new Error(body.error || `Retention sync failed (${response.status})`);
      }
      await resource.refresh();
      setSyncMessage(
        body.completed && body.completed.length > 0
          ? `Relationship data synced: ${body.completed.join(", ")}`
          : "Relationship data synced."
      );
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Retention sync failed");
    } finally {
      setSyncingRelationships(false);
    }
  }

  return (
    <div className="space-y-4">
      {resource.stale && resource.error ? (
        <DashboardStaleBanner
          label={resource.error}
          lastUpdatedAt={resource.lastUpdatedAt}
          onRefresh={resource.refresh}
          refreshing={resource.refreshing}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Relationship Data</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Refresh the retention and Coda relationship overlay without leaving the portfolio.
              </p>
            </div>
            <button
              type="button"
              className="rounded-md border border-primary/40 bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
              disabled={syncingRelationships || resource.refreshing}
              onClick={() => {
                void syncRelationshipData();
              }}
            >
              {syncingRelationships ? "Syncing..." : "Sync relationship data"}
            </button>
          </div>
          {syncMessage ? <p className="mt-3 text-xs text-[var(--success)]">{syncMessage}</p> : null}
          {syncError ? <p className="mt-3 text-xs text-red-500">{syncError}</p> : null}
        </div>

        {portfolio.relationshipOps?.sources.length ? (
          <div className="rounded-xl border border-border bg-card p-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Relationship Freshness</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Last completed rebuild {formatDate(portfolio.relationshipOps.lastCompletedAt)}.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {portfolio.relationshipOps.sources.map((run) => (
                <span
                  key={run.source}
                  title={run.lastError || `${run.recordCount} records · ${run.mappedCount} mapped`}
                  className={`rounded-full border px-2 py-1 text-[11px] ${syncRunTone(run.status)}`}
                >
                  {run.source.toLowerCase()} {run.status.toLowerCase()}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <PortfolioSummaryCards
        accountsWithCoda={accountsWithCoda}
        avgHealthScore={portfolio.summary.avgHealthScore}
        atRiskAccounts={portfolio.summary.atRiskAccounts}
        coverageGaps={coverageGaps}
        formatNumber={formatNumber}
        healthTone={healthTone}
        openAlerts={portfolio.summary.openAlerts}
        totalAccounts={portfolio.summary.totalAccounts}
      />

      <LeadingIndicatorPressurePanel
        formatNumber={formatNumber}
        indicatorFilter={indicatorFilter}
        leadingIndicatorPressure={leadingIndicatorPressure}
        onToggleIndicator={(key) => setIndicatorFilter((current) => (current === key ? null : key))}
        threshold={weakSignalThreshold}
      />

      <div className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
        <PortfolioHealthDistributionPanel
          formatNumber={formatNumber}
          healthDistribution={portfolio.healthDistribution}
        />

        <PortfolioAttentionQueuePanel
          attentionAccounts={portfolio.attentionAccounts}
          formatNumber={formatNumber}
          healthTone={healthTone}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PortfolioAlertsPanel alerts={portfolio.alerts} />

        <PortfolioRecentActivityPanel
          formatDate={formatDate}
          recentActivity={portfolio.recentActivity}
        />
      </div>

      <PortfolioAccountsTable
        accountSort={accountSort}
        filteredAccounts={filteredAccounts}
        formatDate={formatDate}
        formatNumber={formatNumber}
        generatedAt={portfolio.generatedAt}
        hasActiveFilters={hasActiveFilters}
        healthTone={healthTone}
        indicatorFilterLabel={indicatorFilterLabel}
        onClearFilters={clearFilters}
        onSetSort={setAccountSort}
        onToggleWeakSignals={setShowOnlyWeakSignals}
        showOnlyWeakSignals={showOnlyWeakSignals}
        threshold={weakSignalThreshold}
      />
    </div>
  );
}
