# KPI Catalog (Canonical Metric Keys)

This document defines the **single source of truth** for user-facing KPI values. All dashboards should prefer `kpis.*` fields returned by API routes over recomputing the same number in multiple places.

## Task KPIs

### `kpis.tasks.total`
- **Definition:** Total number of tasks across all statuses.
- **Source inputs:** `prisma.task.groupBy({ by: ["status"] ... })`
- **Computed in:** `/api/dashboard`, `/api/dashboard/personalized` (as `taskTotal`)

### `kpis.tasks.inProgress`
- **Definition:** Count of tasks in `ACTIVE` + `WORKING_ON_TODAY`.
- **Source inputs:** task status overview.
- **Computed in:** `/api/dashboard`

### `kpis.tasks.overdue`
- **Definition:** Count of tasks with `dueDate < now` and `status !== DONE`.
- **Computed in:** `/api/dashboard`, `/api/dashboard/personalized` (team overdue), `/api/projects/[id]` (project overdue)

### `kpis.tasks.stale`
- **Definition:** Count of tasks with `updatedAt < now - 21 days` in active statuses (`ACTIVE`, `WORKING_ON_TODAY`, `QUEUED`) or the relevant view’s task set.
- **Computed in:** `/api/dashboard`, `/api/dashboard/personalized`, `/api/standup`

### `kpis.tasks.blockedHybrid`
- **Definition:** Count of blocked tasks where **blocked** = `status === NOT_DONE` **OR** has any dependency where `dep.status !== DONE`.
- **Computed in:** `/api/dashboard`, `/api/dashboard/personalized`, `/api/standup`, `/api/projects/[id]`

## Analytics KPIs

### `kpis.finance.mrr`
- **Definition:** Monthly recurring revenue.
- **Source inputs:** `stripe.revenue.mrr`
- **Computed in:** `/api/analytics`

### `kpis.finance.arr`
- **Definition:** Annual recurring revenue.
- **Definition detail:** `ARR = MRR * 12`
- **Computed in:** `/api/analytics`

### `kpis.finance.paymentSuccessPct`
- **Definition:** Stripe payment success rate for the selected range, in **percent** (0–100).
- **Source inputs:** `stripe.payments.successRate`
- **Computed in:** `/api/analytics`

### `kpis.finance.churnRatePct`
- **Definition:** Stripe churn rate, in **percent** (0–100).
- **Source inputs:** `stripe.subscriptions.churnRate`
- **Computed in:** `/api/analytics`

### `kpis.finance.revenueGrowthPct`
- **Definition:** Stripe revenue growth (30d vs previous 30d), in **percent** (0–100).
- **Source inputs:** `stripe.revenue.revenueGrowth`
- **Computed in:** `/api/analytics`

### `kpis.finance.runwayMonths`
- **Definition:** Cash runway in months, based on Mercury cash flow model.
- **Source inputs:** `mercury.cashFlow.runway`
- **Computed in:** `/api/analytics`

### `kpis.finance.runwayMonthsCapped24`
- **Definition:** `runwayMonths` clamped to 24 for UI gauges that use a 0–24 scale.
- **Source inputs:** `kpis.finance.runwayMonths`
- **Computed in:** `/api/analytics`

### `kpis.sales.totalDeals`
- **Definition:** Total deals returned by HubSpot funnel snapshot.
- **Source inputs:** `hubspot.funnel.totalDeals`
- **Computed in:** `/api/analytics`

### `kpis.sales.activeDeals`
- **Definition:** Deals currently in non-terminal stages (excludes `Closed Won`, `Closed Lost`, `Unlikely`, `Churn`, `Ping Later`, `On Hold`).
- **Source inputs:** `hubspot.deals[*].stageLabel`
- **Computed in:** `/api/analytics`

### `kpis.sales.winRatePct`
- **Definition:** Sales win rate, in **percent** (0–100).
- **Source inputs:** `hubspot.funnel.winRate`
- **Computed in:** `/api/analytics`

### `kpis.sales.noShowRatePct`
- **Definition:** Demo no-show rate, in **percent** (0–100).
- **Source inputs:** `hubspot.funnel.noShowRate`
- **Computed in:** `/api/analytics`

### `kpis.demo.demosInPipeline`
- **Definition:** Deals currently in demo pipeline stages (`Demo Scheduled`, `No-Show/Reschedule`, `Demo Follow-Up`).
- **Source inputs:** `hubspot.deals[*].stageLabel`
- **Computed in:** `/api/analytics`

### `kpis.demo.demosScheduledInRange`
- **Definition:** Demo records whose `scheduledAt` falls within the selected analytics time range.
- **Source inputs:** `demoAnalytics.demos[*].scheduledAt`, `timeRange.from/to`
- **Computed in:** `/api/analytics`

### `kpis.demo.avgConversionRatePct`
- **Definition:** Average demo conversion rate across `demoAnalytics.bySource`, in **percent** (0–100).
- **Source inputs:** `demoAnalytics.bySource[*].conversionRate`
- **Computed in:** `/api/analytics`

