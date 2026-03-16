"use client";

import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { deriveCustomerSuccessOperationalView } from "@/components/analytics/customer-success-operational-view-model";
import { CustomerSuccessPortfolioPanels } from "@/components/analytics/customer-success-portfolio-panels";
import {
  IntegrationDeliveryStatusPanel,
  LegacyCustomerSuccessAnalytics,
} from "@/components/analytics/customer-success-operational-sections";

export function CustomerSuccessTab({ data }: { data: AnalyticsDashboardData | null }) {
  const operationalView = deriveCustomerSuccessOperationalView(data);

  return (
    <div className="space-y-4">
      <CustomerSuccessPortfolioPanels />

      <IntegrationDeliveryStatusPanel integrationStatuses={operationalView.integrationStatuses} />

      <LegacyCustomerSuccessAnalytics
        actions={operationalView.actions}
        codaCards={operationalView.codaCards}
        hasLegacyAnalytics={operationalView.hasLegacyAnalytics}
        maxTrend={operationalView.maxTrend}
        openConversations={operationalView.openConversations}
        riskItems={operationalView.riskItems}
        firstResponseLabel={
          operationalView.avgFirstResponseMinutes == null
            ? "—"
            : `${Math.round(operationalView.avgFirstResponseMinutes)} min`
        }
        trend={operationalView.trend}
        urgentConversations={operationalView.urgentConversations}
      />
    </div>
  );
}
