"use client";

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

      <PortfolioSummaryCards
        avgHealthScore={portfolio.summary.avgHealthScore}
        atRiskAccounts={portfolio.summary.atRiskAccounts}
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
