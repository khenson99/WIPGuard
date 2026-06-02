import { describe, expect, it } from "vitest";
import { buildSubscriptionMrrBreakdown } from "@/lib/analytics/subscription-mrr";

describe("buildSubscriptionMrrBreakdown", () => {
  it("adds HubSpot-only annual subscription value to Stripe ARR", () => {
    const breakdown = buildSubscriptionMrrBreakdown({
      stripe: {
        revenue: { mrr: 12000, mrrChange: 500 },
        subscriptions: {
          active: 1,
          activeCustomerRefs: [{ customerId: "cus_123", email: "billing@example.com", emailDomain: "example.com" }],
        },
      },
      hubspot: {
        subscriptionDeals: [
          {
            dealId: "hs-only",
            dealName: "HubSpot Only",
            stageLabel: "Subscriptions",
            amount: 3598,
            stripeCustomerId: null,
            primaryContactEmail: "ops@example-subscription.com",
          },
        ],
      },
    });

    expect(breakdown.totalMrr).toBe(12299.83);
    expect(breakdown.totalArr).toBe(147598);
    expect(breakdown.stripeMrr).toBe(12000);
    expect(breakdown.hubspotOnlySubscriptionMrr).toBe(299.83);
    expect(breakdown.mergedActiveSubscriptions).toBe(2);
  });

  it("excludes HubSpot subscription revenue linked to active Stripe customers", () => {
    const breakdown = buildSubscriptionMrrBreakdown({
      stripe: {
        revenue: { mrr: 12000, mrrChange: 500 },
        subscriptions: {
          active: 1,
          activeCustomerRefs: [{ customerId: "cus_123", email: "billing@example.com", emailDomain: "example.com" }],
        },
      },
      hubspot: {
        subscriptionDeals: [
          {
            dealId: "linked-by-customer",
            dealName: "Linked Customer",
            stageLabel: "Subscriptions",
            amount: 4000,
            stripeCustomerId: "cus_123",
            primaryContactEmail: null,
          },
          {
            dealId: "linked-by-email",
            dealName: "Linked Email",
            stageLabel: "Subscriptions",
            amount: 3000,
            stripeCustomerId: null,
            primaryContactEmail: "billing@example.com",
          },
        ],
      },
    });

    expect(breakdown.totalMrr).toBe(12000);
    expect(breakdown.hubspotOnlySubscriptionMrr).toBe(0);
    expect(breakdown.excludedLinkedHubspotSubscriptionMrr).toBe(583.33);
    expect(breakdown.mergedActiveSubscriptions).toBe(1);
  });

  it("uses Stripe active subscription count when customer refs are unavailable", () => {
    const breakdown = buildSubscriptionMrrBreakdown({
      stripe: {
        revenue: { mrr: 12000, mrrChange: 500 },
        subscriptions: {
          active: 12,
          activeCustomerRefs: [],
        },
      },
      hubspot: {
        subscriptionDeals: [
          {
            dealId: "hs-only",
            dealName: "HubSpot Only",
            stageLabel: "Subscriptions",
            amount: 2400,
            stripeCustomerId: null,
            primaryContactEmail: "ops@example-subscription.com",
          },
        ],
      },
    });

    expect(breakdown.stripeActiveSubscriptions).toBe(12);
    expect(breakdown.hubspotOnlyActiveSubscriptions).toBe(1);
    expect(breakdown.mergedActiveSubscriptions).toBe(13);
  });
});
