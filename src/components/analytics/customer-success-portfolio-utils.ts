import type { CustomerSuccessPortfolio } from "@/lib/customer-success/types";
import type { LeadingIndicatorKey } from "@/components/analytics/use-customer-success-portfolio-view";

export function weakestLeadingIndicator(
  health: CustomerSuccessPortfolio["accounts"][number]["health"]
): { label: string; value: string; score: number } {
  const [, indicator] =
    Object.entries(health.leadingIndicators).sort(([, left], [, right]) => left.score - right.score)[0] ?? [];

  return {
    label: indicator?.label ?? "No signal",
    value: indicator?.value ?? "—",
    score: indicator?.score ?? 100,
  };
}

export function buildLeadingIndicatorPressure(
  accounts: CustomerSuccessPortfolio["accounts"],
  threshold: number
): Array<{ key: LeadingIndicatorKey; label: string; count: number }> {
  const labels = new Map<string, string>();
  const counts = new Map<string, number>();

  accounts.forEach((account) => {
    Object.entries(account.health.leadingIndicators).forEach(([key, indicator]) => {
      labels.set(key, indicator.label);
      if (indicator.score < threshold) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    });
  });

  return Array.from(labels.entries())
    .map(([key, label]) => ({
      key: key as LeadingIndicatorKey,
      label,
      count: counts.get(key) ?? 0,
    }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.label.localeCompare(right.label);
    });
}
