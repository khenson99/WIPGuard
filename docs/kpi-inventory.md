# KPI Inventory

Generated at: 2026-02-28T11:45:31.041Z

| kind | area | file:line | label | fieldPath | expression |
|---|---|---|---|---|---|
| api | dashboard | src/app/api/dashboard/route.ts:223 |  | velocity | `{
        thisWeek: recentlyCompleted.length,
        lastWeek: lastWeekCompleted,
      }` |
| api | dashboard | src/app/api/dashboard/personalized/route.ts:202 |  | team.staleTasks | `staleTeam` |
| api | dashboard | src/app/api/dashboard/personalized/route.ts:203 |  | team.blockedTasks | `blockedTeam` |
| api | dashboard | src/app/api/dashboard/personalized/route.ts:204 |  | team.overdueTasks | `overdueTeam` |
| api | api | src/app/api/deals/analytics/route.ts:211 |  | velocity | `{ avgDaysPerStage, avgTotalDays, trend: velocityTrend }` |
| api | api | src/app/api/deals/analytics/route.ts:213 |  | closeRate | `closeRateData` |
| api | api | src/app/api/integrations/slack/notifications/route.ts:69 |  | summary.total | `results.length` |
| api | api | src/app/api/logbook/route.ts:65 |  | pagination.totalPages | `Math.ceil(total / limit)` |
| api | api | src/app/api/migration/coda/route.ts:203 |  | totalMigrationReceipts | `0` |
| api | api | src/app/api/migration/coda/route.ts:228 |  | totalMigrationReceipts | `receipts.length` |
| api | api | src/app/api/migration/coda/route.ts:455 |  | summary.totalSourceRows | `result.totalSourceRows` |
| api | api | src/app/api/policy/audit/route.ts:48 |  | pagination.totalPages | `Math.ceil(total / limit)` |
| api | api | src/app/api/release/status/route.ts:90 |  | readiness.blockerCount | `evaluation.blockers.length` |
| api | api | src/app/api/release/status/route.ts:91 |  | readiness.warningCount | `evaluation.warnings.length` |
| api | standup | src/app/api/standup/route.ts:203 |  | totalActive | `activeTasks.length` |
| ui | analytics | src/components/analytics/finance-stripe-tab.tsx:129 | MRR |  | `fmt$(revenue.mrr)` |
| ui | analytics | src/components/analytics/finance-stripe-tab.tsx:136 | Revenue (30d) |  | `fmt$(revenue.totalRevenue30d)` |
| ui | analytics | src/components/analytics/finance-stripe-tab.tsx:144 | Active Subs |  | `subscriptions.active.toLocaleString()` |
| ui | analytics | src/components/analytics/finance-stripe-tab.tsx:150 | Trialing |  | `subscriptions.trialing.toLocaleString()` |
| ui | analytics | src/components/analytics/finance-stripe-tab.tsx:155 | Past Due |  | `subscriptions.pastDue.toLocaleString()` |
| ui | analytics | src/components/analytics/finance-stripe-tab.tsx:162 | Canceled |  | `subscriptions.canceled.toLocaleString()` |
| ui | analytics | src/components/analytics/finance-stripe-tab.tsx:167 | Churn Rate |  | `fmtPct(churnRatePct)` |
| ui | analytics | src/components/analytics/finance-stripe-tab.tsx:173 | Payment Success |  | `fmtPct(paymentSuccessPct)` |
| ui | analytics | src/components/analytics/finance-stripe-tab.tsx:208 | Active |  | `subscriptions.active` |
| ui | analytics | src/components/analytics/finance-stripe-tab.tsx:209 | Trialing |  | `subscriptions.trialing` |
| ui | analytics | src/components/analytics/finance-stripe-tab.tsx:210 | Past Due |  | `subscriptions.pastDue` |
| ui | analytics | src/components/analytics/finance-stripe-tab.tsx:211 | Canceled |  | `subscriptions.canceled` |
| ui | analytics | src/components/analytics/finance-stripe-tab.tsx:230 | Success Rate |  | `paymentSuccessPct` |
| ui | analytics | src/components/analytics/finance-hubspot-tab.tsx:192 | Total Deals |  | `funnel.totalDeals.toLocaleString()` |
| ui | analytics | src/components/analytics/finance-hubspot-tab.tsx:197 | Closed Won |  | `funnel.closedWon.toLocaleString()` |
| ui | analytics | src/components/analytics/finance-hubspot-tab.tsx:203 | Active Subs |  | `funnel.activeSubscriptions.toLocaleString()` |
| ui | analytics | src/components/analytics/finance-hubspot-tab.tsx:208 | Avg Deal Size |  | `fmt$(funnel.avgDealSize)` |
| ui | analytics | src/components/analytics/finance-hubspot-tab.tsx:213 | Win Rate |  | `fmtPct(funnel.winRate)` |
| ui | analytics | src/components/analytics/finance-hubspot-tab.tsx:220 | No-Show Rate |  | `fmtPct(funnel.noShowRate)` |
| ui | analytics | src/components/analytics/finance-hubspot-tab.tsx:227 | Churn |  | `funnel.churn.toLocaleString()` |
| ui | analytics | src/components/analytics/finance-hubspot-tab.tsx:234 | Pipeline Value |  | `fmt$(totalPipelineValue)` |
| ui | analytics | src/components/analytics/finance-hubspot-tab.tsx:281 | stage.label.length > 14 ? stage.label.slice(0, 12) + "..." : stage.label |  | `stage.count` |
| ui | analytics | src/components/analytics/sales-funnel-tab.tsx:65 | Total Deals |  | `(kpis?.sales.totalDeals ?? funnel.totalDeals).toLocaleString()` |
| ui | analytics | src/components/analytics/sales-funnel-tab.tsx:70 | Win Rate |  | ``${funnel.winRate.toFixed(1)}%`` |
| ui | analytics | src/components/analytics/sales-funnel-tab.tsx:77 | Effective Win Rate |  | ``${funnel.effectiveWinRate.toFixed(1)}%`` |
| ui | analytics | src/components/analytics/sales-funnel-tab.tsx:83 | No-Show Rate |  | ``${funnel.noShowRate.toFixed(1)}%`` |
| ui | analytics | src/components/analytics/sales-funnel-tab.tsx:90 | Avg Deal Size |  | `fmt$(funnel.avgDealSize)` |
| ui | analytics | src/components/analytics/sales-funnel-tab.tsx:187 | Win Rate |  | `funnel.winRate` |
| ui | analytics | src/components/analytics/sales-funnel-tab.tsx:188 | Loss Rate |  | `100 - funnel.winRate` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:158 | Total Rules |  | `fmtInt(telemetry.totalRules)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:158 | Enabled Rules |  | `fmtInt(telemetry.enabledRules)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:158 | Errored Rules |  | `fmtInt(telemetry.erroredRules)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:158 | Events in Range |  | `fmtInt(telemetry.eventsInRange)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:158 | Receipts |  | `fmtInt(telemetry.receiptsInRange)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:158 | Tasks Created |  | `fmtInt(telemetry.tasksCreatedInRange)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:158 | Failures |  | `fmtInt(telemetry.failuresInRange)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:158 | Failure Ratio |  | `fmtPct(failureRatioPct)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:247 | Total Cards |  | `fmtInt(coda.totalCards)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:247 | Unique Statuses |  | `fmtInt(coda.cardsByStatus.length)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:247 | Recent Cards |  | `fmtInt(coda.recentCards.length)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:247 | Top Status |  | `coda.cardsByStatus.length ? coda.cardsByStatus[0].status : "—"` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:487 | Sessions (30d) |  | `fmtInt(ga.sessions30d)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:487 | Users (30d) |  | `fmtInt(ga.users30d)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:487 | Pageviews |  | `fmtInt(ga.pageviews30d)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:487 | Bounce Rate |  | `fmtPct(bounceRatePct)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:487 | Avg Session |  | `avgSessionLabel` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:487 | Top Channels |  | `fmtInt(ga.trafficByChannel.length)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:538 | Ad Spend |  | `fmtCurrency(googleAds.totalSpend30d)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:538 | Impressions |  | `fmtInt(googleAds.totalImpressions)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:538 | Clicks |  | `fmtInt(googleAds.totalClicks)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:538 | Conversions |  | `fmtInt(googleAds.totalConversions)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:538 | CTR |  | `fmtPct(googleAds.ctr)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:538 | CPC |  | `fmtCurrency(googleAds.cpc)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:538 | CPA |  | `fmtCurrency(googleAds.cpa)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:538 | ROAS |  | `googleAds.roas.toFixed(2)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:564 | Ad Spend |  | `fmtCurrency(metaAds.totalSpend30d)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:564 | Impressions |  | `fmtInt(metaAds.totalImpressions)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:564 | Clicks |  | `fmtInt(metaAds.totalClicks)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:564 | Conversions |  | `fmtInt(metaAds.totalConversions)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:564 | CTR |  | `fmtPct(metaAds.ctr)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:564 | CPC |  | `fmtCurrency(metaAds.cpc)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:564 | CPA |  | `fmtCurrency(metaAds.cpa)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:564 | Campaigns |  | `fmtInt(metaAds.campaigns.length)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:590 | Ad Spend |  | `fmtCurrency(redditAds.totalSpend30d)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:590 | Impressions |  | `fmtInt(redditAds.totalImpressions)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:590 | Clicks |  | `fmtInt(redditAds.totalClicks)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:590 | CTR |  | `fmtPct(redditAds.ctr)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:590 | CPC |  | `fmtCurrency(redditAds.cpc)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:590 | Campaigns |  | `fmtInt(redditAds.campaigns.length)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:620 | Site |  | `webflow.siteName \|\| "—"` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:620 | Pages |  | `fmtInt(webflow.totalPages)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:620 | Collections |  | `fmtInt(webflow.totalCollections)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:620 | Custom Domains |  | `fmtInt(webflow.customDomains.length)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:620 | Form Types |  | `fmtInt(webflow.formSubmissions.length)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:620 | Last Published |  | `webflow.lastPublished ? new Date(webflow.lastPublished).toLocaleDateString() : "—"` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:676 | Domain |  | `semrush.domain \|\| "—"` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:676 | Authority Score |  | `fmtInt(semrush.authorityScore)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:676 | Backlinks |  | `fmtInt(semrush.backlinks)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:676 | Organic Keywords |  | `fmtInt(semrush.organicKeywords)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:676 | Organic Traffic |  | `fmtInt(semrush.organicTraffic)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:676 | Paid Keywords |  | `fmtInt(semrush.paidKeywords)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:676 | Paid Traffic |  | `fmtInt(semrush.paidTraffic)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:676 | Traffic Cost |  | `fmtCurrency(semrush.organicTrafficCost + semrush.paidTrafficCost)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:743 | Total Balance |  | `fmtCurrency(mercury.cashFlow.totalBalance)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:743 | Inflows (30d) |  | `fmtCurrency(mercury.cashFlow.inflows30d)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:743 | Outflows (30d) |  | `fmtCurrency(mercury.cashFlow.outflows30d)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:743 | Net Cash Flow |  | `fmtCurrency(mercury.cashFlow.netCashFlow)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:743 | Runway |  | ``${mercury.cashFlow.runway.toFixed(1)} mo`` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:743 | Burn Rate |  | `fmtCurrency(mercury.cashFlow.burnRate)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:811 | MRR |  | `fmtCurrency(mrr)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:811 | Active Subs |  | `fmtInt(stripe.subscriptions.active)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:811 | Trialing |  | `fmtInt(stripe.subscriptions.trialing)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:811 | Past Due |  | `fmtInt(stripe.subscriptions.pastDue)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:811 | Churn Rate |  | `fmtRatio(stripe.subscriptions.churnRate)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:811 | Canceled |  | `fmtInt(stripe.subscriptions.canceled)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:811 | Payment Success |  | `fmtRatio(stripe.payments.successRate)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:811 | Failed Payments |  | `fmtInt(stripe.payments.failed)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:905 | Open Conversations |  | `fmtInt(pylon.openConversations)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:905 | Urgent |  | `fmtInt(pylon.urgentConversations)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:905 | Waiting on Team |  | `fmtInt(pylon.waitingOnTeam)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:905 | Resolved |  | `fmtInt(pylon.resolvedInRange)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:905 | Avg First Response |  | `avgFirstResponseLabel` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:905 | CSAT |  | `pylon.csat === null ? "—" : pylon.csat.toFixed(2)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:939 | Active Contributors |  | `fmtInt(product.activeContributors)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:939 | Created Tasks |  | `fmtInt(product.createdTasksInRange)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:939 | Completed Tasks |  | `fmtInt(product.completedTasksInRange)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:939 | Overdue Open |  | `fmtInt(product.overdueOpenTasks)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:939 | Backlog Growth |  | `fmtInt(product.backlogGrowth)` |
| ui | analytics | src/components/analytics/integration-child-dashboards.tsx:939 | Throughput |  | `fmtRatio(product.throughputRate)` |
| ui | analytics | src/components/analytics/marketing-tab-new.tsx:345 | Sessions (30d) |  | `gaStatus.state === 'not_configured'
              ? "Not configured"
              : gaStatus.state === 'failing'
                ? "Configured but failing"
                : gaSta` |
| ui | analytics | src/components/analytics/marketing-tab-new.tsx:375 | Total Ad Spend |  | `!paidConfigured
              ? "Not configured"
              : paidFailure
                ? "Configured but failing"
                : paidHealthy
                  ? fmtCurrenc` |
| ui | analytics | src/components/analytics/marketing-tab-new.tsx:397 | Total Conversions |  | `!conversionConfigured
              ? "Not configured"
              : conversionFailure
                ? "Configured but failing"
                : conversionHealthy
            ` |
| ui | analytics | src/components/analytics/marketing-tab-new.tsx:419 | Page Followers |  | `metaPageStatus.state === 'not_configured'
              ? "Not configured"
              : metaPageStatus.state === 'failing'
                ? "Configured but failing"
           ` |
| ui | analytics | src/components/analytics/marketing-tab-new.tsx:1004 | Authority Score |  | `String(semrush!.authorityScore)` |
| ui | analytics | src/components/analytics/marketing-tab-new.tsx:1005 | Backlinks |  | `fmtNum(semrush!.backlinks)` |
| ui | analytics | src/components/analytics/marketing-tab-new.tsx:1006 | Organic Keywords |  | `fmtNum(semrush!.organicKeywords)` |
| ui | analytics | src/components/analytics/marketing-tab-new.tsx:1007 | Organic Traffic |  | `fmtNum(semrush!.organicTraffic)` |
| ui | analytics | src/components/analytics/finance-tab.tsx:356 | Monthly Recurring Revenue |  | `fmt$(mrr)` |
| ui | analytics | src/components/analytics/finance-tab.tsx:364 | Runway |  | `runway > 0 ? fmtMonths(runway) : "—"` |
| ui | analytics | src/components/analytics/finance-tab.tsx:370 | Cash Balance |  | `fmt$(cashBalance)` |
| ui | analytics | src/components/analytics/finance-tab.tsx:376 | Monthly Burn |  | `burnRate > 0 ? `${fmt$(burnRate)}/mo` : "—"` |
| ui | analytics | src/components/analytics/finance-tab.tsx:394 | Health Score |  | `health.score` |
| ui | analytics | src/components/analytics/finance-tab.tsx:688 | Payment Success Rate |  | `successRate` |
| ui | analytics | src/components/analytics/finance-tab.tsx:934 | Progress |  | `goal.progressPct` |
| ui | analytics | src/components/analytics/finance-mercury-tab.tsx:162 | Total Balance |  | `fmt$(cashFlow.totalBalance)` |
| ui | analytics | src/components/analytics/finance-mercury-tab.tsx:167 | Net Cash Flow |  | `fmt$(cashFlow.netCashFlow)` |
| ui | analytics | src/components/analytics/finance-mercury-tab.tsx:174 | Inflows (30d) |  | `fmt$(cashFlow.inflows30d)` |
| ui | analytics | src/components/analytics/finance-mercury-tab.tsx:179 | Outflows (30d) |  | `fmt$(cashFlow.outflows30d)` |
| ui | analytics | src/components/analytics/finance-mercury-tab.tsx:184 | Burn Rate |  | `fmt$(cashFlow.burnRate)` |
| ui | analytics | src/components/analytics/finance-mercury-tab.tsx:191 | Runway |  | `cashFlow.runway > 0 ? fmtRunway(cashFlow.runway) : "∞"` |
| ui | analytics | src/components/analytics/finance-mercury-tab.tsx:270 | Runway |  | `runwayCapped24` |
| ui | analytics | src/components/analytics/ads-google-analytics-tab.tsx:195 | Sessions |  | `fmtN(sessions30d)` |
| ui | analytics | src/components/analytics/ads-google-analytics-tab.tsx:203 | Users |  | `fmtN(users30d)` |
| ui | analytics | src/components/analytics/ads-google-analytics-tab.tsx:211 | Pageviews |  | `fmtN(pageviews30d)` |
| ui | analytics | src/components/analytics/ads-google-analytics-tab.tsx:219 | Bounce Rate |  | `fmtPct(bounceRatePct)` |
| ui | analytics | src/components/analytics/ads-google-analytics-tab.tsx:226 | Avg Session |  | `fmtDuration(avgSessionDuration / 60)` |
| ui | analytics | src/components/analytics/ads-google-analytics-tab.tsx:231 | Pages / Session |  | `pagesPerSession.toFixed(1)` |
| ui | analytics | src/components/analytics/ads-google-analytics-tab.tsx:317 | Engagement |  | `engagementScore` |
| ui | analytics | src/components/analytics/ads-google-analytics-tab.tsx:324 | Page Depth |  | `pageDepthScore` |
| ui | analytics | src/components/analytics/ads-google-ads-tab.tsx:194 | Total Spend |  | `fmt$(totalSpend30d)` |
| ui | analytics | src/components/analytics/ads-google-ads-tab.tsx:200 | Impressions |  | `fmtN(totalImpressions)` |
| ui | analytics | src/components/analytics/ads-google-ads-tab.tsx:205 | Clicks |  | `fmtN(totalClicks)` |
| ui | analytics | src/components/analytics/ads-google-ads-tab.tsx:210 | Conversions |  | `totalConversions.toLocaleString()` |
| ui | analytics | src/components/analytics/ads-google-ads-tab.tsx:215 | CTR |  | `fmtPct(ctr)` |
| ui | analytics | src/components/analytics/ads-google-ads-tab.tsx:221 | CPC |  | `fmtCurrency(cpc)` |
| ui | analytics | src/components/analytics/ads-google-ads-tab.tsx:226 | CPA |  | `totalConversions > 0 ? fmtCurrency(cpa) : "—"` |
| ui | analytics | src/components/analytics/ads-google-ads-tab.tsx:232 | ROAS |  | `roas > 0 ? `${roas.toFixed(2)}x` : "—"` |
| ui | analytics | src/components/analytics/ads-google-ads-tab.tsx:297 | ROAS |  | `kpis.ads.google.roasScore ?? 0` |
| ui | analytics | src/components/analytics/ads-google-ads-tab.tsx:305 | CPA Score |  | `kpis.ads.google.cpaScore ?? 0` |
| ui | analytics | src/components/analytics/ads-meta-ads-tab.tsx:183 | Total Spend |  | `fmt$(totalSpend30d)` |
| ui | analytics | src/components/analytics/ads-meta-ads-tab.tsx:189 | Impressions |  | `fmtN(totalImpressions)` |
| ui | analytics | src/components/analytics/ads-meta-ads-tab.tsx:194 | Clicks |  | `fmtN(totalClicks)` |
| ui | analytics | src/components/analytics/ads-meta-ads-tab.tsx:199 | Conversions |  | `totalConversions.toLocaleString()` |
| ui | analytics | src/components/analytics/ads-meta-ads-tab.tsx:204 | CTR |  | `fmtPct(ctr)` |
| ui | analytics | src/components/analytics/ads-meta-ads-tab.tsx:210 | CPC |  | `fmtCurrency(cpc)` |
| ui | analytics | src/components/analytics/ads-meta-ads-tab.tsx:215 | CPA |  | `totalConversions > 0 ? fmtCurrency(cpa) : "—"` |
| ui | analytics | src/components/analytics/ads-meta-ads-tab.tsx:280 | CPA Score |  | `kpis.ads.meta.cpaScore ?? 0` |
| ui | analytics | src/components/analytics/ads-meta-ads-tab.tsx:288 | Engagement |  | `kpis.ads.meta.engagementScore ?? 0` |
| ui | analytics | src/components/analytics/ads-reddit-ads-tab.tsx:178 | Total Spend |  | `fmt$(totalSpend30d)` |
| ui | analytics | src/components/analytics/ads-reddit-ads-tab.tsx:184 | Impressions |  | `fmtN(totalImpressions)` |
| ui | analytics | src/components/analytics/ads-reddit-ads-tab.tsx:189 | Clicks |  | `fmtN(totalClicks)` |
| ui | analytics | src/components/analytics/ads-reddit-ads-tab.tsx:194 | CTR |  | `fmtPct(ctr)` |
| ui | analytics | src/components/analytics/ads-reddit-ads-tab.tsx:200 | CPC |  | `fmtCurrency(cpc)` |
| ui | analytics | src/components/analytics/ads-reddit-ads-tab.tsx:205 | CPM |  | `cpm > 0 ? fmtCurrency(cpm) : "—"` |
| ui | analytics | src/components/analytics/ads-reddit-ads-tab.tsx:269 | CTR Score |  | `kpis.ads.reddit.ctrScore ?? 0` |
| ui | analytics | src/components/analytics/ads-reddit-ads-tab.tsx:276 | CPC Score |  | `kpis.ads.reddit.cpcScore ?? 0` |
| ui | analytics | src/components/analytics/ads-webflow-tab.tsx:139 | Total Pages |  | `totalPages.toString()` |
| ui | analytics | src/components/analytics/ads-webflow-tab.tsx:144 | CMS Collections |  | `totalCollections.toString()` |
| ui | analytics | src/components/analytics/ads-webflow-tab.tsx:149 | Form Submissions |  | `totalFormSubmissions.toString()` |
| ui | analytics | src/components/analytics/ads-webflow-tab.tsx:154 | Last Published |  | `lastPublished ? timeAgo(lastPublished) : "Never"` |
| ui | analytics | src/components/analytics/ads-semrush-tab.tsx:189 | Authority Score |  | ``${authorityScore}/100`` |
| ui | analytics | src/components/analytics/ads-semrush-tab.tsx:195 | Backlinks |  | `fmtN(backlinks)` |
| ui | analytics | src/components/analytics/ads-semrush-tab.tsx:200 | Organic Keywords |  | `fmtN(organicKeywords)` |
| ui | analytics | src/components/analytics/ads-semrush-tab.tsx:205 | Organic Traffic |  | `fmtN(organicTraffic)` |
| ui | analytics | src/components/analytics/ads-semrush-tab.tsx:211 | Organic Traffic Cost |  | `fmt$(organicTrafficCost)` |
| ui | analytics | src/components/analytics/ads-semrush-tab.tsx:217 | Paid Keywords |  | `fmtN(paidKeywords)` |
| ui | analytics | src/components/analytics/ads-semrush-tab.tsx:222 | Paid Traffic |  | `fmtN(paidTraffic)` |
| ui | analytics | src/components/analytics/ads-semrush-tab.tsx:227 | Paid Traffic Cost |  | `fmt$(paidTrafficCost)` |
| ui | analytics | src/components/analytics/ads-semrush-tab.tsx:239 | Authority |  | `authorityScore` |
| ui | analytics | src/components/analytics/ads-coda-kanban-tab.tsx:305 | Downloaders |  | `fmtN(downloaders)` |
| ui | analytics | src/components/analytics/ads-coda-kanban-tab.tsx:313 | Whitepapers downloaded |  | `fmtN(downloads)` |
| ui | analytics | src/components/analytics/ads-coda-kanban-tab.tsx:321 | Downloads / Downloader |  | `downloadsPerDownloader` |
| ui | analytics | src/components/analytics/ads-coda-kanban-tab.tsx:322 | Unknown-email downloads |  | `fmtN(unknownEmailCards)` |
| ui | analytics | src/components/analytics/ads-coda-kanban-tab.tsx:363 | Total Downloads |  | `totalCards.toString()` |
| ui | analytics | src/components/analytics/ads-coda-kanban-tab.tsx:368 | Completed |  | `completedCount.toString()` |
| ui | analytics | src/components/analytics/ads-coda-kanban-tab.tsx:374 | In Progress |  | `inProgressCount.toString()` |
| ui | analytics | src/components/analytics/ads-coda-kanban-tab.tsx:380 | Blocked |  | `blockedCount.toString()` |
| ui | analytics | src/components/analytics/ads-coda-kanban-tab.tsx:448 | Completion |  | `completionRate` |
| ui | analytics | src/components/analytics/sales-hubspot-tab.tsx:164 |  |  | `fmtN(funnel.totalDeals)` |
| ui | analytics | src/components/analytics/sales-hubspot-tab.tsx:169 |  |  | `fmtN(funnel.closedWon)` |
| ui | analytics | src/components/analytics/sales-hubspot-tab.tsx:174 |  |  | `fmtPct(funnel.winRate)` |
| ui | analytics | src/components/analytics/sales-hubspot-tab.tsx:179 |  |  | `fmt$(funnel.avgDealSize)` |
| ui | analytics | src/components/analytics/sales-hubspot-tab.tsx:184 |  |  | `fmtN(funnel.activeSubscriptions)` |
| ui | analytics | src/components/analytics/sales-hubspot-tab.tsx:189 |  |  | `fmtN(funnel.demoScheduled)` |
| ui | analytics | src/components/analytics/sales-hubspot-tab.tsx:194 |  |  | `fmtPct(funnel.noShowRate)` |
| ui | analytics | src/components/analytics/sales-hubspot-tab.tsx:200 |  |  | `fmtPct(funnel.effectiveWinRate)` |
| ui | analytics | src/components/analytics/sales-hubspot-tab.tsx:239 | Outcomes |  | `` |
| ui | analytics | src/components/analytics/sales-stripe-tab.tsx:149 |  |  | `fmt$(rev.mrr)` |
| ui | analytics | src/components/analytics/sales-stripe-tab.tsx:155 |  |  | `fmtN(subs.active)` |
| ui | analytics | src/components/analytics/sales-stripe-tab.tsx:160 |  |  | `fmtN(subs.trialing)` |
| ui | analytics | src/components/analytics/sales-stripe-tab.tsx:165 |  |  | `fmtPct(subs.churnRate)` |
| ui | analytics | src/components/analytics/sales-stripe-tab.tsx:171 |  |  | `fmtN(subs.pastDue)` |
| ui | analytics | src/components/analytics/sales-stripe-tab.tsx:177 |  |  | `fmt$(rev.totalRevenue30d)` |
| ui | analytics | src/components/analytics/sales-stripe-tab.tsx:183 |  |  | `fmtPct(pay.successRate)` |
| ui | analytics | src/components/analytics/sales-stripe-tab.tsx:188 |  |  | `fmt$(rev.avgRevenuePerCustomer)` |
| ui | analytics | src/components/analytics/sales-stripe-tab.tsx:199 | Subscriptions |  | `` |
| ui | analytics | src/components/analytics/sales-stripe-tab.tsx:238 | Payments |  | `` |
| ui | analytics | src/components/analytics/generic-workspace-tab.tsx:147 |  |  | `fmtN(totalRules)` |
| ui | analytics | src/components/analytics/generic-workspace-tab.tsx:152 |  |  | `fmtN(enabledRules)` |
| ui | analytics | src/components/analytics/generic-workspace-tab.tsx:157 |  |  | `fmtN(erroredRules)` |
| ui | analytics | src/components/analytics/generic-workspace-tab.tsx:163 |  |  | `fmtN(eventsInRange)` |
| ui | analytics | src/components/analytics/generic-workspace-tab.tsx:168 |  |  | `fmtN(receiptsInRange)` |
| ui | analytics | src/components/analytics/generic-workspace-tab.tsx:173 |  |  | `fmtN(tasksCreatedInRange)` |
| ui | analytics | src/components/analytics/generic-workspace-tab.tsx:178 |  |  | `fmtN(failuresInRange)` |
| ui | analytics | src/components/analytics/generic-workspace-tab.tsx:184 |  |  | ``${errorRate.toFixed(1)}%`` |
| ui | analytics | src/components/analytics/generic-workspace-tab.tsx:196 | Rules |  | `` |
| ui | analytics | src/components/analytics/cs-pylon-tab.tsx:180 | Open Conversations |  | `openConversations.toString()` |
| ui | analytics | src/components/analytics/cs-pylon-tab.tsx:185 | Urgent |  | `urgentConversations.toString()` |
| ui | analytics | src/components/analytics/cs-pylon-tab.tsx:191 | Waiting on Team |  | `waitingOnTeam.toString()` |
| ui | analytics | src/components/analytics/cs-pylon-tab.tsx:197 | Resolved |  | `resolvedInRange.toString()` |
| ui | analytics | src/components/analytics/cs-pylon-tab.tsx:204 | Avg First Response |  | `avgFirstResponseMinutes !== null ? fmtDuration(avgFirstResponseMinutes) : "—"` |
| ui | analytics | src/components/analytics/cs-pylon-tab.tsx:210 | CSAT Score |  | `csat !== null ? `${csat.toFixed(1)}/5` : "—"` |
| ui | analytics | src/components/analytics/cs-pylon-tab.tsx:259 | CSAT |  | `csatPct ?? 0` |
| ui | analytics | src/components/analytics/cs-pylon-tab.tsx:267 | Resolved |  | `resolutionRate` |
| ui | analytics | src/components/analytics/cs-coda-tab.tsx:157 |  |  | `fmtN(contributors)` |
| ui | analytics | src/components/analytics/cs-coda-tab.tsx:162 |  |  | `fmtN(created)` |
| ui | analytics | src/components/analytics/cs-coda-tab.tsx:167 |  |  | `fmtN(completed)` |
| ui | analytics | src/components/analytics/cs-coda-tab.tsx:172 |  |  | `fmtN(overdue)` |
| ui | analytics | src/components/analytics/cs-coda-tab.tsx:178 |  |  | ``${backlogGrowth >= 0 ? "+" : ""}${backlogGrowth.toFixed(1)}%`` |
| ui | analytics | src/components/analytics/cs-coda-tab.tsx:184 |  |  | `throughput !== null ? fmtPct(throughput * 100) : "—"` |
| ui | analytics | src/components/analytics/cs-coda-tab.tsx:234 | Total |  | `` |
| ui | analytics | src/components/analytics/cs-product-tab.tsx:170 |  |  | `fmtN(contributors)` |
| ui | analytics | src/components/analytics/cs-product-tab.tsx:176 |  |  | `fmtN(created)` |
| ui | analytics | src/components/analytics/cs-product-tab.tsx:181 |  |  | `fmtN(completed)` |
| ui | analytics | src/components/analytics/cs-product-tab.tsx:186 |  |  | `fmtN(overdue)` |
| ui | analytics | src/components/analytics/cs-product-tab.tsx:192 |  |  | ``${backlogGrowth >= 0 ? "+" : ""}${backlogGrowth.toFixed(1)}%`` |
| ui | analytics | src/components/analytics/cs-product-tab.tsx:198 |  |  | `throughput !== null ? fmtPct(throughput * 100) : "—"` |
| ui | analytics | src/components/analytics/cs-product-tab.tsx:209 | Tasks |  | `` |
| ui | analytics | src/components/analytics/sub-dashboards/google-analytics-dashboard.tsx:93 | Sessions (30d) |  | `fmtNum(ga.sessions30d)` |
| ui | analytics | src/components/analytics/sub-dashboards/google-analytics-dashboard.tsx:102 | Users (30d) |  | `fmtNum(ga.users30d)` |
| ui | analytics | src/components/analytics/sub-dashboards/google-analytics-dashboard.tsx:108 | Bounce Rate |  | `fmtPct(bounceRatePct)` |
| ui | analytics | src/components/analytics/sub-dashboards/google-analytics-dashboard.tsx:113 | Avg Duration |  | `fmtDuration(ga.avgSessionDuration)` |
| ui | analytics | src/components/analytics/sub-dashboards/stripe-dashboard.tsx:65 | MRR |  | `fmt$(mrr)` |
| ui | analytics | src/components/analytics/sub-dashboards/stripe-dashboard.tsx:74 | Active Subscriptions |  | `subscriptions.active.toLocaleString()` |
| ui | analytics | src/components/analytics/sub-dashboards/stripe-dashboard.tsx:79 | Payment Success |  | `fmtPct(paymentSuccessPct)` |
| ui | analytics | src/components/analytics/sub-dashboards/stripe-dashboard.tsx:85 | Revenue Growth |  | `fmtPct(revenue.revenueGrowth)` |
| ui | analytics | src/components/analytics/sub-dashboards/hubspot-sales-dashboard.tsx:90 | Total Deals |  | `funnel.totalDeals.toLocaleString()` |
| ui | analytics | src/components/analytics/sub-dashboards/hubspot-sales-dashboard.tsx:95 | Win Rate |  | `fmtPct(funnel.winRate)` |
| ui | analytics | src/components/analytics/sub-dashboards/hubspot-sales-dashboard.tsx:101 | No-Show Rate |  | `fmtPct(funnel.noShowRate)` |
| ui | analytics | src/components/analytics/sub-dashboards/hubspot-sales-dashboard.tsx:107 | Avg Deal Size |  | `fmt$(funnel.avgDealSize)` |
| ui | analytics | src/components/analytics/customer-journey-tab.tsx:57 | Total Journeys |  | `journey.journeys.length.toLocaleString()` |
| ui | analytics | src/components/analytics/customer-journey-tab.tsx:62 | Avg Touchpoints |  | `journey.avgTouchpoints.toFixed(1)` |
| ui | analytics | src/components/analytics/customer-journey-tab.tsx:68 | Median Days to Close |  | ``${journey.medianDaysToClose}`` |
| ui | analytics | src/components/analytics/customer-journey-tab.tsx:74 | Top Channel |  | `topChannel ? CHANNEL_LABELS[topChannel.channel] : "—"` |
| ui | analytics | src/components/analytics/demo-analytics-tab.tsx:43 | Demos Scheduled |  | `demo.totalScheduled.toLocaleString()` |
| ui | analytics | src/components/analytics/demo-analytics-tab.tsx:48 | Completed |  | `demo.totalCompleted.toLocaleString()` |
| ui | analytics | src/components/analytics/demo-analytics-tab.tsx:55 | No-Show Rate |  | ``${demo.noShowRate}%`` |
| ui | analytics | src/components/analytics/demo-analytics-tab.tsx:62 | Avg Lead Time |  | ``${demo.avgLeadTimeDays}d`` |
| ui | analytics | src/components/analytics/demo-analytics-tab.tsx:68 | Demo → Close |  | `demoToCloseRate != null ? `${demoToCloseRate}%` : "—"` |
| ui | analytics | src/components/analytics/demo-analytics-tab.tsx:123 | Completed |  | `completionRate` |
| ui | analytics | src/components/analytics/demo-analytics-tab.tsx:124 | No-Show |  | `demo.noShowRate` |
| ui | analytics | src/components/analytics/process-analytics-tab.tsx:62 | Health Score |  | ``${process.healthScore}/100`` |
| ui | analytics | src/components/analytics/process-analytics-tab.tsx:69 | Avg Cycle Time |  | ``${process.avgCycleTimeDays}d`` |
| ui | analytics | src/components/analytics/process-analytics-tab.tsx:75 | Bottlenecks |  | `process.bottlenecks.length.toLocaleString()` |
| ui | analytics | src/components/analytics/process-analytics-tab.tsx:82 | Active Deals |  | `totalDeals.toLocaleString()` |
| ui | analytics | src/components/analytics/process-analytics-tab.tsx:96 | Health |  | `process.healthScore` |
| ui | analytics | src/components/analytics/customer-journey-conversion-tab.tsx:60 | Overall Conversion |  | ``${overallConversionRate}%`` |
| ui | analytics | src/components/analytics/customer-journey-conversion-tab.tsx:66 | Converted Revenue |  | `fmt$(totalRevenue)` |
| ui | analytics | src/components/analytics/customer-journey-conversion-tab.tsx:72 | Avg Deal Value |  | `avgDealValue > 0 ? fmt$(avgDealValue) : "—"` |
| ui | analytics | src/components/analytics/customer-journey-conversion-tab.tsx:78 | Median Days to Close |  | ``${journey.medianDaysToClose}`` |
| ui | analytics | src/components/analytics/demo-attribution-view.tsx:44 | Top Source |  | `bestSource?.source ?? "—"` |
| ui | analytics | src/components/analytics/demo-attribution-view.tsx:50 | Sources Tracked |  | `demo.bySource.length.toString()` |
| ui | analytics | src/components/analytics/demo-attribution-view.tsx:56 | Avg Conversion |  | ``${(kpis.demo.avgConversionRatePct ?? 0).toFixed(1)}%`` |
| ui | analytics | src/components/analytics/demo-attribution-view.tsx:62 | Lowest Conversion |  | `worstSource?.source ?? "—"` |
| ui | analytics | src/components/analytics/process-bottlenecks-view.tsx:46 | Total Bottlenecks |  | `process.bottlenecks.length.toString()` |
| ui | analytics | src/components/analytics/process-bottlenecks-view.tsx:53 | Deals Affected |  | `totalDealsAffected.toLocaleString()` |
| ui | analytics | src/components/analytics/process-bottlenecks-view.tsx:59 | Worst Stage |  | `worstBottleneck?.stageLabel ?? "—"` |
| ui | analytics | src/components/analytics/process-bottlenecks-view.tsx:65 | Avg Cycle Time |  | ``${process.avgCycleTimeDays}d`` |
| ui | analytics | src/components/analytics/process-health-view.tsx:51 | Health Score |  | ``${process.healthScore}/100`` |
| ui | analytics | src/components/analytics/process-health-view.tsx:58 | Strong Factors |  | `strongFactors.length.toString()` |
| ui | analytics | src/components/analytics/process-health-view.tsx:65 | Weak Factors |  | `weakFactors.length.toString()` |
| ui | analytics | src/components/analytics/process-health-view.tsx:72 | Avg Cycle |  | ``${process.avgCycleTimeDays}d`` |
| ui | analytics | src/components/analytics/process-health-view.tsx:86 | healthGrade |  | `process.healthScore` |
| ui | analytics | src/components/analytics/finance-planning-tab.tsx:613 | Total Budget |  | `fmt$(budgetSummary.totalBudget)` |
| ui | analytics | src/components/analytics/finance-planning-tab.tsx:619 | Total Actual |  | `fmt$(budgetSummary.totalActual)` |
| ui | analytics | src/components/analytics/finance-planning-tab.tsx:638 | Variance |  | `hasBudgetBaseline ? fmtDelta(budgetSummary.totalVariance) : "—"` |
| ui | analytics | src/components/analytics/finance-planning-tab.tsx:653 | Overspend Areas |  | `hasBudgetBaseline ? budgetSummary.overspendCategories.length.toString() : "—"` |
| ui | analytics | src/components/analytics/finance-forecast-tab.tsx:250 | s.name |  | `fmt$(last12)` |
| ui | analytics | src/components/analytics/finance-pnl-tab.tsx:228 | Net Income |  | `fmt$(pnl.netIncome)` |
| ui | analytics | src/components/analytics/finance-pnl-tab.tsx:234 | Gross Margin |  | `fmtPct(pnl.grossMargin)` |
| ui | analytics | src/components/analytics/finance-pnl-tab.tsx:239 | Operating Margin |  | `fmtPct(pnl.operatingMargin)` |
| ui | analytics | src/components/analytics/finance-pnl-tab.tsx:244 | Revenue |  | `fmt$(totalRevenue)` |
| ui | analytics | src/components/analytics/finance-unit-economics-tab.tsx:205 | Lifetime Value |  | `fmt$(ue.ltv)` |
| ui | analytics | src/components/analytics/finance-unit-economics-tab.tsx:210 | Acquisition Cost |  | `fmt$(ue.cac)` |
| ui | analytics | src/components/analytics/finance-unit-economics-tab.tsx:215 | LTV:CAC |  | `fmtRatio(ue.ltvCacRatio)` |
| ui | analytics | src/components/analytics/finance-unit-economics-tab.tsx:234 | LTV:CAC |  | `ue.ltvCacRatio` |
| ui | analytics | src/components/analytics/ai-insights-page.tsx:139 | Critical |  | `String(criticalCount)` |
| ui | analytics | src/components/analytics/ai-insights-page.tsx:140 | Warnings |  | `String(warningCount)` |
| ui | analytics | src/components/analytics/ai-insights-page.tsx:141 | Info |  | `String(infoCount)` |
| ui | analytics | src/components/analytics/ai-insights-page.tsx:142 | Avg Confidence |  | ``${avgConfidencePct}%`` |
| ui | analytics | src/components/analytics/customer-journey-page.tsx:199 | Total Contacts |  | `totalVolume.toLocaleString()` |
| ui | analytics | src/components/analytics/customer-journey-page.tsx:200 | Avg Conversion |  | `avgConversion !== null ? `${avgConversion.toFixed(1)}%` : "—"` |
| ui | analytics | src/components/analytics/customer-journey-page.tsx:205 | Stages |  | `String(lifecycle.stages.length)` |
| ui | analytics | src/components/analytics/customer-journey-page.tsx:206 | Active Insights |  | `String(insights.length)` |
| ui | whip | src/components/whip/scope-creep-summary.tsx:77 | Planned tasks |  | `summary.totalPlanned` |
| ui | whip | src/components/whip/scope-creep-summary.tsx:82 | Unplanned (scope creep) |  | `summary.totalUnplanned` |
| ui | whip | src/components/whip/scope-creep-summary.tsx:88 | Creep ratio |  | ``${creepPercent}%`` |
| ui | whip | src/components/whip/scope-creep-summary.tsx:94 | Sprint completion |  | ``${completionRate}%`` |
| ui | analytics | src/components/analytics/overview-tab.tsx:54 | Monthly Recurring Revenue |  | `kpis?.finance.mrr != null ? fmt$(kpis.finance.mrr) : revenue ? fmt$(revenue.mrr) : "—"` |
| ui | analytics | src/components/analytics/overview-tab.tsx:61 | Website Sessions (30d) |  | `ga ? fmtN(ga.sessions30d) : "—"` |
| ui | analytics | src/components/analytics/overview-tab.tsx:68 | Active Pipeline Deals |  | `kpis?.sales.activeDeals != null ? kpis.sales.activeDeals.toLocaleString() : funnel ? funnel.totalDeals.toLocaleString() : "—"` |
| ui | analytics | src/components/analytics/overview-tab.tsx:74 | Cash Balance |  | `cash ? fmt$(cash.totalBalance) : "—"` |
| ui | analytics | src/components/analytics/overview-tab.tsx:85 | Active Subscriptions |  | `subs ? subs.active.toLocaleString() : "—"` |
| ui | analytics | src/components/analytics/overview-tab.tsx:91 | Total Ad Spend (30d) |  | `hasAdData ? fmt$(totalAdSpend) : "—"` |
| ui | analytics | src/components/analytics/overview-tab.tsx:100 | Unique Visitors (30d) |  | `ga ? fmtN(ga.users30d) : "—"` |
| ui | analytics | src/components/analytics/overview-tab.tsx:107 | Bounce Rate |  | `kpis.traffic.bounceRatePct == null ? "—" : fmtPct(kpis.traffic.bounceRatePct)` |
| ui | analytics | src/components/analytics/overview-tab.tsx:121 | Revenue (30d) |  | `revenue ? fmt$(revenue.totalRevenue30d) : "—"` |
| ui | analytics | src/components/analytics/overview-tab.tsx:126 | Inflows (30d) |  | `cash ? fmt$(cash.inflows30d) : "—"` |
| ui | analytics | src/components/analytics/overview-tab.tsx:131 | Outflows (30d) |  | `cash ? fmt$(cash.outflows30d) : "—"` |
| ui | analytics | src/components/analytics/overview-tab.tsx:136 | Net Cash Flow |  | `cash ? fmt$(cash.netCashFlow) : "—"` |
| ui | analytics | src/components/analytics/overview-tab.tsx:158 | Win Rate |  | `funnel.winRate` |
| ui | analytics | src/components/analytics/overview-tab.tsx:165 | Effective |  | `funnel.effectiveWinRate` |
| ui | analytics | src/components/analytics/stat-card.test.tsx:8 | Test |  | `` |
| ui | analytics | src/components/analytics/stat-card.test.tsx:13 | Test |  | `` |
| ui | analytics | src/components/analytics/tasks-tab.tsx:73 | Total Cards |  | `coda.totalCards.toLocaleString()` |
| ui | analytics | src/components/analytics/tasks-tab.tsx:78 | Status Columns |  | `statuses.length.toString()` |
| ui | analytics | src/components/analytics/tasks-tab.tsx:84 | Most Recent Update |  | `timeAgo(mostRecentUpdate)` |
| ui | dashboard | src/components/board/dashboard-view.tsx:697 | Total Tasks |  | `totalTasks` |
| ui | dashboard | src/components/board/dashboard-view.tsx:703 | In Progress |  | `activeCount` |
| ui | dashboard | src/components/board/dashboard-view.tsx:709 | Overdue |  | `overdueTasks.length` |
| ui | dashboard | src/components/board/dashboard-view.tsx:716 | Blocked |  | `blockedTasks.length` |
| ui | dashboard | src/components/board/dashboard-view.tsx:722 | Going Stale |  | `staleTasks.length` |
| ui | dashboard | src/components/board/dashboard-view.tsx:729 | Dep. Chains |  | `atRiskDependencies.length` |