### `kpis.traffic.bounceRatePct`
- **Definition:** Google Analytics bounce rate in **percent** (0–100).
- **Source inputs:** `googleAnalytics.bounceRate` (ratio) × 100
- **Computed in:** `/api/analytics`

### `kpis.traffic.avgSessionDurationSeconds`
- **Definition:** Google Analytics average session duration in seconds.
- **Source inputs:** `googleAnalytics.avgSessionDuration`
- **Computed in:** `/api/analytics`

### `kpis.traffic.avgSessionDurationLabel`
- **Definition:** `avgSessionDurationSeconds` formatted as `"Xm Ys"`.
- **Computed in:** `/api/analytics`

### `kpis.traffic.pagesPerSession`
- **Definition:** Pages per session (pageviews / sessions), raw ratio.
- **Source inputs:** `googleAnalytics.pageviews30d`, `googleAnalytics.sessions30d`
- **Computed in:** `/api/analytics`

### `kpis.traffic.engagementScore`
- **Definition:** Engagement score (0–100) derived from bounce rate: `100 - bounceRatePct`.
- **Computed in:** `/api/analytics`

### `kpis.traffic.pageDepthScore`
- **Definition:** Page-depth score (0–100) derived from pages per session: `round(pagesPerSession * 20)` clamped to 100.
- **Computed in:** `/api/analytics`

### `kpis.ads.google.roasScore`
- **Definition:** ROAS score (0–100) computed as `min(googleAds.roas * 10, 100)`.
- **Source inputs:** `googleAds.roas`
- **Computed in:** `/api/analytics`

### `kpis.ads.google.cpaScore`
- **Definition:** CPA score (0–100) computed using the same canonical formula as the Google Ads efficiency KPI card.
- **Source inputs:** `googleAds.cpa`, `googleAds.totalSpend30d`, `googleAds.totalConversions`
- **Computed in:** `/api/analytics`

### `kpis.ads.meta.cpaScore`
- **Definition:** Meta CPA score (0–100) computed as `min(100 - (metaAds.cpa / 100) * 50, 100)`.
- **Source inputs:** `metaAds.cpa`
- **Computed in:** `/api/analytics`

### `kpis.ads.meta.engagementScore`
- **Definition:** Meta engagement score (0–100) computed as `min(metaAds.ctr * 25, 100)`.
- **Source inputs:** `metaAds.ctr`
- **Computed in:** `/api/analytics`

### `kpis.ads.reddit.ctrScore`
- **Definition:** Reddit CTR score (0–100) computed as `min(redditAds.ctr * 50, 100)`.
- **Source inputs:** `redditAds.ctr`
- **Computed in:** `/api/analytics`

### `kpis.ads.reddit.cpcScore`
- **Definition:** Reddit CPC score (0–100) computed as `min(100 - (redditAds.cpc / 10) * 50, 100)`.
- **Source inputs:** `redditAds.cpc`
- **Computed in:** `/api/analytics`

### `kpis.ops.failureRatioPctByProvider`
- **Definition:** Per-provider failure ratio in **percent** (0–100): `failuresInRange / max(1, eventsInRange) * 100`.
- **Source inputs:** `googleWorkspace|slack|hubspotOps|codaOps|redditOps` telemetry.
- **Computed in:** `/api/analytics`

### `kpis.support.avgFirstResponseMinutes`
- **Definition:** Average first response time in minutes.
- **Source inputs:** `pylon.avgFirstResponseMinutes`
- **Computed in:** `/api/analytics`

### `kpis.support.avgFirstResponseLabel`
- **Definition:** `avgFirstResponseMinutes` formatted as `"X min"`.
- **Computed in:** `/api/analytics`

### `kpis.support.csatScore`
- **Definition:** CSAT score as a 1–5 value.
- **Source inputs:** `pylon.csat`
- **Computed in:** `/api/analytics`

### `kpis.support.csatPct`
- **Definition:** CSAT score normalized to 0–100: `(csatScore / 5) * 100`.
- **Computed in:** `/api/analytics`

### `kpis.ai.criticalCount`
- **Definition:** Count of AI insights with `severity === "critical"`.
- **Source inputs:** `aiInsights.global[*].severity`
- **Computed in:** `/api/analytics`

### `kpis.ai.warningCount`
- **Definition:** Count of AI insights with `severity === "warning"`.
- **Source inputs:** `aiInsights.global[*].severity`
- **Computed in:** `/api/analytics`

### `kpis.ai.infoCount`
- **Definition:** Count of AI insights with `severity === "info"`.
- **Source inputs:** `aiInsights.global[*].severity`
- **Computed in:** `/api/analytics`

### `kpis.ai.avgConfidencePct`
- **Definition:** Average AI insight confidence (0–100), rounded to an integer.
- **Source inputs:** `aiInsights.global[*].confidence`
- **Computed in:** `/api/analytics`

## Inventory

See `docs/kpi-inventory.md` for a generated scan of UI KPI displays and API KPI-like fields.
