/**
 * Maps the prototype's string icon names (`prototype/app/icons.jsx`) to
 * lucide-react components, plus the per-metric-key icon mapping.
 */

import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CircleCheck,
  Code2,
  DollarSign,
  Flame,
  Gauge,
  Heart,
  LineChart,
  Percent,
  Plug,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export const ICONS: Record<string, LucideIcon> = {
  "trending-up": TrendingUp,
  "trending-down": TrendingDown,
  dollar: DollarSign,
  gauge: Gauge,
  wallet: Wallet,
  flame: Flame,
  users: Users,
  target: Target,
  percent: Percent,
  activity: Activity,
  "line-chart": LineChart,
  "bar-chart": BarChart3,
  "shield-check": ShieldCheck,
  alert: AlertTriangle,
  plug: Plug,
  sparkles: Sparkles,
  "arrow-up-right": ArrowUpRight,
  heart: Heart,
  code: Code2,
  "circle-check": CircleCheck,
  receipt: ReceiptText,
};

const METRIC_ICON: Record<string, string> = {
  "revenue.arr": "trending-up",
  "revenue.mrr": "dollar",
  "revenue.total_revenue": "dollar",
  "revenue.subscription_revenue": "receipt",
  "revenue.services_revenue": "receipt",
  "finance.cash_balance": "wallet",
  "finance.cash_runway_months": "gauge",
  "finance.net_burn": "flame",
  "finance.expenses": "receipt",
  "finance.gross_margin": "percent",
  "revenue.active_subscriptions": "circle-check",
  "revenue.customer_count": "users",
  "sales.qualified_pipeline": "target",
  "sales.demos": "target",
  "marketing.website_traffic": "line-chart",
  "marketing.conversion_rate": "percent",
  "marketing.pipeline_efficiency": "trending-up",
  "development.delivery_health": "code",
  "product.activation_rate": "sparkles",
  "customer_success.customer_health": "heart",
  "customer_success.customer_activity": "activity",
  "customer_success.churn_rate": "trending-down",
  "customer_success.retention_rate": "shield-check",
  "customer_success.retention_risk": "alert",
};

export function metricIconName(key: string): string {
  return METRIC_ICON[key] ?? "bar-chart";
}

export function metricIcon(key: string): LucideIcon {
  return ICONS[metricIconName(key)] ?? BarChart3;
}

/** Render a metric's lucide icon by key (declared at module scope so the
 *  component instance is stable across renders). */
export function MetricIcon({ metricKey, size = 14 }: { metricKey: string; size?: number }) {
  const Icon = ICONS[metricIconName(metricKey)] ?? BarChart3;
  return <Icon size={size} />;
}
