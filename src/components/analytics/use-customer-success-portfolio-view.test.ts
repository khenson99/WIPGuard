import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useCustomerSuccessPortfolioView } from "@/components/analytics/use-customer-success-portfolio-view";

describe("useCustomerSuccessPortfolioView", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("uses default portfolio view state when nothing is stored", async () => {
    const { result } = renderHook(() => useCustomerSuccessPortfolioView());

    expect(result.current.accountSort).toBe("primary-signal");
    expect(result.current.showOnlyWeakSignals).toBe(false);
    expect(result.current.indicatorFilter).toBeNull();

    await waitFor(() => {
      expect(window.sessionStorage.getItem("customer-success:portfolio:sort")).toBe("primary-signal");
      expect(window.sessionStorage.getItem("customer-success:portfolio:weak-signal-only")).toBe("false");
      expect(window.sessionStorage.getItem("customer-success:portfolio:indicator-filter")).toBeNull();
    });
  });

  it("hydrates valid stored values and ignores invalid ones", () => {
    window.sessionStorage.setItem("customer-success:portfolio:sort", "alerts");
    window.sessionStorage.setItem("customer-success:portfolio:weak-signal-only", "true");
    window.sessionStorage.setItem("customer-success:portfolio:indicator-filter", "depth");

    const valid = renderHook(() => useCustomerSuccessPortfolioView());

    expect(valid.result.current.accountSort).toBe("alerts");
    expect(valid.result.current.showOnlyWeakSignals).toBe(true);
    expect(valid.result.current.indicatorFilter).toBe("depth");

    valid.unmount();
    window.sessionStorage.setItem("customer-success:portfolio:sort", "bogus");
    window.sessionStorage.setItem("customer-success:portfolio:weak-signal-only", "not-bool");
    window.sessionStorage.setItem("customer-success:portfolio:indicator-filter", "bogus");

    const invalid = renderHook(() => useCustomerSuccessPortfolioView());

    expect(invalid.result.current.accountSort).toBe("primary-signal");
    expect(invalid.result.current.showOnlyWeakSignals).toBe(false);
    expect(invalid.result.current.indicatorFilter).toBeNull();
  });

  it("persists updates and clearFilters resets the stored state", async () => {
    const { result } = renderHook(() => useCustomerSuccessPortfolioView());

    act(() => {
      result.current.setAccountSort("health");
      result.current.setShowOnlyWeakSignals(true);
      result.current.setIndicatorFilter("recency");
    });

    await waitFor(() => {
      expect(window.sessionStorage.getItem("customer-success:portfolio:sort")).toBe("health");
      expect(window.sessionStorage.getItem("customer-success:portfolio:weak-signal-only")).toBe("true");
      expect(window.sessionStorage.getItem("customer-success:portfolio:indicator-filter")).toBe("recency");
    });

    act(() => {
      result.current.clearFilters();
    });

    expect(result.current.accountSort).toBe("primary-signal");
    expect(result.current.showOnlyWeakSignals).toBe(false);
    expect(result.current.indicatorFilter).toBeNull();

    await waitFor(() => {
      expect(window.sessionStorage.getItem("customer-success:portfolio:sort")).toBe("primary-signal");
      expect(window.sessionStorage.getItem("customer-success:portfolio:weak-signal-only")).toBe("false");
      expect(window.sessionStorage.getItem("customer-success:portfolio:indicator-filter")).toBeNull();
    });
  });
});
