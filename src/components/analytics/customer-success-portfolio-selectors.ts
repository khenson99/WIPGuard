import type { CustomerSuccessPortfolio } from "@/lib/customer-success/types";
import type {
  LeadingIndicatorKey,
  PortfolioSort,
} from "@/components/analytics/use-customer-success-portfolio-view";
import {
  buildLeadingIndicatorPressure,
  weakestLeadingIndicator,
} from "@/components/analytics/customer-success-portfolio-utils";

export function deriveCustomerSuccessPortfolioView(input: {
  accountSort: PortfolioSort;
  indicatorFilter: LeadingIndicatorKey | null;
  portfolio: CustomerSuccessPortfolio;
  showOnlyWeakSignals: boolean;
  weakSignalThreshold: number;
}) {
  const { accountSort, indicatorFilter, portfolio, showOnlyWeakSignals, weakSignalThreshold } = input;

  const leadingIndicatorPressure = buildLeadingIndicatorPressure(portfolio.accounts, weakSignalThreshold);
  const hasActiveFilters =
    accountSort !== "primary-signal" || showOnlyWeakSignals || indicatorFilter !== null;

  const sortedAccounts = [...portfolio.accounts].sort((left, right) => {
    if (accountSort === "primary-signal") {
      return weakestLeadingIndicator(left.health).score - weakestLeadingIndicator(right.health).score;
    }

    if (accountSort === "health") {
      return left.health.score - right.health.score;
    }

    if (accountSort === "alerts") {
      return right.openAlertCount - left.openAlertCount;
    }

    const leftRenewal = left.renewalDate ? new Date(left.renewalDate).getTime() : Number.POSITIVE_INFINITY;
    const rightRenewal = right.renewalDate ? new Date(right.renewalDate).getTime() : Number.POSITIVE_INFINITY;
    return leftRenewal - rightRenewal;
  });

  const filteredAccounts = sortedAccounts.filter((account) => {
    if (indicatorFilter && account.health.leadingIndicators[indicatorFilter].score >= weakSignalThreshold) {
      return false;
    }
    if (showOnlyWeakSignals && weakestLeadingIndicator(account.health).score >= weakSignalThreshold) {
      return false;
    }
    return true;
  });

  const indicatorFilterLabel = indicatorFilter
    ? portfolio.accounts[0]?.health.leadingIndicators[indicatorFilter].label ?? indicatorFilter
    : null;

  return {
    filteredAccounts,
    hasActiveFilters,
    indicatorFilterLabel,
    leadingIndicatorPressure,
  };
}
