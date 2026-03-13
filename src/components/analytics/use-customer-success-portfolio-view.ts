"use client";

import { useEffect, useState } from "react";
import type { CustomerSuccessPortfolio } from "@/lib/customer-success/types";

export type PortfolioSort = "primary-signal" | "health" | "alerts" | "renewal";
export type LeadingIndicatorKey = keyof CustomerSuccessPortfolio["accounts"][number]["health"]["leadingIndicators"];

const PORTFOLIO_SORT_STORAGE_KEY = "customer-success:portfolio:sort";
const PORTFOLIO_WEAK_SIGNAL_STORAGE_KEY = "customer-success:portfolio:weak-signal-only";
const PORTFOLIO_INDICATOR_FILTER_STORAGE_KEY = "customer-success:portfolio:indicator-filter";

function readStoredPortfolioSort(): PortfolioSort {
  if (typeof window === "undefined") return "primary-signal";
  const raw = window.sessionStorage.getItem(PORTFOLIO_SORT_STORAGE_KEY);
  if (raw === "primary-signal" || raw === "health" || raw === "alerts" || raw === "renewal") {
    return raw;
  }
  return "primary-signal";
}

function readStoredWeakSignalFilter(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(PORTFOLIO_WEAK_SIGNAL_STORAGE_KEY) === "true";
}

function readStoredIndicatorFilter(): LeadingIndicatorKey | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(PORTFOLIO_INDICATOR_FILTER_STORAGE_KEY);
  if (
    raw === "recency" ||
    raw === "cadence" ||
    raw === "consistency" ||
    raw === "depth" ||
    raw === "breadth"
  ) {
    return raw;
  }
  return null;
}

export function useCustomerSuccessPortfolioView() {
  const [accountSort, setAccountSort] = useState<PortfolioSort>(() => readStoredPortfolioSort());
  const [showOnlyWeakSignals, setShowOnlyWeakSignals] = useState<boolean>(() => readStoredWeakSignalFilter());
  const [indicatorFilter, setIndicatorFilter] = useState<LeadingIndicatorKey | null>(() => readStoredIndicatorFilter());

  useEffect(() => {
    window.sessionStorage.setItem(PORTFOLIO_SORT_STORAGE_KEY, accountSort);
  }, [accountSort]);

  useEffect(() => {
    window.sessionStorage.setItem(PORTFOLIO_WEAK_SIGNAL_STORAGE_KEY, String(showOnlyWeakSignals));
  }, [showOnlyWeakSignals]);

  useEffect(() => {
    if (indicatorFilter) {
      window.sessionStorage.setItem(PORTFOLIO_INDICATOR_FILTER_STORAGE_KEY, indicatorFilter);
      return;
    }
    window.sessionStorage.removeItem(PORTFOLIO_INDICATOR_FILTER_STORAGE_KEY);
  }, [indicatorFilter]);

  return {
    accountSort,
    setAccountSort,
    showOnlyWeakSignals,
    setShowOnlyWeakSignals,
    indicatorFilter,
    setIndicatorFilter,
    clearFilters() {
      setAccountSort("primary-signal");
      setShowOnlyWeakSignals(false);
      setIndicatorFilter(null);
    },
  };
}
