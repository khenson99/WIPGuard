import { describe, expect, it } from "vitest";
import { IntegrationProvider } from "@/generated/prisma/client";
import { buildImladrisRawRecordsFromPayload } from "@/lib/imladris/raw-records";

describe("Imladris raw record builder", () => {
  it("uses numeric provider timestamps as raw record occurrence times", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        charges: [
          {
            id: "ch_1",
            created: 1_700_000_000,
            amount: 4200,
          },
          {
            id: "ch_2",
            createdAt: 1_700_000_000_000,
            amount: 1200,
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "charge",
        externalId: "stripe:charge:ch_1",
        occurredAt: "2023-11-14T22:13:20.000Z",
        sourceUpdatedAt: "2023-11-14T22:13:20.000Z",
      }),
      expect.objectContaining({
        objectType: "charge",
        externalId: "stripe:charge:ch_2",
        occurredAt: "2023-11-14T22:13:20.000Z",
        sourceUpdatedAt: "2023-11-14T22:13:20.000Z",
      }),
    ]));
  });

  it("uses numeric-string provider timestamps as raw record occurrence times", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        charges: [
          {
            id: "ch_string_seconds",
            created: "1700000000",
            amount: 4200,
          },
          {
            id: "ch_string_millis",
            createdAt: "1700000000000",
            amount: 1200,
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "charge",
        externalId: "stripe:charge:ch_string_seconds",
        occurredAt: "2023-11-14T22:13:20.000Z",
        sourceUpdatedAt: "2023-11-14T22:13:20.000Z",
      }),
      expect.objectContaining({
        objectType: "charge",
        externalId: "stripe:charge:ch_string_millis",
        occurredAt: "2023-11-14T22:13:20.000Z",
        sourceUpdatedAt: "2023-11-14T22:13:20.000Z",
      }),
    ]));
  });

  it("uses Stripe charge ID aliases before customer IDs for stable charge external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        charges: [
          {
            customerId: "cus_123",
            chargeId: "ch_1",
            netAmountCents: 2_000,
            created: 1_700_000_000,
          },
          {
            customer_id: "cus_123",
            charge_id: "ch_2",
            netAmountCents: 7_000,
            created: 1_700_000_100,
          },
        ],
      },
    });

    const charges = records.filter((record) => record.objectType === "charge");
    expect(charges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        externalId: "stripe:charge:ch_1",
        payload: expect.objectContaining({
          chargeId: "ch_1",
        }),
      }),
      expect.objectContaining({
        externalId: "stripe:charge:ch_2",
        payload: expect.objectContaining({
          charge_id: "ch_2",
        }),
      }),
    ]));
    expect(charges).toHaveLength(2);
  });

  it("unwraps scalar provider ID envelopes before building stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        charges: [
          {
            id: { data: { attributes: { value: "ch_scalar_envelope" } } },
            created: "2026-05-29T10:00:00.000Z",
            amount: 4200,
          },
        ],
        activeCustomerRefs: [
          {
            customer: {
              id: { value: "cus_scalar_envelope" },
              email: "scalar-envelope@example.com",
            },
            updatedAt: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "charge",
        externalId: "stripe:charge:ch_scalar_envelope",
      }),
      expect.objectContaining({
        objectType: "active_customer_ref",
        externalId: "stripe:active_customer_ref:cus_scalar_envelope",
      }),
    ]));
  });

  it("unwraps uppercase scalar provider ID envelopes before building stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        charges: [
          {
            id: { DATA: { ATTRIBUTES: { VALUE: "ch_uppercase_scalar_envelope" } } },
            created: "2026-05-29T10:00:00.000Z",
            amount: 4200,
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "charge",
        externalId: "stripe:charge:ch_uppercase_scalar_envelope",
      }),
    ]));
  });

  it("uses decimal Unix-string provider timestamps as raw record occurrence times", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        charges: [
          {
            id: "ch_decimal_string_seconds",
            created: "1700000000.25",
            amount: 4200,
          },
          {
            id: "ch_decimal_string_millis",
            createdAt: "1700000000000.5",
            amount: 1200,
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "charge",
        externalId: "stripe:charge:ch_decimal_string_seconds",
        occurredAt: "2023-11-14T22:13:20.250Z",
        sourceUpdatedAt: "2023-11-14T22:13:20.250Z",
      }),
      expect.objectContaining({
        objectType: "charge",
        externalId: "stripe:charge:ch_decimal_string_millis",
        occurredAt: "2023-11-14T22:13:20.000Z",
        sourceUpdatedAt: "2023-11-14T22:13:20.000Z",
      }),
    ]));
  });

  it("keeps provider update timestamps separate from occurrence timestamps", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        deals: [
          {
            dealId: "deal_updated",
            dealName: "Acme expansion",
            createdAt: "2026-05-01T09:00:00.000Z",
            updatedAt: "2026-05-31T17:30:00.000Z",
            amount: 42000,
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "deal",
        externalId: "hubspot:deal:deal_updated",
        sourceCreatedAt: "2026-05-01T09:00:00.000Z",
        occurredAt: "2026-05-01T09:00:00.000Z",
        sourceUpdatedAt: "2026-05-31T17:30:00.000Z",
      }),
    ]));
  });

  it("prefers currently observable duplicate records over future-dated duplicates", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        charges: [
          {
            id: "ch_duplicate",
            created: "2026-05-29T10:00:00.000Z",
            amount: 4200,
          },
          {
            id: "ch_duplicate",
            created: "2099-01-01T00:00:00.000Z",
            amount: 999900,
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "charge",
        externalId: "stripe:charge:ch_duplicate",
        occurredAt: "2026-05-29T10:00:00.000Z",
        sourceUpdatedAt: "2026-05-29T10:00:00.000Z",
        payload: expect.objectContaining({
          amount: 4200,
        }),
      }),
    ]));
  });

  it("does not rank explicit future timestamps above current snapshot fallback timestamps", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        charges: [
          {
            id: "ch_future_rank",
            amount: 4200,
          },
          {
            id: "ch_future_rank",
            created: "2099-01-01T00:00:00.000Z",
            amount: 999900,
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "charge",
        externalId: "stripe:charge:ch_future_rank",
        occurredAt: "2026-06-01T00:00:00.000Z",
        sourceUpdatedAt: "2026-06-01T00:00:00.000Z",
        payload: expect.objectContaining({
          amount: 4200,
        }),
      }),
    ]));
  });

  it("keeps the more complete duplicate raw record when freshness ties", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        subscriptions: [
          {
            id: "sub_tie_complete",
            updatedAt: "2026-05-29T10:00:00.000Z",
            status: "active",
            customerId: "cus_tie_complete",
            monthlyRecurringRevenue: 1200,
          },
          {
            id: "sub_tie_complete",
            updatedAt: "2026-05-29T10:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "subscription",
        externalId: "stripe:subscription:sub_tie_complete",
        payload: expect.objectContaining({
          customerId: "cus_tie_complete",
          monthlyRecurringRevenue: 1200,
          status: "active",
        }),
      }),
    ]));
  });

  it("recognizes common provider timestamp aliases for raw record freshness", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.PYLON,
      snapshotKey: "pylon",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        conversations: [
          {
            id: "conv_1",
            created_at: "2026-05-02T08:00:00.000Z",
            updated_at: "2026-05-30T16:45:00.000Z",
          },
        ],
        pages: [
          {
            id: "page_1",
            createdOn: "2026-04-15T10:00:00.000Z",
            updatedOn: "2026-05-29T11:15:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "conversation",
        externalId: "pylon:conversation:conv_1",
        sourceCreatedAt: "2026-05-02T08:00:00.000Z",
        occurredAt: "2026-05-02T08:00:00.000Z",
        sourceUpdatedAt: "2026-05-30T16:45:00.000Z",
      }),
      expect.objectContaining({
        objectType: "page",
        externalId: "pylon:page:page_1",
        sourceCreatedAt: "2026-04-15T10:00:00.000Z",
        occurredAt: "2026-04-15T10:00:00.000Z",
        sourceUpdatedAt: "2026-05-29T11:15:00.000Z",
      }),
    ]));
  });

  it("recognizes uppercase provider timestamp aliases for raw record freshness", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.PYLON,
      snapshotKey: "pylon",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        conversations: [
          {
            id: "conv_uppercase_timestamp",
            CREATED_AT: "2026-05-02T08:00:00.000Z",
            UPDATED_AT: "2026-05-30T16:45:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "conversation",
        externalId: "pylon:conversation:conv_uppercase_timestamp",
        sourceCreatedAt: "2026-05-02T08:00:00.000Z",
        occurredAt: "2026-05-02T08:00:00.000Z",
        sourceUpdatedAt: "2026-05-30T16:45:00.000Z",
      }),
    ]));
  });

  it("preserves provider timestamps on nested object summary records", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.MERCURY,
      snapshotKey: "mercury",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        accountProfile: {
          id: "profile_1",
          createdAt: "2026-04-01T10:00:00.000Z",
          updatedAt: "2026-05-29T18:00:00.000Z",
          status: "active",
        },
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "account_profile_summary",
        externalId: "mercury:account_profile_summary:profile_1",
        sourceCreatedAt: "2026-04-01T10:00:00.000Z",
        occurredAt: "2026-04-01T10:00:00.000Z",
        sourceUpdatedAt: "2026-05-29T18:00:00.000Z",
      }),
    ]));
  });

  it("scopes nested object summary fallback IDs to parent records", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.MERCURY,
      snapshotKey: "mercury",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        accounts: [
          {
            id: "acct_1",
            currentBalance: {
              currency: "USD",
              available: 12500,
              updatedAt: "2026-05-30T09:00:00.000Z",
            },
          },
          {
            id: "acct_2",
            currentBalance: {
              currency: "USD",
              available: 9750,
              updatedAt: "2026-05-31T09:00:00.000Z",
            },
          },
        ],
      },
    });

    const balanceSummaries = records.filter((record) => record.objectType === "current_balance_summary");
    expect(balanceSummaries).toHaveLength(2);
    expect(balanceSummaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        externalId: "mercury:current_balance_summary:mercury:account_balance:acct_1:2026-05-01:2026-06-01",
        payload: expect.objectContaining({
          available: 12500,
          sourceParentExternalId: "mercury:account_balance:acct_1",
        }),
        sourceUpdatedAt: "2026-05-30T09:00:00.000Z",
      }),
      expect.objectContaining({
        externalId: "mercury:current_balance_summary:mercury:account_balance:acct_2:2026-05-01:2026-06-01",
        payload: expect.objectContaining({
          available: 9750,
          sourceParentExternalId: "mercury:account_balance:acct_2",
        }),
        sourceUpdatedAt: "2026-05-31T09:00:00.000Z",
      }),
    ]));
  });

  it("uses snake_case provider identifiers for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.POSTHOG,
      snapshotKey: "posthog",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        events: [
          {
            event_id: "evt_snake_1",
            customer_id: "cus_snake_1",
            timestamp: "2026-05-28T12:00:00.000Z",
            event: "trial_started",
          },
        ],
        conversations: [
          {
            conversation_id: "conv_snake_1",
            updated_at: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "event",
        externalId: "posthog:event:evt_snake_1",
      }),
      expect.objectContaining({
        objectType: "conversation",
        externalId: "posthog:conversation:conv_snake_1",
      }),
    ]));
  });

  it("uses uppercase provider identifiers for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.PYLON,
      snapshotKey: "pylon",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        conversations: [
          {
            ID: "conv_uppercase_id",
            UPDATED_AT: "2026-05-30T16:45:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "conversation",
        externalId: "pylon:conversation:conv_uppercase_id",
        sourceUpdatedAt: "2026-05-30T16:45:00.000Z",
      }),
    ]));
  });

  it("recognizes common UUID, subscription, and invoice identifiers for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        subscriptions: [
          {
            subscriptionId: "sub_alias_1",
            created: "2026-05-12T08:00:00.000Z",
          },
        ],
        invoices: [
          {
            invoice_id: "in_alias_1",
            created: "2026-05-13T08:00:00.000Z",
          },
        ],
        events: [
          {
            uuid: "evt_uuid_1",
            timestamp: "2026-05-14T08:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "subscription",
        externalId: "stripe:subscription:sub_alias_1",
      }),
      expect.objectContaining({
        objectType: "invoice",
        externalId: "stripe:invoice:in_alias_1",
      }),
      expect.objectContaining({
        objectType: "event",
        externalId: "stripe:event:evt_uuid_1",
      }),
    ]));
  });

  it("uses Stripe subscription ID aliases before customer IDs for stable subscription external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        subscriptions: [
          {
            customerId: "cus_123",
            subscriptionId: "sub_1",
            status: "active",
            updatedAt: "2026-05-28T12:00:00.000Z",
          },
          {
            customer_id: "cus_123",
            subscription_id: "sub_2",
            status: "trialing",
            updated_at: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    const subscriptions = records.filter((record) => record.objectType === "subscription");
    expect(subscriptions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        externalId: "stripe:subscription:sub_1",
        payload: expect.objectContaining({
          subscriptionId: "sub_1",
        }),
      }),
      expect.objectContaining({
        externalId: "stripe:subscription:sub_2",
        payload: expect.objectContaining({
          subscription_id: "sub_2",
        }),
      }),
    ]));
    expect(subscriptions).toHaveLength(2);
  });

  it("uses Stripe invoice ID aliases before customer IDs for stable invoice external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        invoices: [
          {
            customerId: "cus_123",
            invoiceId: "in_1",
            status: "paid",
            updatedAt: "2026-05-28T12:00:00.000Z",
          },
          {
            customer_id: "cus_123",
            invoice_id: "in_2",
            status: "open",
            updated_at: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    const invoices = records.filter((record) => record.objectType === "invoice");
    expect(invoices).toEqual(expect.arrayContaining([
      expect.objectContaining({
        externalId: "stripe:invoice:in_1",
        payload: expect.objectContaining({
          invoiceId: "in_1",
        }),
      }),
      expect.objectContaining({
        externalId: "stripe:invoice:in_2",
        payload: expect.objectContaining({
          invoice_id: "in_2",
        }),
      }),
    ]));
    expect(invoices).toHaveLength(2);
  });

  it("recognizes HubSpot company identifiers for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        companies: [
          {
            companyId: "company_camel_1",
            updatedAt: "2026-05-12T08:00:00.000Z",
          },
          {
            company_id: "company_snake_1",
            updated_at: "2026-05-13T08:00:00.000Z",
          },
          {
            company: {
              id: "company_nested_1",
            },
            updated_at: "2026-05-14T08:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "company",
        externalId: "hubspot:company:company_camel_1",
      }),
      expect.objectContaining({
        objectType: "company",
        externalId: "hubspot:company:company_snake_1",
      }),
      expect.objectContaining({
        objectType: "company",
        externalId: "hubspot:company:company_nested_1",
      }),
    ]));
  });

  it("recognizes nested HubSpot deal identifiers for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        deals: [
          {
            deal: {
              id: "deal_nested_1",
            },
            updatedAt: "2026-05-12T08:00:00.000Z",
          },
          {
            hubspotDealId: "deal_hubspot_camel_1",
            updated_at: "2026-05-13T08:00:00.000Z",
          },
          {
            hubspot_deal_id: "deal_hubspot_snake_1",
            updated_at: "2026-05-14T08:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "deal",
        externalId: "hubspot:deal:deal_nested_1",
      }),
      expect.objectContaining({
        objectType: "deal",
        externalId: "hubspot:deal:deal_hubspot_camel_1",
      }),
      expect.objectContaining({
        objectType: "deal",
        externalId: "hubspot:deal:deal_hubspot_snake_1",
      }),
    ]));
  });

  it("recognizes nested HubSpot contact identifiers for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        contacts: [
          {
            contact: {
              id: "contact_nested_1",
            },
            updatedAt: "2026-05-12T08:00:00.000Z",
          },
          {
            hubspotContactId: "contact_hubspot_camel_1",
            updated_at: "2026-05-13T08:00:00.000Z",
          },
          {
            hubspot_contact_id: "contact_hubspot_snake_1",
            updated_at: "2026-05-14T08:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "contact",
        externalId: "hubspot:contact:contact_nested_1",
      }),
      expect.objectContaining({
        objectType: "contact",
        externalId: "hubspot:contact:contact_hubspot_camel_1",
      }),
      expect.objectContaining({
        objectType: "contact",
        externalId: "hubspot:contact:contact_hubspot_snake_1",
      }),
    ]));
  });

  it("recognizes HubSpot meeting identifiers and start timestamps for raw demo evidence", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        meetings: [
          {
            meetingId: "meeting_camel_1",
            title: "Demo with Gamma",
            startedAt: "2026-05-20T17:00:00.000Z",
            updatedAt: "2026-05-19T12:00:00.000Z",
          },
          {
            properties: {
              hs_object_id: "meeting_nested_1",
              hs_meeting_title: "Demo with Delta",
              hs_timestamp: "2026-05-21T17:00:00.000Z",
              hs_lastmodifieddate: "2026-05-20T12:00:00.000Z",
            },
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "meeting",
        externalId: "hubspot:meeting:meeting_camel_1",
        occurredAt: "2026-05-20T17:00:00.000Z",
        sourceUpdatedAt: "2026-05-19T12:00:00.000Z",
      }),
      expect.objectContaining({
        objectType: "meeting",
        externalId: "hubspot:meeting:meeting_nested_1",
        occurredAt: "2026-05-21T17:00:00.000Z",
        sourceUpdatedAt: "2026-05-20T12:00:00.000Z",
      }),
    ]));
  });

  it("uses HubSpot contact ID aliases before company IDs for stable contact external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        contacts: [
          {
            companyId: "company_1",
            contactId: "contact_1",
            email: "first@example.com",
            updatedAt: "2026-05-12T08:00:00.000Z",
          },
          {
            company_id: "company_1",
            hubspot_contact_id: "contact_2",
            email: "second@example.com",
            updated_at: "2026-05-13T08:00:00.000Z",
          },
        ],
      },
    });

    const contacts = records.filter((record) => record.objectType === "contact");
    expect(contacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        externalId: "hubspot:contact:contact_1",
        payload: expect.objectContaining({
          contactId: "contact_1",
        }),
      }),
      expect.objectContaining({
        externalId: "hubspot:contact:contact_2",
        payload: expect.objectContaining({
          hubspot_contact_id: "contact_2",
        }),
      }),
    ]));
    expect(contacts).toHaveLength(2);
  });

  it("maps HubSpot contactRecords arrays to contact raw objects", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        contactRecords: [
          {
            contactId: "contact_from_fetcher",
            email: "buyer@example.com",
            createdAt: "2026-05-14T12:00:00.000Z",
            rawSource: "PAID_SEARCH",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "contact",
        externalId: "hubspot:contact:contact_from_fetcher",
        occurredAt: "2026-05-14T12:00:00.000Z",
        sourceUpdatedAt: "2026-05-14T12:00:00.000Z",
        payload: expect.objectContaining({
          contactId: "contact_from_fetcher",
          rawSource: "PAID_SEARCH",
        }),
      }),
    ]));
    expect(records.find((record) => record.objectType === "contact_records")).toBeUndefined();
  });

  it("recognizes Pylon issue aliases for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.PYLON,
      snapshotKey: "pylon",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        issues: [
          {
            issueId: "iss_camel_1",
            updatedAt: "2026-05-14T08:00:00.000Z",
          },
          {
            issue_id: "iss_snake_1",
            updated_at: "2026-05-15T08:00:00.000Z",
          },
          {
            external_id: "iss_external_1",
            updated_at: "2026-05-16T08:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "issue",
        externalId: "pylon:issue:iss_camel_1",
      }),
      expect.objectContaining({
        objectType: "issue",
        externalId: "pylon:issue:iss_snake_1",
      }),
      expect.objectContaining({
        objectType: "issue",
        externalId: "pylon:issue:iss_external_1",
      }),
    ]));
  });

  it("uses Pylon issue ID aliases before ticket IDs for stable issue external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.PYLON,
      snapshotKey: "pylon",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        issues: [
          {
            ticketId: "ticket_1",
            issueId: "issue_1",
            title: "First issue",
            updatedAt: "2026-05-14T08:00:00.000Z",
          },
          {
            ticket_id: "ticket_1",
            issue_id: "issue_2",
            title: "Second issue",
            updated_at: "2026-05-15T08:00:00.000Z",
          },
        ],
      },
    });

    const issues = records.filter((record) => record.objectType === "issue");
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        externalId: "pylon:issue:issue_1",
        payload: expect.objectContaining({
          issueId: "issue_1",
        }),
      }),
      expect.objectContaining({
        externalId: "pylon:issue:issue_2",
        payload: expect.objectContaining({
          issue_id: "issue_2",
        }),
      }),
    ]));
    expect(issues).toHaveLength(2);
  });

  it("uses Linear issue and project identifiers for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.LINEAR,
      snapshotKey: "linear",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        issues: [
          {
            identifier: "ENG-42",
            updatedAt: "2026-05-28T12:00:00.000Z",
          },
          {
            issueIdentifier: "OPS-7",
            updatedAt: "2026-05-29T12:00:00.000Z",
          },
          {
            issue_identifier: "CS-9",
            updatedAt: "2026-05-30T12:00:00.000Z",
          },
        ],
        projects: [
          {
            identifier: "PROJ-1",
            updatedAt: "2026-05-31T12:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "issue",
        externalId: "linear:issue:ENG-42",
      }),
      expect.objectContaining({
        objectType: "issue",
        externalId: "linear:issue:OPS-7",
      }),
      expect.objectContaining({
        objectType: "issue",
        externalId: "linear:issue:CS-9",
      }),
      expect.objectContaining({
        objectType: "project",
        externalId: "linear:project:PROJ-1",
      }),
    ]));
  });

  it("uses GitHub repository and pull request number for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GITHUB,
      snapshotKey: "github",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        pullRequests: [
          {
            id: 42,
            number: 7,
            title: "Ship Imladris sync",
            html_url: "https://github.com/example/imladris/pull/7",
            repository_url: "https://api.github.com/repos/example/imladris",
            updated_at: "2026-05-31T08:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "pull_request",
        externalId: "github:pull_request:example/imladris/pull/7",
      }),
    ]));
  });

  it("uses wrapped GitHub repository and pull request fields for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GITHUB,
      snapshotKey: "github",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        pullRequests: [
          {
            values: {
              number: 8,
              repository: new Map<string, unknown>([
                ["full_name", "example/imladris"],
              ]),
              updated_at: "2026-05-31T08:00:00.000Z",
            },
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "pull_request",
        externalId: "github:pull_request:example/imladris/pull/8",
        sourceUpdatedAt: "2026-05-31T08:00:00.000Z",
      }),
    ]));
  });

  it("unwraps scalar GitHub repository and pull request fields for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GITHUB,
      snapshotKey: "github",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        pullRequests: [
          {
            values: {
              number: { value: 9 },
              repository: {
                full_name: { value: " example/imladris " },
              },
              updated_at: "2026-05-31T08:00:00.000Z",
            },
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "pull_request",
        externalId: "github:pull_request:example/imladris/pull/9",
        sourceUpdatedAt: "2026-05-31T08:00:00.000Z",
      }),
    ]));
  });

  it("uses GitHub pull request alias fields before batch position for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GITHUB,
      snapshotKey: "github",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        pullRequests: [
          {
            repoFullName: "octo/app",
            pullRequestNumber: 7,
            title: "Original review",
            updatedAt: "2026-05-30T08:00:00.000Z",
          },
          {
            repo_full_name: "octo/app",
            pr_number: 7,
            title: "Merged review",
            updated_at: "2026-05-31T08:00:00.000Z",
          },
        ],
      },
    });

    const allPullRequests = records.filter((record) => record.objectType === "pull_request");
    const pullRequests = allPullRequests.filter(
      (record) => record.externalId === "github:pull_request:octo/app/pull/7",
    );
    expect(allPullRequests).toHaveLength(1);
    expect(pullRequests).toHaveLength(1);
    expect(pullRequests[0]).toMatchObject({
      objectType: "pull_request",
      sourceUpdatedAt: "2026-05-31T08:00:00.000Z",
      payload: expect.objectContaining({
        title: "Merged review",
      }),
    });
  });

  it("uses JSON:API data envelopes for stable raw record external IDs and timestamps", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        deals: [
          {
            data: {
              type: "deal",
              id: "deal_json_api_1",
              attributes: {
                created_at: "2026-05-12T08:00:00.000Z",
                updated_at: "2026-05-31T08:00:00.000Z",
                amount: 42000,
              },
            },
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "deal",
        externalId: "hubspot:deal:deal_json_api_1",
        sourceCreatedAt: "2026-05-12T08:00:00.000Z",
        occurredAt: "2026-05-12T08:00:00.000Z",
        sourceUpdatedAt: "2026-05-31T08:00:00.000Z",
      }),
    ]));
  });

  it("unwraps single-value JSON:API attributes before raw record IDs and timestamps", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        companies: [
          {
            data: {
              type: "companies",
              id: "company_json_api_value",
              attributes: {
                value: {
                  created_at: "2026-05-12T08:00:00.000Z",
                  updated_at: "2026-05-31T08:00:00.000Z",
                  hs_object_id: "company_json_api_value",
                  name: "Value-wrapped company",
                },
              },
            },
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "company",
        externalId: "hubspot:company:company_json_api_value",
        sourceCreatedAt: "2026-05-12T08:00:00.000Z",
        occurredAt: "2026-05-12T08:00:00.000Z",
        sourceUpdatedAt: "2026-05-31T08:00:00.000Z",
      }),
    ]));
  });

  it("unwraps uppercase single-value JSON:API attributes before raw record IDs and timestamps", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        companies: [
          {
            data: {
              type: "companies",
              id: "company_json_api_upper_value",
              attributes: {
                VALUE: {
                  created_at: "2026-05-12T08:00:00.000Z",
                  updated_at: "2026-05-31T08:00:00.000Z",
                  hs_object_id: "company_json_api_upper_value",
                  name: "Uppercase value-wrapped company",
                },
              },
            },
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "company",
        externalId: "hubspot:company:company_json_api_upper_value",
        sourceCreatedAt: "2026-05-12T08:00:00.000Z",
        occurredAt: "2026-05-12T08:00:00.000Z",
        sourceUpdatedAt: "2026-05-31T08:00:00.000Z",
      }),
    ]));
  });

  it("unwraps scalar timestamp envelopes before raw record freshness extraction", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        deals: [
          {
            id: "deal_wrapped_timestamps",
            created_at: { value: "2026-05-12T08:00:00.000Z" },
            updated_at: { data: { attributes: { value: "2026-05-31T08:00:00.000Z" } } },
            amount: 42_000,
          },
          {
            id: "deal_wrapped_timestamps",
            created_at: { value: "2026-05-12T08:00:00.000Z" },
            updated_at: { value: "2026-05-01T08:00:00.000Z" },
            amount: 1,
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "deal",
        externalId: "hubspot:deal:deal_wrapped_timestamps",
        sourceCreatedAt: "2026-05-12T08:00:00.000Z",
        occurredAt: "2026-05-12T08:00:00.000Z",
        sourceUpdatedAt: "2026-05-31T08:00:00.000Z",
        payload: expect.objectContaining({
          amount: 42_000,
        }),
      }),
    ]));
  });

  it("uses top-level JSON:API data item types for raw record object types", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        data: [
          {
            type: "deals",
            id: "deal_json_api_top_level_1",
            attributes: {
              created_at: "2026-05-12T08:00:00.000Z",
              updated_at: "2026-05-31T08:00:00.000Z",
              amount: 42000,
            },
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "deal",
        externalId: "hubspot:deal:deal_json_api_top_level_1",
        sourceCreatedAt: "2026-05-12T08:00:00.000Z",
        occurredAt: "2026-05-12T08:00:00.000Z",
        sourceUpdatedAt: "2026-05-31T08:00:00.000Z",
      }),
    ]));
    expect(records).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "data",
        externalId: "hubspot:data:deal_json_api_top_level_1",
      }),
    ]));
  });

  it("unwraps scalar JSON:API data item types before deriving raw record object types", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        data: [
          {
            type: { value: "deals" },
            id: { value: "deal_json_api_scalar_type" },
            attributes: {
              created_at: "2026-05-12T08:00:00.000Z",
              updated_at: "2026-05-31T08:00:00.000Z",
              amount: 42000,
            },
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "deal",
        externalId: "hubspot:deal:deal_json_api_scalar_type",
        sourceCreatedAt: "2026-05-12T08:00:00.000Z",
        occurredAt: "2026-05-12T08:00:00.000Z",
        sourceUpdatedAt: "2026-05-31T08:00:00.000Z",
      }),
    ]));
    expect(records).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "data",
        externalId: "hubspot:data:deal_json_api_scalar_type",
      }),
    ]));
  });

  it("uses JSON:API included item types for related raw record object types", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        data: [
          {
            type: "subscriptions",
            id: "sub_json_api_primary",
            attributes: {
              created: "2026-05-12T08:00:00.000Z",
            },
          },
        ],
        included: [
          {
            type: "customers",
            id: "cus_json_api_included",
            attributes: {
              updated_at: "2026-05-31T08:00:00.000Z",
              email: "billing@example.com",
            },
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "subscription",
        externalId: "stripe:subscription:sub_json_api_primary",
      }),
      expect.objectContaining({
        objectType: "customer",
        externalId: "stripe:customer:cus_json_api_included",
        sourceUpdatedAt: "2026-05-31T08:00:00.000Z",
      }),
    ]));
    expect(records).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "included",
        externalId: "stripe:included:cus_json_api_included",
      }),
    ]));
  });

  it("uses JSON:API relationship resource identifiers for stable nested provider external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        activeCustomerRefs: [
          {
            data: {
              type: "active_customer_refs",
              attributes: {
                email: "billing@example.com",
              },
              relationships: {
                customer: {
                  data: {
                    type: "customers",
                    id: "cus_json_api_relationship",
                  },
                },
              },
            },
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "active_customer_ref",
        externalId: "stripe:active_customer_ref:cus_json_api_relationship",
      }),
    ]));
  });

  it("uses top-level JSON:API data object types for single raw resource records", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        data: {
          type: "deals",
          id: "deal_json_api_single_1",
          attributes: {
            created_at: "2026-05-12T08:00:00.000Z",
            updated_at: "2026-05-31T08:00:00.000Z",
            amount: 42000,
          },
        },
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "deal",
        externalId: "hubspot:deal:deal_json_api_single_1",
        sourceCreatedAt: "2026-05-12T08:00:00.000Z",
        occurredAt: "2026-05-12T08:00:00.000Z",
        sourceUpdatedAt: "2026-05-31T08:00:00.000Z",
      }),
    ]));
    expect(records).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "data_summary",
        externalId: "hubspot:data_summary:deal_json_api_single_1",
      }),
    ]));
  });

  it("normalizes provider SDK objects with toJSON before raw record extraction", () => {
    class ProviderCharge {
      toJSON() {
        return {
          id: "ch_sdk_raw",
          created: "2026-05-29T08:00:00.000Z",
          amount: 4200,
        };
      }
    }

    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        charges: [
          new ProviderCharge(),
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "charge",
        externalId: "stripe:charge:ch_sdk_raw",
        occurredAt: "2026-05-29T08:00:00.000Z",
        sourceUpdatedAt: "2026-05-29T08:00:00.000Z",
        payload: expect.objectContaining({
          amount: 4200,
        }),
      }),
    ]));
  });

  it("uses GitHub commit SHA aliases for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GITHUB,
      snapshotKey: "github",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        commits: [
          {
            sha: "abc123def456",
            committed_at: "2026-05-29T08:00:00.000Z",
          },
          {
            commitSha: "def456abc123",
            committed_at: "2026-05-30T08:00:00.000Z",
          },
          {
            commit_sha: "fedcba987654",
            committed_at: "2026-05-31T08:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "commit",
        externalId: "github:commit:abc123def456",
        occurredAt: "2026-05-29T08:00:00.000Z",
        sourceUpdatedAt: "2026-05-29T08:00:00.000Z",
      }),
      expect.objectContaining({
        objectType: "commit",
        externalId: "github:commit:def456abc123",
      }),
      expect.objectContaining({
        objectType: "commit",
        externalId: "github:commit:fedcba987654",
      }),
    ]));
  });

  it("uses nested Stripe customer IDs for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        activeCustomerRefs: [
          {
            customer: {
              id: "cus_nested_raw",
              email: "finance@example.com",
            },
            updatedAt: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "active_customer_ref",
        externalId: "stripe:active_customer_ref:cus_nested_raw",
      }),
    ]));
  });

  it("uses wrapper-backed nested Stripe customer IDs for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        activeCustomerRefs: [
          {
            customer: {
              values: {
                id: "cus_wrapped_nested_raw",
                email: "wrapped-finance@example.com",
              },
            },
            updatedAt: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "active_customer_ref",
        externalId: "stripe:active_customer_ref:cus_wrapped_nested_raw",
      }),
    ]));
  });

  it("uses nested Stripe billing object IDs for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        subscriptions: [
          {
            subscription: {
              id: "sub_nested_raw",
            },
            created: "2026-05-28T12:00:00.000Z",
          },
        ],
        invoices: [
          {
            invoice: {
              id: "in_nested_raw",
            },
            created: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "subscription",
        externalId: "stripe:subscription:sub_nested_raw",
      }),
      expect.objectContaining({
        objectType: "invoice",
        externalId: "stripe:invoice:in_nested_raw",
      }),
    ]));
  });

  it("uses Stripe price, product, and plan IDs for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        subscriptionItems: [
          {
            price: {
              id: "price_nested_raw",
            },
            created: "2026-05-28T12:00:00.000Z",
          },
          {
            priceId: "price_camel_raw",
            created: "2026-05-29T12:00:00.000Z",
          },
          {
            product: {
              id: "prod_nested_raw",
            },
            created: "2026-05-30T12:00:00.000Z",
          },
          {
            product_id: "prod_snake_raw",
            created: "2026-05-31T12:00:00.000Z",
          },
          {
            plan: {
              id: "plan_nested_raw",
            },
            created: "2026-06-01T12:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "subscription_item",
        externalId: "stripe:subscription_item:price_nested_raw",
      }),
      expect.objectContaining({
        objectType: "subscription_item",
        externalId: "stripe:subscription_item:price_camel_raw",
      }),
      expect.objectContaining({
        objectType: "subscription_item",
        externalId: "stripe:subscription_item:prod_nested_raw",
      }),
      expect.objectContaining({
        objectType: "subscription_item",
        externalId: "stripe:subscription_item:prod_snake_raw",
      }),
      expect.objectContaining({
        objectType: "subscription_item",
        externalId: "stripe:subscription_item:plan_nested_raw",
      }),
    ]));
  });

  it("uses JSON:API relationship resource identifier arrays for stable nested provider external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        subscriptionItems: [
          {
            data: {
              type: "subscription_items",
              relationships: {
                price: {
                  data: [
                    {
                      type: "prices",
                      id: "price_json_api_relationship_array",
                    },
                  ],
                },
              },
            },
            created: "2026-05-28T12:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "subscription_item",
        externalId: "stripe:subscription_item:price_json_api_relationship_array",
      }),
    ]));
  });

  it("uses Stripe pricing IDs for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        subscriptionItems: [
          {
            pricing: {
              id: "price_pricing_nested_raw",
            },
            created: "2026-05-28T12:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "subscription_item",
        externalId: "stripe:subscription_item:price_pricing_nested_raw",
      }),
    ]));
  });

  it("uses nested Stripe pricing price detail IDs for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        subscriptionItems: [
          {
            pricing: {
              price_details: {
                price: "price_detail_nested_raw",
              },
            },
            created: "2026-05-28T12:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "subscription_item",
        externalId: "stripe:subscription_item:price_detail_nested_raw",
      }),
    ]));
  });

  it("uses nested Stripe payment object IDs for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        paymentIntents: [
          {
            paymentIntent: {
              id: "pi_nested_raw",
            },
            created: "2026-05-28T12:00:00.000Z",
          },
        ],
        charges: [
          {
            charge: {
              id: "ch_nested_raw",
            },
            created: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "payment_intent",
        externalId: "stripe:payment_intent:pi_nested_raw",
      }),
      expect.objectContaining({
        objectType: "charge",
        externalId: "stripe:charge:ch_nested_raw",
      }),
    ]));
  });

  it("uses Stripe payment intent ID aliases before customer IDs for stable payment intent external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        paymentIntents: [
          {
            customerId: "cus_123",
            paymentIntentId: "pi_1",
            amount: 4500,
            created: "2026-05-28T12:00:00.000Z",
          },
          {
            customer_id: "cus_123",
            payment_intent_id: "pi_2",
            amount: 1200,
            created: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    const paymentIntents = records.filter((record) => record.objectType === "payment_intent");
    expect(paymentIntents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        externalId: "stripe:payment_intent:pi_1",
        payload: expect.objectContaining({
          paymentIntentId: "pi_1",
        }),
      }),
      expect.objectContaining({
        externalId: "stripe:payment_intent:pi_2",
        payload: expect.objectContaining({
          payment_intent_id: "pi_2",
        }),
      }),
    ]));
    expect(paymentIntents).toHaveLength(2);
  });

  it("uses Stripe dispute ID aliases before charge IDs for stable dispute external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        disputes: [
          {
            charge: "ch_1",
            disputeId: "dp_1",
            amount: 5_000,
            status: "lost",
            created: "2026-05-28T12:00:00.000Z",
          },
          {
            charge_id: "ch_2",
            dispute_id: "dp_2",
            amount: 2_500,
            status: "won",
            created: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    const disputes = records.filter((record) => record.objectType === "dispute");
    expect(disputes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        externalId: "stripe:dispute:dp_1",
        payload: expect.objectContaining({
          disputeId: "dp_1",
        }),
      }),
      expect.objectContaining({
        externalId: "stripe:dispute:dp_2",
        payload: expect.objectContaining({
          dispute_id: "dp_2",
        }),
      }),
    ]));
    expect(disputes).toHaveLength(2);
  });

  it("uses Stripe refund ID aliases before charge IDs for stable refund external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        refunds: [
          {
            charge: "ch_1",
            refundId: "re_1",
            amount: 5_000,
            status: "succeeded",
            created: "2026-05-28T12:00:00.000Z",
          },
          {
            charge_id: "ch_2",
            refund_id: "re_2",
            amount: 2_500,
            status: "pending",
            created: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    const refunds = records.filter((record) => record.objectType === "refund");
    expect(refunds).toEqual(expect.arrayContaining([
      expect.objectContaining({
        externalId: "stripe:refund:re_1",
        payload: expect.objectContaining({
          refundId: "re_1",
        }),
      }),
      expect.objectContaining({
        externalId: "stripe:refund:re_2",
        payload: expect.objectContaining({
          refund_id: "re_2",
        }),
      }),
    ]));
    expect(refunds).toHaveLength(2);
  });

  it("uses Stripe balance transaction ID aliases for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        balanceTransactions: [
          {
            balanceTransactionId: "txn_1",
            source: "ch_1",
            amount: 12_000,
            fee: 700,
            net: 11_300,
            created: "2026-05-28T12:00:00.000Z",
          },
          {
            balance_transaction_id: "txn_2",
            source: "re_1",
            amount: -2_500,
            fee: 0,
            net: -2_500,
            created: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    const balanceTransactions = records.filter((record) => record.objectType === "balance_transaction");
    expect(balanceTransactions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        externalId: "stripe:balance_transaction:txn_1",
        payload: expect.objectContaining({
          balanceTransactionId: "txn_1",
          fee: 700,
          net: 11_300,
        }),
      }),
      expect.objectContaining({
        externalId: "stripe:balance_transaction:txn_2",
        payload: expect.objectContaining({
          balance_transaction_id: "txn_2",
          net: -2_500,
        }),
      }),
    ]));
    expect(balanceTransactions).toHaveLength(2);
  });

  it("uses nested payment and transaction IDs for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.MERCURY,
      snapshotKey: "mercury",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        payments: [
          {
            payment: {
              id: "pay_nested_raw",
            },
            postedAt: "2026-05-28T12:00:00.000Z",
          },
        ],
        transactions: [
          {
            transaction: {
              id: "txn_nested_raw",
            },
            postedAt: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "payment",
        externalId: "mercury:payment:pay_nested_raw",
      }),
      expect.objectContaining({
        objectType: "transaction",
        externalId: "mercury:transaction:txn_nested_raw",
      }),
    ]));
  });

  it("uses Mercury transaction ID aliases before account IDs for stable transaction external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.MERCURY,
      snapshotKey: "mercury",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        transactions: [
          {
            accountId: "acct_1",
            transactionId: "txn_1",
            amount: -4500,
            postedAt: "2026-05-28T12:00:00.000Z",
          },
          {
            account_id: "acct_1",
            transaction_id: "txn_2",
            amount: -1200,
            posted_at: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    const transactions = records.filter((record) => record.objectType === "transaction");
    expect(transactions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        externalId: "mercury:transaction:txn_1",
        payload: expect.objectContaining({
          transactionId: "txn_1",
        }),
      }),
      expect.objectContaining({
        externalId: "mercury:transaction:txn_2",
        payload: expect.objectContaining({
          transaction_id: "txn_2",
        }),
      }),
    ]));
    expect(transactions).toHaveLength(2);
  });

  it("uses nested campaign and ad IDs for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GOOGLE_ADS,
      snapshotKey: "googleAds",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        campaigns: [
          {
            campaign: {
              id: "camp_nested_raw",
            },
            updatedAt: "2026-05-28T12:00:00.000Z",
          },
        ],
        ads: [
          {
            ad: {
              id: "ad_nested_raw",
            },
            updatedAt: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "campaign",
        externalId: "googleAds:campaign:camp_nested_raw",
      }),
      expect.objectContaining({
        objectType: "ad",
        externalId: "googleAds:ad:ad_nested_raw",
      }),
    ]));
  });

  it("uses Google Ads customer and campaign IDs together for stable campaign external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GOOGLE_ADS,
      snapshotKey: "googleAds",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        campaigns: [
          {
            customerId: "customer_1",
            campaignId: "campaign_1",
            spend: 100,
            updatedAt: "2026-05-28T12:00:00.000Z",
          },
          {
            customer_id: "customer_1",
            campaign_id: "campaign_2",
            spend: 200,
            updated_at: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    const campaigns = records.filter((record) => record.objectType === "campaign");
    expect(campaigns).toHaveLength(2);
    expect(campaigns).toEqual(expect.arrayContaining([
      expect.objectContaining({
        externalId: "googleAds:campaign:customer_1:campaign_1",
      }),
      expect.objectContaining({
        externalId: "googleAds:campaign:customer_1:campaign_2",
      }),
    ]));
  });

  it("uses only safe integer numeric provider IDs for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GOOGLE_ADS,
      snapshotKey: "googleAds",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        campaigns: [
          {
            campaignId: 1234567890,
            updatedAt: "2026-05-28T12:00:00.000Z",
          },
          {
            campaignId: 123.45,
            updatedAt: "2026-05-29T12:00:00.000Z",
          },
          {
            campaignId: Number.MAX_SAFE_INTEGER + 1,
            updatedAt: "2026-05-30T12:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "campaign",
        externalId: "googleAds:campaign:1234567890",
      }),
      expect.objectContaining({
        objectType: "campaign",
        externalId: expect.stringMatching(/^googleAds:campaign:2026-05-01:2026-06-01:1:[a-f0-9]{16}$/),
      }),
      expect.objectContaining({
        objectType: "campaign",
        externalId: expect.stringMatching(/^googleAds:campaign:2026-05-01:2026-06-01:2:[a-f0-9]{16}$/),
      }),
    ]));
    expect(records).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "campaign",
        externalId: "googleAds:campaign:123.45",
      }),
      expect.objectContaining({
        objectType: "campaign",
        externalId: "googleAds:campaign:9007199254740992",
      }),
    ]));
  });

  it("uses nested Google Ads ad group IDs for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GOOGLE_ADS,
      snapshotKey: "googleAds",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        adGroups: [
          {
            adGroup: {
              id: "ad_group_nested_raw",
            },
            updatedAt: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "ad_group",
        externalId: "googleAds:ad_group:ad_group_nested_raw",
      }),
    ]));
  });

  it("uses nested Google Ads keyword IDs for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GOOGLE_ADS,
      snapshotKey: "googleAds",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        keywords: [
          {
            keyword: {
              id: "kw_nested_raw",
              text: "imladris analytics",
            },
            updatedAt: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "keyword",
        externalId: "googleAds:keyword:kw_nested_raw",
      }),
    ]));
  });

  it("uses nested Meta Ads ad set IDs for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.META_ADS,
      snapshotKey: "metaAds",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        adSets: [
          {
            adSet: {
              id: "adset_nested_raw",
            },
            updatedAt: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "ad_set",
        externalId: "metaAds:ad_set:adset_nested_raw",
      }),
    ]));
  });

  it("keeps Meta Ads campaigns with the same campaign ID in different ad accounts separate", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.META_ADS,
      snapshotKey: "metaAds",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        campaigns: [
          {
            adAccountId: "act_account_1",
            campaignId: "campaign_shared",
            spend: 100,
            impressions: 1000,
            updatedAt: "2026-05-29T12:00:00.000Z",
          },
          {
            adAccountId: "act_account_2",
            campaignId: "campaign_shared",
            spend: 200,
            impressions: 2000,
            updatedAt: "2026-05-30T12:00:00.000Z",
          },
        ],
      },
    });

    const campaigns = records.filter((record) => record.objectType === "campaign");
    expect(campaigns).toHaveLength(2);
    expect(campaigns.map((record) => record.externalId).sort()).toEqual([
      "metaAds:campaign:act_account_1:campaign_shared",
      "metaAds:campaign:act_account_2:campaign_shared",
    ]);
  });

  it("keeps Meta Ads campaigns separate when ad account and campaign IDs are nested objects", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.META_ADS,
      snapshotKey: "metaAds",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        campaigns: [
          {
            adAccount: { id: "act_nested_account_1" },
            campaign: { id: "campaign_nested_shared" },
            spend: 100,
            impressions: 1000,
            updatedAt: "2026-05-29T12:00:00.000Z",
          },
          {
            adAccount: { id: "act_nested_account_2" },
            campaign: { id: "campaign_nested_shared" },
            spend: 200,
            impressions: 2000,
            updatedAt: "2026-05-30T12:00:00.000Z",
          },
        ],
      },
    });

    const campaigns = records.filter((record) => record.objectType === "campaign");
    expect(campaigns).toHaveLength(2);
    expect(campaigns.map((record) => record.externalId).sort()).toEqual([
      "metaAds:campaign:act_nested_account_1:campaign_nested_shared",
      "metaAds:campaign:act_nested_account_2:campaign_nested_shared",
    ]);
  });

  it("uses nested conversation and message IDs for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.PYLON,
      snapshotKey: "pylon",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        conversations: [
          {
            conversation: {
              id: "conv_nested_raw",
            },
            updatedAt: "2026-05-28T12:00:00.000Z",
          },
        ],
        messages: [
          {
            message: {
              id: "msg_nested_raw",
            },
            updatedAt: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "conversation",
        externalId: "pylon:conversation:conv_nested_raw",
      }),
      expect.objectContaining({
        objectType: "message",
        externalId: "pylon:message:msg_nested_raw",
      }),
    ]));
  });

  it("uses Pylon ticket ID aliases for stable support ticket external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.PYLON,
      snapshotKey: "pylon",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        tickets: [
          {
            ticketId: "ticket_demo_1",
            accountId: "acct_1",
            status: "open",
            updatedAt: "2026-05-28T12:00:00.000Z",
          },
          {
            id: "ticket_demo_1",
            account_id: "acct_1",
            status: "resolved",
            updated_at: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    const allTickets = records.filter((record) => record.objectType === "ticket");
    const tickets = allTickets.filter((record) => record.externalId === "pylon:ticket:ticket_demo_1");
    expect(allTickets).toHaveLength(1);
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({
      objectType: "ticket",
      sourceUpdatedAt: "2026-05-29T12:00:00.000Z",
      payload: expect.objectContaining({
        id: "ticket_demo_1",
        status: "resolved",
      }),
    });
  });

  it("uses HubSpot ticket ID aliases for stable support ticket external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        tickets: [
          {
            ticketId: "ticket_camel_1",
            status: "open",
            updatedAt: "2026-05-28T12:00:00.000Z",
          },
          {
            ticket_id: "ticket_snake_1",
            status: "resolved",
            updated_at: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    const tickets = records.filter((record) => record.objectType === "ticket");
    expect(tickets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        externalId: "hubspot:ticket:ticket_camel_1",
        payload: expect.objectContaining({ ticketId: "ticket_camel_1" }),
      }),
      expect.objectContaining({
        externalId: "hubspot:ticket:ticket_snake_1",
        payload: expect.objectContaining({ ticket_id: "ticket_snake_1" }),
      }),
    ]));
    expect(tickets).toHaveLength(2);
  });

  it("uses Slack message timestamp aliases for stable message external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.SLACK,
      snapshotKey: "slack",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        messages: [
          {
            messageTs: "1779382800.000100",
            channelId: "channel_1",
            text: "Original",
            updatedAt: "2026-05-28T12:00:00.000Z",
          },
          {
            ts: "1779382800.000100",
            channel_id: "channel_1",
            text: "Corrected",
            updated_at: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    const allMessages = records.filter((record) => record.objectType === "message");
    const messages = allMessages.filter((record) => record.externalId === "slack:message:channel_1:1779382800.000100");
    expect(allMessages).toHaveLength(1);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      objectType: "message",
      sourceUpdatedAt: "2026-05-29T12:00:00.000Z",
      payload: expect.objectContaining({
        ts: "1779382800.000100",
        text: "Corrected",
      }),
    });
  });

  it("keeps Slack messages with the same timestamp in different channels separate", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.SLACK,
      snapshotKey: "slack",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        messages: [
          {
            messageTs: "1779382800.000100",
            channelId: "channel_1",
            text: "Customer team follow-up",
            updatedAt: "2026-05-28T12:00:00.000Z",
          },
          {
            message_ts: "1779382800.000100",
            channel_id: "channel_2",
            text: "Internal team follow-up",
            updated_at: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    const messages = records.filter((record) => record.objectType === "message");
    expect(messages).toHaveLength(2);
    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        externalId: "slack:message:channel_1:1779382800.000100",
      }),
      expect.objectContaining({
        externalId: "slack:message:channel_2:1779382800.000100",
      }),
    ]));
  });

  it("uses Slack thread timestamp aliases for stable thread external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.SLACK,
      snapshotKey: "slack",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        threads: [
          {
            threadTs: "1779382800.000100",
            channelId: "channel_1",
            text: "Original thread",
            updatedAt: "2026-05-28T12:00:00.000Z",
          },
          {
            thread_ts: "1779382800.000100",
            channel_id: "channel_1",
            text: "Corrected thread",
            updated_at: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    const allThreads = records.filter((record) => record.objectType === "thread");
    const threads = allThreads.filter((record) => record.externalId === "slack:thread:channel_1:1779382800.000100");
    expect(allThreads).toHaveLength(1);
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      objectType: "thread",
      sourceUpdatedAt: "2026-05-29T12:00:00.000Z",
      payload: expect.objectContaining({
        thread_ts: "1779382800.000100",
        text: "Corrected thread",
      }),
    });
  });

  it("uses Slack thread timestamps before message timestamps for thread external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.SLACK,
      snapshotKey: "slack",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        threads: [
          {
            threadTs: "1779382800.000100",
            messageTs: "1779382810.000200",
            channelId: "channel_1",
            text: "Original latest reply",
            updatedAt: "2026-05-28T12:00:00.000Z",
          },
          {
            thread_ts: "1779382800.000100",
            message_ts: "1779382820.000300",
            channel_id: "channel_1",
            text: "New latest reply",
            updated_at: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    const allThreads = records.filter((record) => record.objectType === "thread");
    expect(allThreads).toHaveLength(1);
    expect(allThreads[0]).toMatchObject({
      externalId: "slack:thread:channel_1:1779382800.000100",
      sourceUpdatedAt: "2026-05-29T12:00:00.000Z",
      payload: expect.objectContaining({
        message_ts: "1779382820.000300",
        thread_ts: "1779382800.000100",
      }),
    });
  });

  it("uses nested thread and file IDs for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GOOGLE_WORKSPACE,
      snapshotKey: "googleWorkspace",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        threads: [
          {
            thread: {
              id: "thread_nested_raw",
            },
            updatedAt: "2026-05-28T12:00:00.000Z",
          },
        ],
        files: [
          {
            file: {
              id: "file_nested_raw",
            },
            updatedAt: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "thread",
        externalId: "googleWorkspace:thread:thread_nested_raw",
      }),
      expect.objectContaining({
        objectType: "file",
        externalId: "googleWorkspace:file:file_nested_raw",
      }),
    ]));
  });

  it("uses Google Workspace email thread ID aliases for stable email thread external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GOOGLE_WORKSPACE,
      snapshotKey: "googleWorkspace",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        emailThreads: [
          {
            emailThreadId: "thread_demo_1",
            accountId: "acct_1",
            subject: "Renewal follow-up",
            updatedAt: "2026-05-28T12:00:00.000Z",
          },
          {
            gmail_thread_id: "thread_demo_2",
            accountId: "acct_1",
            subject: "Implementation follow-up",
            updatedAt: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    const emailThreads = records.filter((record) => record.objectType === "email_thread");
    expect(emailThreads).toEqual(expect.arrayContaining([
      expect.objectContaining({
        externalId: "googleWorkspace:email_thread:thread_demo_1",
        payload: expect.objectContaining({
          emailThreadId: "thread_demo_1",
        }),
      }),
      expect.objectContaining({
        externalId: "googleWorkspace:email_thread:thread_demo_2",
        payload: expect.objectContaining({
          gmail_thread_id: "thread_demo_2",
        }),
      }),
    ]));
    expect(emailThreads).toHaveLength(2);
  });

  it("uses Google Workspace calendar event ID aliases for stable event external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GOOGLE_WORKSPACE,
      snapshotKey: "googleWorkspace",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        events: [
          {
            calendarEventId: "event_demo_1",
            accountId: "acct_1",
            summary: "QBR",
            updatedAt: "2026-05-28T12:00:00.000Z",
          },
          {
            eventId: "event_demo_1",
            account_id: "acct_1",
            summary: "QBR Updated",
            updated_at: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    const allEvents = records.filter((record) => record.objectType === "event");
    const events = allEvents.filter((record) => record.externalId === "googleWorkspace:event:event_demo_1");
    expect(allEvents).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      objectType: "event",
      sourceUpdatedAt: "2026-05-29T12:00:00.000Z",
      payload: expect.objectContaining({
        eventId: "event_demo_1",
        summary: "QBR Updated",
      }),
    });
  });

  it("keeps Google Workspace events with the same event ID in different calendars separate", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GOOGLE_WORKSPACE,
      snapshotKey: "googleWorkspace",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        events: [
          {
            calendarId: "calendar_1",
            eventId: "event_demo_1",
            accountId: "acct_1",
            summary: "Customer QBR",
            updatedAt: "2026-05-28T12:00:00.000Z",
          },
          {
            calendar_id: "calendar_2",
            event_id: "event_demo_1",
            account_id: "acct_1",
            summary: "Implementation QBR",
            updated_at: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    const events = records.filter((record) => record.objectType === "event");
    expect(events).toHaveLength(2);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        externalId: "googleWorkspace:event:calendar_1:event_demo_1",
      }),
      expect.objectContaining({
        externalId: "googleWorkspace:event:calendar_2:event_demo_1",
      }),
    ]));
  });

  it("uses Google Workspace calendar event ID aliases for stable calendar event external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GOOGLE_WORKSPACE,
      snapshotKey: "googleWorkspace",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        calendarEvents: [
          {
            calendarEventId: "event_demo_1",
            accountId: "acct_1",
            summary: "QBR",
            updatedAt: "2026-05-28T12:00:00.000Z",
          },
          {
            iCalUID: "event_demo_2",
            accountId: "acct_1",
            summary: "Implementation review",
            updatedAt: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    const calendarEvents = records.filter((record) => record.objectType === "calendar_event");
    expect(calendarEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        externalId: "googleWorkspace:calendar_event:event_demo_1",
        payload: expect.objectContaining({
          calendarEventId: "event_demo_1",
        }),
      }),
      expect.objectContaining({
        externalId: "googleWorkspace:calendar_event:event_demo_2",
        payload: expect.objectContaining({
          iCalUID: "event_demo_2",
        }),
      }),
    ]));
    expect(calendarEvents).toHaveLength(2);
  });

  it("uses Google Workspace calendar event start times as raw record occurrence times", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GOOGLE_WORKSPACE,
      snapshotKey: "googleWorkspace",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        calendarEvents: [
          {
            eventId: "event_demo_1",
            summary: "Demo with Gamma",
            startedAt: "2026-05-12T17:00:00.000Z",
            updatedAt: "2026-05-20T17:00:00.000Z",
          },
        ],
      },
    });

    expect(records.find((record) => record.objectType === "calendar_event")).toMatchObject({
      externalId: "googleWorkspace:calendar_event:event_demo_1",
      occurredAt: "2026-05-12T17:00:00.000Z",
      sourceUpdatedAt: "2026-05-20T17:00:00.000Z",
    });
  });

  it("uses Google Workspace document ID aliases for stable document external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GOOGLE_WORKSPACE,
      snapshotKey: "googleWorkspace",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        documents: [
          {
            documentId: "doc_demo_1",
            accountId: "acct_1",
            title: "Launch Plan",
            updatedAt: "2026-05-28T12:00:00.000Z",
          },
          {
            fileId: "doc_demo_1",
            account_id: "acct_1",
            title: "Launch Plan v2",
            updated_at: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    const allDocuments = records.filter((record) => record.objectType === "document");
    const documents = allDocuments.filter((record) => record.externalId === "googleWorkspace:document:doc_demo_1");
    expect(allDocuments).toHaveLength(1);
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({
      objectType: "document",
      sourceUpdatedAt: "2026-05-29T12:00:00.000Z",
      payload: expect.objectContaining({
        fileId: "doc_demo_1",
        title: "Launch Plan v2",
      }),
    });
  });

  it("uses Google Workspace document ID aliases for stable file external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GOOGLE_WORKSPACE,
      snapshotKey: "googleWorkspace",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        files: [
          {
            documentId: "doc_demo_1",
            accountId: "acct_1",
            name: "Launch Plan",
            updatedAt: "2026-05-28T12:00:00.000Z",
          },
          {
            document_id: "doc_demo_2",
            accountId: "acct_1",
            name: "Implementation Plan",
            updatedAt: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    const files = records.filter((record) => record.objectType === "file");
    expect(files).toEqual(expect.arrayContaining([
      expect.objectContaining({
        externalId: "googleWorkspace:file:doc_demo_1",
        payload: expect.objectContaining({
          documentId: "doc_demo_1",
        }),
      }),
      expect.objectContaining({
        externalId: "googleWorkspace:file:doc_demo_2",
        payload: expect.objectContaining({
          document_id: "doc_demo_2",
        }),
      }),
    ]));
    expect(files).toHaveLength(2);
  });

  it("uses nested account IDs for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.MERCURY,
      snapshotKey: "mercury",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        accounts: [
          {
            account: {
              id: "acct_nested_raw",
              name: "Operating",
            },
            availableBalance: 12500,
            updatedAt: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "account_balance",
        externalId: "mercury:account_balance:acct_nested_raw",
      }),
    ]));
  });

  it("uses Map-backed nested provider object IDs for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        subscriptions: [
          {
            status: "active",
            customer: new Map<string, unknown>([
              ["id", "cus_map_nested_raw"],
              ["email", "billing@example.com"],
            ]),
            updatedAt: "2026-05-29T12:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "subscription",
        externalId: "stripe:subscription:cus_map_nested_raw",
        payload: expect.objectContaining({
          customer: {
            id: "cus_map_nested_raw",
            email: "billing@example.com",
          },
        }),
      }),
    ]));
  });

  it("reads nested provider properties for stable raw record IDs and freshness", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        deals: [
          {
            archived: false,
            properties: {
              hs_object_id: "deal_nested_1",
              dealname: "Acme expansion",
              createdate: "2026-05-03T08:00:00.000Z",
              hs_lastmodifieddate: "2026-05-29T17:30:00.000Z",
            },
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "deal",
        externalId: "hubspot:deal:deal_nested_1",
        sourceCreatedAt: "2026-05-03T08:00:00.000Z",
        occurredAt: "2026-05-03T08:00:00.000Z",
        sourceUpdatedAt: "2026-05-29T17:30:00.000Z",
      }),
    ]));
  });

  it("reads uppercase nested provider properties for stable raw record IDs and freshness", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        deals: [
          {
            archived: false,
            PROPERTIES: {
              hs_object_id: "deal_uppercase_properties_1",
              dealname: "Uppercase wrapper expansion",
              createdate: "2026-05-03T08:00:00.000Z",
              hs_lastmodifieddate: "2026-05-29T17:30:00.000Z",
            },
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "deal",
        externalId: "hubspot:deal:deal_uppercase_properties_1",
        sourceCreatedAt: "2026-05-03T08:00:00.000Z",
        occurredAt: "2026-05-03T08:00:00.000Z",
        sourceUpdatedAt: "2026-05-29T17:30:00.000Z",
      }),
    ]));
  });

  it("reads Map-backed provider properties for stable raw record IDs and freshness", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        deals: [
          {
            archived: false,
            properties: new Map<string, unknown>([
              ["hs_object_id", "deal_map_properties_1"],
              ["dealname", "Map-backed expansion"],
              ["createdate", "2026-05-04T08:00:00.000Z"],
              ["hs_lastmodifieddate", "2026-05-30T17:30:00.000Z"],
            ]),
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "deal",
        externalId: "hubspot:deal:deal_map_properties_1",
        sourceCreatedAt: "2026-05-04T08:00:00.000Z",
        occurredAt: "2026-05-04T08:00:00.000Z",
        sourceUpdatedAt: "2026-05-30T17:30:00.000Z",
        payload: expect.objectContaining({
          properties: {
            hs_object_id: "deal_map_properties_1",
            dealname: "Map-backed expansion",
            createdate: "2026-05-04T08:00:00.000Z",
            hs_lastmodifieddate: "2026-05-30T17:30:00.000Z",
          },
        }),
      }),
    ]));
  });

  it("keeps the freshest duplicate raw record from a provider payload", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        deals: [
          {
            id: "deal_duplicate",
            amount: 42_000,
            updatedAt: "2026-05-31T10:00:00.000Z",
          },
          {
            id: "deal_duplicate",
            amount: 12_000,
            updatedAt: "2026-05-01T10:00:00.000Z",
          },
        ],
      },
    });

    const duplicateDeals = records.filter((record) => record.externalId === "hubspot:deal:deal_duplicate");
    expect(duplicateDeals).toHaveLength(1);
    expect(duplicateDeals[0]).toMatchObject({
      objectType: "deal",
      sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
      payload: expect.objectContaining({
        amount: 42_000,
      }),
    });
  });

  it("uses wrapped synced_at timestamps when choosing the freshest duplicate raw record", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        activeCustomerRefs: [
          {
            customer: {
              values: {
                id: "cus_synced_duplicate",
              },
            },
            values: {
              synced_at: "2026-05-29T10:00:00.000Z",
              mrr: 1200,
            },
          },
          {
            customer: {
              values: {
                id: "cus_synced_duplicate",
              },
            },
            values: {
              synced_at: "2026-05-31T10:00:00.000Z",
              mrr: 2400,
            },
          },
        ],
      },
    });

    const duplicateCustomers = records.filter(
      (record) => record.externalId === "stripe:active_customer_ref:cus_synced_duplicate",
    );
    expect(duplicateCustomers).toHaveLength(1);
    expect(duplicateCustomers[0]).toMatchObject({
      objectType: "active_customer_ref",
      sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
      payload: expect.objectContaining({
        values: expect.objectContaining({
          mrr: 2400,
        }),
      }),
    });
  });

  it("prefers duplicate raw records with explicit provider timestamps over snapshot fallback timestamps", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        deals: [
          {
            id: "deal_duplicate_fallback",
            amount: 42_000,
            updatedAt: "2026-05-31T10:00:00.000Z",
          },
          {
            id: "deal_duplicate_fallback",
            amount: 12_000,
          },
        ],
      },
    });

    const duplicateDeals = records.filter((record) => record.externalId === "hubspot:deal:deal_duplicate_fallback");
    expect(duplicateDeals).toHaveLength(1);
    expect(duplicateDeals[0]).toMatchObject({
      objectType: "deal",
      sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
      payload: expect.objectContaining({
        amount: 42_000,
      }),
    });
  });

  it("uses Google Search Console row keys for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GOOGLE_SEARCH_CONSOLE,
      snapshotKey: "googleSearchConsole",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        rows: [
          {
            keys: ["imladris analytics", "https://example.com/pricing"],
            clicks: 120,
            impressions: 2400,
            updatedAt: "2026-05-29T10:00:00.000Z",
          },
          {
            keys: ["imladris analytics", "https://example.com/pricing"],
            clicks: 150,
            impressions: 2600,
            updatedAt: "2026-05-31T10:00:00.000Z",
          },
        ],
      },
    });

    const rows = records.filter(
      (record) => record.externalId === "googleSearchConsole:row:imladris analytics:https://example.com/pricing",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      objectType: "row",
      sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
      payload: expect.objectContaining({
        clicks: 150,
        impressions: 2600,
      }),
    });
  });

  it("unwraps scalar Google Search Console row keys for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GOOGLE_SEARCH_CONSOLE,
      snapshotKey: "googleSearchConsole",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        rows: [
          {
            keys: [
              { value: "imladris analytics" },
              { data: { attributes: { value: "https://example.com/pricing" } } },
            ],
            clicks: 120,
            impressions: 2400,
            updatedAt: "2026-05-29T10:00:00.000Z",
          },
          {
            keys: [
              { value: "imladris analytics" },
              { data: { attributes: { value: "https://example.com/pricing" } } },
            ],
            clicks: 150,
            impressions: 2600,
            updatedAt: "2026-05-31T10:00:00.000Z",
          },
        ],
      },
    });

    const rows = records.filter(
      (record) => record.externalId === "googleSearchConsole:row:imladris analytics:https://example.com/pricing",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      objectType: "row",
      sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
      payload: expect.objectContaining({
        clicks: 150,
        impressions: 2600,
      }),
    });
  });

  it("unwraps Google Search Console dimension containers for stable raw record external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GOOGLE_SEARCH_CONSOLE,
      snapshotKey: "googleSearchConsole",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        rows: [
          {
            dimensions: {
              data: [
                { value: "imladris analytics" },
                { value: "https://example.com/pricing" },
              ],
            },
            clicks: 120,
            impressions: 2400,
            updatedAt: "2026-05-29T10:00:00.000Z",
          },
          {
            dimensions: {
              data: [
                { value: "imladris analytics" },
                { value: "https://example.com/pricing" },
              ],
            },
            clicks: 150,
            impressions: 2600,
            updatedAt: "2026-05-31T10:00:00.000Z",
          },
        ],
      },
    });

    const rows = records.filter(
      (record) => record.externalId === "googleSearchConsole:row:imladris analytics:https://example.com/pricing",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      objectType: "row",
      sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
      payload: expect.objectContaining({
        clicks: 150,
        impressions: 2600,
      }),
    });
  });

  it("uses Webflow form names for stable form submission aggregate external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.WEBFLOW,
      snapshotKey: "webflow",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        formSubmissions: [
          {
            formName: "Demo Request",
            count: 3,
            updatedAt: "2026-05-29T10:00:00.000Z",
          },
          {
            formName: "Demo Request",
            count: 5,
            updatedAt: "2026-05-31T10:00:00.000Z",
          },
        ],
      },
    });

    const submissions = records.filter(
      (record) => record.externalId === "webflow:form_submission:Demo Request",
    );
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      objectType: "form_submission",
      sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
      payload: expect.objectContaining({
        count: 5,
      }),
    });
  });

  it("uses Webflow submission ID aliases for stable form submission external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.WEBFLOW,
      snapshotKey: "webflow",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        formSubmissions: [
          {
            submissionId: "sub_demo_1",
            formId: "demo-request",
            email: "ada@example.com",
            submittedAt: "2026-05-10T12:00:00.000Z",
            updatedAt: "2026-05-10T12:00:00.000Z",
          },
          {
            id: "sub_demo_1",
            form_id: "demo-request",
            contact: {
              email: "ada@example.com",
            },
            submitted_at: "2026-05-10T12:00:00.000Z",
            updated_at: "2026-05-11T12:00:00.000Z",
          },
        ],
      },
    });

    const allFormSubmissions = records.filter((record) => record.objectType === "form_submission");
    const submissions = allFormSubmissions.filter(
      (record) => record.externalId === "webflow:form_submission:sub_demo_1",
    );
    expect(allFormSubmissions).toHaveLength(1);
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      objectType: "form_submission",
      sourceUpdatedAt: "2026-05-11T12:00:00.000Z",
      payload: expect.objectContaining({
        id: "sub_demo_1",
      }),
    });
  });

  it("uses Webflow detailed submission IDs for stable form submission detail external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.WEBFLOW,
      snapshotKey: "webflow",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        formSubmissionDetails: [
          {
            submissionId: "sub_demo_1",
            formId: "demo-request",
            formName: "Request a demo",
            submittedAt: "2026-05-10T12:00:00.000Z",
            pageUrl: "https://arda.cards/demo",
            fields: {
              email: "ada@example.com",
              company: "Gamma",
            },
          },
        ],
      },
    });

    const submissions = records.filter(
      (record) => record.externalId === "webflow:form_submission_detail:sub_demo_1",
    );
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      objectType: "form_submission_detail",
      occurredAt: "2026-05-10T12:00:00.000Z",
      payload: expect.objectContaining({
        submissionId: "sub_demo_1",
        formName: "Request a demo",
      }),
    });
  });

  it("uses Unify visitor ID aliases for stable visitor external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.UNIFY,
      snapshotKey: "unify",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        visitors: [
          {
            visitorId: "vis_demo_1",
            companyDomain: "example.com",
            identified: true,
            updatedAt: "2026-05-10T12:00:00.000Z",
          },
          {
            id: "vis_demo_1",
            company_domain: "example.com",
            identified: true,
            updated_at: "2026-05-11T12:00:00.000Z",
          },
        ],
      },
    });

    const allVisitors = records.filter((record) => record.objectType === "visitor");
    const visitors = allVisitors.filter((record) => record.externalId === "unify:visitor:vis_demo_1");
    expect(allVisitors).toHaveLength(1);
    expect(visitors).toHaveLength(1);
    expect(visitors[0]).toMatchObject({
      objectType: "visitor",
      sourceUpdatedAt: "2026-05-11T12:00:00.000Z",
      payload: expect.objectContaining({
        id: "vis_demo_1",
      }),
    });
  });

  it("uses visitor-funnel signal identity fallback before batch position for stable signal external IDs", () => {
    const firstSignal = {
      anonymousId: "anon_1",
      email: "first@example.com",
      domain: "example.com",
      occurredAt: "2026-05-10T12:00:00.000Z",
      confidence: 0.92,
    };
    const secondSignal = {
      anonymousId: "anon_2",
      email: "second@example.com",
      domain: "example.com",
      occurredAt: "2026-05-11T12:00:00.000Z",
      confidence: 0.87,
    };
    const input = {
      provider: IntegrationProvider.UNIFY,
      snapshotKey: "visitorFunnel",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
    } as const;

    const firstBatch = buildImladrisRawRecordsFromPayload({
      ...input,
      payload: {
        signals: [firstSignal, secondSignal],
      },
    });
    const replayedBatch = buildImladrisRawRecordsFromPayload({
      ...input,
      payload: {
        signals: [secondSignal, firstSignal],
      },
    });

    const firstBatchSignal = firstBatch.find(
      (record) => (record.payload as { email?: unknown }).email === "first@example.com",
    );
    const replayedSignal = replayedBatch.find(
      (record) => (record.payload as { email?: unknown }).email === "first@example.com",
    );
    const replayedSignals = replayedBatch.filter((record) => record.objectType === "signal");

    expect(firstBatchSignal).toMatchObject({
      objectType: "signal",
      externalId: expect.stringMatching(/^visitorFunnel:signal:/),
    });
    expect(replayedSignal).toMatchObject({
      objectType: "signal",
    });
    expect(replayedSignal?.externalId).toBe(firstBatchSignal?.externalId);
    expect(new Set(replayedSignals.map((record) => record.externalId)).size).toBe(2);
  });

  it("keeps unkeyed visitor-funnel signals separate when no event timestamp is available", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.UNIFY,
      snapshotKey: "visitorFunnel",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        signals: [
          {
            domain: "example.com",
            companyName: "Example Inc",
            confidence: 0.72,
          },
          {
            domain: "example.com",
            companyName: "Example Inc",
            confidence: 0.81,
          },
        ],
      },
    });

    const signals = records.filter((record) => record.objectType === "signal");
    expect(signals).toHaveLength(2);
    expect(new Set(signals.map((record) => record.externalId)).size).toBe(2);
  });

  it("keeps visitor-funnel signals from different enrichment providers separate", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.UNIFY,
      snapshotKey: "visitorFunnel",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        signals: [
          {
            enrichmentProvider: "clay",
            email: "lead@example.com",
            domain: "example.com",
            occurredAt: "2026-05-10T12:00:00.000Z",
            confidence: 0.82,
          },
          {
            enrichmentProvider: "rb2b",
            email: "lead@example.com",
            domain: "example.com",
            occurredAt: "2026-05-10T12:00:00.000Z",
            confidence: 0.76,
          },
        ],
      },
    });

    const signals = records.filter((record) => record.objectType === "signal");
    expect(signals).toHaveLength(2);
    expect(new Set(signals.map((record) => record.externalId)).size).toBe(2);
    expect(signals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        payload: expect.objectContaining({ enrichmentProvider: "clay" }),
      }),
      expect.objectContaining({
        payload: expect.objectContaining({ enrichmentProvider: "rb2b" }),
      }),
    ]));
  });

  it("uses Reddit Ads campaign ID aliases for stable campaign metric external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.REDDIT,
      snapshotKey: "redditAds",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        campaigns: [
          {
            CAMPAIGN_ID: "reddit_campaign_1",
            spend: 1_000_000,
            impressions: 100,
            updatedAt: "2026-05-10T12:00:00.000Z",
          },
          {
            campaignId: "reddit_campaign_1",
            spend: 2_000_000,
            impressions: 150,
            updated_at: "2026-05-11T12:00:00.000Z",
          },
        ],
      },
    });

    const allCampaigns = records.filter((record) => record.objectType === "campaign");
    const campaigns = allCampaigns.filter(
      (record) => record.externalId === "redditAds:campaign:reddit_campaign_1",
    );
    expect(allCampaigns).toHaveLength(1);
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0]).toMatchObject({
      objectType: "campaign",
      sourceUpdatedAt: "2026-05-11T12:00:00.000Z",
      payload: expect.objectContaining({
        campaignId: "reddit_campaign_1",
        spend: 2_000_000,
      }),
    });
  });

  it("keeps Reddit Ads campaigns with the same campaign ID in different ad accounts separate", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.REDDIT,
      snapshotKey: "redditAds",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        campaigns: [
          {
            adAccountId: "reddit_account_1",
            CAMPAIGN_ID: "reddit_campaign_shared",
            spend: 1_000_000,
            impressions: 100,
            updatedAt: "2026-05-10T12:00:00.000Z",
          },
          {
            adAccountId: "reddit_account_2",
            campaignId: "reddit_campaign_shared",
            spend: 2_000_000,
            impressions: 150,
            updated_at: "2026-05-11T12:00:00.000Z",
          },
        ],
      },
    });

    const campaigns = records.filter((record) => record.objectType === "campaign");
    expect(campaigns).toHaveLength(2);
    expect(campaigns.map((record) => record.externalId).sort()).toEqual([
      "redditAds:campaign:reddit_account_1:reddit_campaign_shared",
      "redditAds:campaign:reddit_account_2:reddit_campaign_shared",
    ]);
  });

  it("keeps Reddit Ads uppercase campaign IDs separate by uppercase ad account IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.REDDIT,
      snapshotKey: "redditAds",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        campaigns: [
          {
            AD_ACCOUNT_ID: "reddit_upper_account_1",
            CAMPAIGN_ID: "reddit_upper_campaign_shared",
            SPEND: "1000000000",
            IMPRESSIONS: "100",
            updatedAt: "2026-05-10T12:00:00.000Z",
          },
          {
            AD_ACCOUNT_ID: "reddit_upper_account_2",
            CAMPAIGN_ID: "reddit_upper_campaign_shared",
            SPEND: "2000000000",
            IMPRESSIONS: "150",
            updated_at: "2026-05-11T12:00:00.000Z",
          },
        ],
      },
    });

    const campaigns = records.filter((record) => record.objectType === "campaign");
    expect(campaigns).toHaveLength(2);
    expect(campaigns.map((record) => record.externalId).sort()).toEqual([
      "redditAds:campaign:reddit_upper_account_1:reddit_upper_campaign_shared",
      "redditAds:campaign:reddit_upper_account_2:reddit_upper_campaign_shared",
    ]);
  });

  it("uses the snapshot range end for historical records without provider timestamps", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GOOGLE_ANALYTICS,
      snapshotKey: "googleAnalytics",
      from: "2026-05-01",
      to: "2026-05-31T23:59:59.999Z",
      capturedAt: new Date("2026-06-15T12:00:00.000Z"),
      payload: {
        summary: {
          sessions: 4200,
        },
        channels: [
          {
            id: "organic",
            sessions: 2400,
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "snapshot",
        externalId: "googleAnalytics:snapshot:2026-05-01:2026-05-31T23:59:59.999Z",
        occurredAt: "2026-05-31T23:59:59.999Z",
        sourceUpdatedAt: "2026-05-31T23:59:59.999Z",
      }),
      expect.objectContaining({
        objectType: "channel",
        externalId: "googleAnalytics:channel:organic",
        occurredAt: "2026-05-31T23:59:59.999Z",
        sourceUpdatedAt: "2026-05-31T23:59:59.999Z",
      }),
      expect.objectContaining({
        objectType: "summary_summary",
        externalId: "googleAnalytics:summary_summary:2026-05-01:2026-05-31T23:59:59.999Z",
        occurredAt: "2026-05-31T23:59:59.999Z",
        sourceUpdatedAt: "2026-05-31T23:59:59.999Z",
      }),
    ]));
  });

  it("does not create future fallback timestamps when the requested snapshot end is after capture", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.MERCURY,
      snapshotKey: "mercury",
      from: "2026-05-01",
      to: "2099-01-01T00:00:00.000Z",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        accounts: [
          {
            id: "acct_future_window",
            availableBalance: 12500,
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "snapshot",
        externalId: "mercury:snapshot:2026-05-01:2099-01-01T00:00:00.000Z",
        occurredAt: "2026-06-01T12:00:00.000Z",
        sourceUpdatedAt: "2026-06-01T12:00:00.000Z",
      }),
      expect.objectContaining({
        objectType: "account_balance",
        externalId: "mercury:account_balance:acct_future_window",
        occurredAt: "2026-06-01T12:00:00.000Z",
        sourceUpdatedAt: "2026-06-01T12:00:00.000Z",
      }),
    ]));
  });

  it("extracts raw records from top-level provider arrays", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.SEMRUSH,
      snapshotKey: "semrush",
      from: "2026-05-01",
      to: "2026-05-31T23:59:59.999Z",
      capturedAt: new Date("2026-06-15T12:00:00.000Z"),
      payload: [
        {
          query: "imladris metrics",
          organicTraffic: 1200,
        },
        {
          query: "board metrics",
          organicTraffic: 800,
        },
      ],
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "snapshot",
        externalId: "semrush:snapshot:2026-05-01:2026-05-31T23:59:59.999Z",
        payload: expect.objectContaining({
          records: [
            { query: "imladris metrics", organicTraffic: 1200 },
            { query: "board metrics", organicTraffic: 800 },
          ],
        }),
      }),
      expect.objectContaining({
        objectType: "record",
        externalId: "semrush:record:imladris metrics",
        occurredAt: "2026-05-31T23:59:59.999Z",
        sourceUpdatedAt: "2026-05-31T23:59:59.999Z",
        payload: expect.objectContaining({
          query: "imladris metrics",
          organicTraffic: 1200,
          sourcePath: "",
          snapshotKey: "semrush",
        }),
      }),
      expect.objectContaining({
        objectType: "record",
        externalId: "semrush:record:board metrics",
        occurredAt: "2026-05-31T23:59:59.999Z",
        sourceUpdatedAt: "2026-05-31T23:59:59.999Z",
      }),
    ]));
  });

  it("uses SEMrush competitor domains for stable organic competitor external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.SEMRUSH,
      snapshotKey: "semrush",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        organicCompetitors: [
          {
            domain: "competitor.example",
            commonKeywords: 12,
            organicTraffic: 800,
            updatedAt: "2026-05-29T10:00:00.000Z",
          },
          {
            domain: "competitor.example",
            commonKeywords: 16,
            organicTraffic: 950,
            updatedAt: "2026-05-31T10:00:00.000Z",
          },
        ],
      },
    });

    const competitors = records.filter(
      (record) => record.externalId === "semrush:organic_competitor:competitor.example",
    );
    expect(competitors).toHaveLength(1);
    expect(competitors[0]).toMatchObject({
      objectType: "organic_competitor",
      sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
      payload: expect.objectContaining({
        commonKeywords: 16,
        organicTraffic: 950,
      }),
    });
  });

  it("uses wrapped snake_case SEMrush competitor domains for stable organic competitor external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.SEMRUSH,
      snapshotKey: "semrush",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        organicCompetitors: [
          {
            values: {
              competitor_domain: "competitor.example",
              commonKeywords: 12,
              organicTraffic: 800,
              updatedAt: "2026-05-29T10:00:00.000Z",
            },
          },
          {
            values: {
              competitor_domain: "competitor.example",
              commonKeywords: 16,
              organicTraffic: 950,
              updatedAt: "2026-05-31T10:00:00.000Z",
            },
          },
        ],
      },
    });

    const competitors = records.filter(
      (record) => record.externalId === "semrush:organic_competitor:competitor.example",
    );
    expect(competitors).toHaveLength(1);
    expect(competitors[0]).toMatchObject({
      objectType: "organic_competitor",
      sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
      payload: expect.objectContaining({
        values: expect.objectContaining({
          commonKeywords: 16,
          organicTraffic: 950,
        }),
      }),
    });
  });

  it("unwraps scalar SEMrush competitor domains for stable organic competitor external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.SEMRUSH,
      snapshotKey: "semrush",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        organicCompetitors: [
          {
            competitor_domain: { value: " competitor.example " },
            commonKeywords: 12,
            organicTraffic: 800,
            updatedAt: "2026-05-29T10:00:00.000Z",
          },
          {
            competitor_domain: { data: { attributes: { value: " competitor.example " } } },
            commonKeywords: 16,
            organicTraffic: 950,
            updatedAt: "2026-05-31T10:00:00.000Z",
          },
        ],
      },
    });

    const competitors = records.filter(
      (record) => record.externalId === "semrush:organic_competitor:competitor.example",
    );
    expect(competitors).toHaveLength(1);
    expect(competitors[0]).toMatchObject({
      objectType: "organic_competitor",
      sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
      payload: expect.objectContaining({
        commonKeywords: 16,
        organicTraffic: 950,
      }),
    });
  });

  it("preserves status words when deriving raw record object types", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.CODA,
      snapshotKey: "coda",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        cardsByStatus: [
          {
            status: "Qualified",
            count: 12,
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "cards_by_status",
        externalId: "coda:cards_by_status:Qualified",
      }),
    ]));
    expect(records).toEqual(expect.not.arrayContaining([
      expect.objectContaining({
        objectType: "cards_by_statu",
      }),
    ]));
  });

  it("preserves singular object type words that already end in ss", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        business: [
          {
            id: "business_1",
            name: "Imladris Metrics LLC",
            updatedAt: "2026-05-31T10:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "business",
        externalId: "hubspot:business:business_1",
      }),
    ]));
    expect(records).toEqual(expect.not.arrayContaining([
      expect.objectContaining({
        objectType: "busines",
      }),
    ]));
  });

  it("preserves singular object type words that already end in sis", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GOOGLE_ANALYTICS,
      snapshotKey: "google_analytics",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        analysis: [
          {
            id: "analysis_1",
            name: "Activation segment analysis",
            updatedAt: "2026-05-31T10:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "analysis",
        externalId: "google_analytics:analysis:analysis_1",
      }),
    ]));
    expect(records).toEqual(expect.not.arrayContaining([
      expect.objectContaining({
        objectType: "analysi",
      }),
    ]));
  });

  it("normalizes plural analyses object type words to analysis", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GOOGLE_ANALYTICS,
      snapshotKey: "google_analytics",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        analyses: [
          {
            id: "analysis_segment",
            name: "Activation segment analysis",
            updatedAt: "2026-05-31T10:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "analysis",
        externalId: "google_analytics:analysis:analysis_segment",
      }),
    ]));
    expect(records).toEqual(expect.not.arrayContaining([
      expect.objectContaining({
        objectType: "analys",
      }),
    ]));
  });

  it("normalizes plural indices object type words to index", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GOOGLE_SEARCH_CONSOLE,
      snapshotKey: "google_search_console",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        indices: [
          {
            id: "search_index_primary",
            name: "Primary search index",
            updatedAt: "2026-05-31T10:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "index",
        externalId: "google_search_console:index:search_index_primary",
      }),
    ]));
    expect(records).toEqual(expect.not.arrayContaining([
      expect.objectContaining({
        objectType: "indice",
      }),
    ]));
  });

  it("preserves singular object type words that already end in ries", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GOOGLE_ANALYTICS,
      snapshotKey: "google_analytics",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        series: [
          {
            id: "series_activation",
            name: "Activation time series",
            updatedAt: "2026-05-31T10:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "series",
        externalId: "google_analytics:series:series_activation",
      }),
    ]));
    expect(records).toEqual(expect.not.arrayContaining([
      expect.objectContaining({
        objectType: "sery",
      }),
    ]));
  });

  it("preserves analytics object type words", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.GOOGLE_ANALYTICS,
      snapshotKey: "google_analytics",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        analytics: [
          {
            id: "analytics_activation",
            name: "Activation analytics",
            updatedAt: "2026-05-31T10:00:00.000Z",
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "analytics",
        externalId: "google_analytics:analytics:analytics_activation",
      }),
    ]));
    expect(records).toEqual(expect.not.arrayContaining([
      expect.objectContaining({
        objectType: "analytic",
      }),
    ]));
  });

  it("uses Coda status names for stable cards-by-status external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.CODA,
      snapshotKey: "coda",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        cardsByStatus: [
          {
            status: "Qualified",
            count: 12,
            updatedAt: "2026-05-29T10:00:00.000Z",
          },
          {
            status: "Qualified",
            count: 18,
            updatedAt: "2026-05-31T10:00:00.000Z",
          },
        ],
      },
    });

    const statuses = records.filter(
      (record) => record.externalId === "coda:cards_by_status:Qualified",
    );
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toMatchObject({
      objectType: "cards_by_status",
      sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
      payload: expect.objectContaining({
        count: 18,
      }),
    });
  });

  it("uses snake_case wrapped Coda status names for stable cards-by-status external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.CODA,
      snapshotKey: "coda",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        cardsByStatus: [
          {
            values: {
              status_name: "Qualified",
              count: 12,
              updatedAt: "2026-05-29T10:00:00.000Z",
            },
          },
          {
            values: {
              status_name: "Qualified",
              count: 18,
              updatedAt: "2026-05-31T10:00:00.000Z",
            },
          },
        ],
      },
    });

    const statuses = records.filter(
      (record) => record.externalId === "coda:cards_by_status:Qualified",
    );
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toMatchObject({
      objectType: "cards_by_status",
      sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
      payload: expect.objectContaining({
        values: expect.objectContaining({
          count: 18,
        }),
      }),
    });
  });

  it("uses Coda recent submitter emails for stable external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.CODA,
      snapshotKey: "coda",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        recentSubmitters: [
          {
            creator: "Ada",
            email: "ada@example.com",
            cardsCreated: 2,
            updatedAt: "2026-05-29T10:00:00.000Z",
          },
          {
            creator: "Ada Lovelace",
            email: "ada@example.com",
            cardsCreated: 4,
            updatedAt: "2026-05-31T10:00:00.000Z",
          },
        ],
      },
    });

    const submitters = records.filter(
      (record) => record.externalId === "coda:recent_submitter:ada@example.com",
    );
    expect(submitters).toHaveLength(1);
    expect(submitters[0]).toMatchObject({
      objectType: "recent_submitter",
      sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
      payload: expect.objectContaining({
        creator: "Ada Lovelace",
        cardsCreated: 4,
      }),
    });
  });

  it("uses Coda creator window days for stable external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.CODA,
      snapshotKey: "coda",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        creatorWindows: [
          {
            windowDays: 30,
            totalCards: 12,
            uniqueCreators: 3,
            updatedAt: "2026-05-29T10:00:00.000Z",
          },
          {
            windowDays: 30,
            totalCards: 18,
            uniqueCreators: 4,
            updatedAt: "2026-05-31T10:00:00.000Z",
          },
        ],
      },
    });

    const windows = records.filter(
      (record) => record.externalId === "coda:creator_window:30d",
    );
    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({
      objectType: "creator_window",
      sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
      payload: expect.objectContaining({
        totalCards: 18,
        uniqueCreators: 4,
      }),
    });
  });

  it("uses Coda creator breakdown emails and activity timestamps for stable nested external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.CODA,
      snapshotKey: "coda",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        creatorWindows: [
          {
            windowDays: 30,
            totalCards: 18,
            uniqueCreators: 1,
            byCreator: [
              {
                creator: "Ada",
                email: "ada@example.com",
                cardCount: 3,
                activeDays: 2,
                firstCardAt: "2026-05-10T10:00:00.000Z",
                lastCardAt: "2026-05-29T10:00:00.000Z",
              },
              {
                creator: "Ada Lovelace",
                email: "ada@example.com",
                cardCount: 5,
                activeDays: 4,
                firstCardAt: "2026-05-10T10:00:00.000Z",
                lastCardAt: "2026-05-31T10:00:00.000Z",
              },
            ],
          },
        ],
      },
    });

    const creators = records.filter(
      (record) => record.externalId === "coda:by_creator:coda:creator_window:30d:ada@example.com",
    );
    expect(creators).toHaveLength(1);
    expect(creators[0]).toMatchObject({
      objectType: "by_creator",
      sourceCreatedAt: "2026-05-10T10:00:00.000Z",
      sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
      payload: expect.objectContaining({
        creator: "Ada Lovelace",
        cardCount: 5,
        sourceParentExternalId: "coda:creator_window:30d",
      }),
    });
  });

  it("uses Coda engaged lead candidate emails for stable external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.CODA,
      snapshotKey: "coda",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        engagedLeadCandidates: [
          {
            creator: "Ada",
            email: "ada@example.com",
            cards30d: 3,
            activeDays30d: 2,
            engagementScore: 71,
            updatedAt: "2026-05-29T10:00:00.000Z",
          },
          {
            creator: "Ada Lovelace",
            email: "ada@example.com",
            cards30d: 5,
            activeDays30d: 4,
            engagementScore: 88,
            updatedAt: "2026-05-31T10:00:00.000Z",
          },
        ],
      },
    });

    const candidates = records.filter(
      (record) => record.externalId === "coda:engaged_lead_candidate:ada@example.com",
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      objectType: "engaged_lead_candidate",
      sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
      payload: expect.objectContaining({
        creator: "Ada Lovelace",
        cards30d: 5,
        engagementScore: 88,
      }),
    });
  });

  it("unwraps scalar Coda engaged lead emails for stable external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.CODA,
      snapshotKey: "coda",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        engagedLeadCandidates: [
          {
            creator: "Ada",
            email: { value: " Ada@Example.com " },
            cards30d: 3,
            activeDays30d: 2,
            engagementScore: 71,
            updatedAt: "2026-05-29T10:00:00.000Z",
          },
          {
            creator: "Ada Lovelace",
            email: { data: { attributes: { value: " ada@example.com " } } },
            cards30d: 5,
            activeDays30d: 4,
            engagementScore: 88,
            updatedAt: "2026-05-31T10:00:00.000Z",
          },
        ],
      },
    });

    const candidates = records.filter(
      (record) => record.externalId === "coda:engaged_lead_candidate:ada@example.com",
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      objectType: "engaged_lead_candidate",
      sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
      payload: expect.objectContaining({
        creator: "Ada Lovelace",
        cards30d: 5,
        engagementScore: 88,
      }),
    });
  });

  it("uses Coda new creator feed emails for stable external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.CODA,
      snapshotKey: "coda",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        newCreatorFeed: [
          {
            creator: "Ada",
            email: "ada@example.com",
            cardsCreated: 2,
            updatedAt: "2026-05-29T10:00:00.000Z",
          },
          {
            creator: "Ada Lovelace",
            email: "ada@example.com",
            cardsCreated: 5,
            updatedAt: "2026-05-31T10:00:00.000Z",
          },
        ],
      },
    });

    const creators = records.filter(
      (record) => record.externalId === "coda:new_creator_feed:ada@example.com",
    );
    expect(creators).toHaveLength(1);
    expect(creators[0]).toMatchObject({
      objectType: "new_creator_feed",
      sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
      payload: expect.objectContaining({
        creator: "Ada Lovelace",
        cardsCreated: 5,
      }),
    });
  });

  it("reads values-wrapped Coda fields for stable external IDs and freshness", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.CODA,
      snapshotKey: "coda",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        newCreatorFeed: [
          {
            rowId: "row_1",
            values: {
              creator: "Ada",
              email: "ada@example.com",
              cardsCreated: 2,
              updatedAt: "2026-05-29T10:00:00.000Z",
            },
          },
          {
            rowId: "row_2",
            values: {
              creator: "Ada Lovelace",
              email: "ada@example.com",
              cardsCreated: 5,
              updatedAt: "2026-05-31T10:00:00.000Z",
            },
          },
        ],
      },
    });

    const creators = records.filter(
      (record) => record.externalId === "coda:new_creator_feed:ada@example.com",
    );
    expect(creators).toHaveLength(1);
    expect(creators[0]).toMatchObject({
      objectType: "new_creator_feed",
      sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
      payload: expect.objectContaining({
        values: {
          creator: "Ada Lovelace",
          email: "ada@example.com",
          cardsCreated: 5,
          updatedAt: "2026-05-31T10:00:00.000Z",
        },
      }),
    });
  });

  it("uses Coda funnel stage keys for stable nested external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.CODA,
      snapshotKey: "coda",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        funnel: {
          stages: [
            {
              key: "submissions",
              label: "Submissions",
              count: 12,
              updatedAt: "2026-05-29T10:00:00.000Z",
            },
            {
              key: "submissions",
              label: "Submissions",
              count: 18,
              updatedAt: "2026-05-31T10:00:00.000Z",
            },
          ],
        },
      },
    });

    const stages = records.filter(
      (record) =>
        record.externalId ===
        "coda:stage:coda:funnel_summary:2026-05-01:2026-06-01:submissions",
    );
    expect(stages).toHaveLength(1);
    expect(stages[0]).toMatchObject({
      objectType: "stage",
      sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
      payload: expect.objectContaining({
        count: 18,
        sourceParentExternalId: "coda:funnel_summary:2026-05-01:2026-06-01",
      }),
    });
  });

  it("uses wrapped Coda funnel stage keys for stable nested external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.CODA,
      snapshotKey: "coda",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        funnel: {
          stages: [
            {
              values: {
                key: "submissions",
                label: "Submissions",
                count: 12,
                updatedAt: "2026-05-29T10:00:00.000Z",
              },
            },
            {
              values: {
                key: "submissions",
                label: "Submissions",
                count: 18,
                updatedAt: "2026-05-31T10:00:00.000Z",
              },
            },
          ],
        },
      },
    });

    const stages = records.filter(
      (record) =>
        record.externalId ===
        "coda:stage:coda:funnel_summary:2026-05-01:2026-06-01:submissions",
    );
    expect(stages).toHaveLength(1);
    expect(stages[0]).toMatchObject({
      objectType: "stage",
      sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
      payload: expect.objectContaining({
        values: expect.objectContaining({
          count: 18,
        }),
        sourceParentExternalId: "coda:funnel_summary:2026-05-01:2026-06-01",
      }),
    });
  });

  it("uses Coda funnel conversion endpoints for stable nested external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.CODA,
      snapshotKey: "coda",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        funnel: {
          conversions: [
            {
              from: "submissions",
              to: "cardsCreated",
              ratePct: 50,
              updatedAt: "2026-05-29T10:00:00.000Z",
            },
            {
              from: "submissions",
              to: "cardsCreated",
              ratePct: 75,
              updatedAt: "2026-05-31T10:00:00.000Z",
            },
          ],
        },
      },
    });

    const conversions = records.filter(
      (record) =>
        record.externalId ===
        "coda:conversion:coda:funnel_summary:2026-05-01:2026-06-01:submissions:cardsCreated",
    );
    expect(conversions).toHaveLength(1);
    expect(conversions[0]).toMatchObject({
      objectType: "conversion",
      sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
      payload: expect.objectContaining({
        ratePct: 75,
        sourceParentExternalId: "coda:funnel_summary:2026-05-01:2026-06-01",
      }),
    });
  });

  it("uses Coda funnel drop-off statuses for stable nested external IDs", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.CODA,
      snapshotKey: "coda",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        funnel: {
          topDropOffStatuses: [
            {
              status: "Needs Review",
              count: 2,
              sharePct: 25,
              updatedAt: "2026-05-29T10:00:00.000Z",
            },
            {
              status: "Needs Review",
              count: 4,
              sharePct: 50,
              updatedAt: "2026-05-31T10:00:00.000Z",
            },
          ],
        },
      },
    });

    const dropOffStatuses = records.filter(
      (record) =>
        record.externalId ===
        "coda:top_drop_off_status:coda:funnel_summary:2026-05-01:2026-06-01:Needs Review",
    );
    expect(dropOffStatuses).toHaveLength(1);
    expect(dropOffStatuses[0]).toMatchObject({
      objectType: "top_drop_off_status",
      sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
      payload: expect.objectContaining({
        count: 4,
        sharePct: 50,
        sourceParentExternalId: "coda:funnel_summary:2026-05-01:2026-06-01",
      }),
    });
  });

  it("uses safe fallback IDs for cyclic connector payload objects", () => {
    const cyclicAccount: Record<string, unknown> = {
      name: "Cyclic Account",
      createdAt: "2026-05-12T08:00:00.000Z",
    };
    cyclicAccount.self = cyclicAccount;

    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        companies: [cyclicAccount],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "company",
        externalId: expect.stringMatching(/^hubspot:company:2026-05-01:2026-06-01:0:[a-f0-9]{16}$/),
        occurredAt: "2026-05-12T08:00:00.000Z",
      }),
    ]));
    expect(records.filter((record) => record.objectType === "self_summary")).toHaveLength(0);

    const company = records.find((record) => record.objectType === "company");
    expect(() => JSON.stringify(company?.payload)).not.toThrow();
  });

  it("ignores non-persisted SDK helper fields when hashing fallback external IDs", () => {
    const baseInput = {
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
    };
    const withoutSdkHelper = buildImladrisRawRecordsFromPayload({
      ...baseInput,
      payload: {
        companies: [
          {
            name: "Acme",
            createdAt: "2026-05-12T08:00:00.000Z",
          },
        ],
      },
    });
    const withSdkHelper = buildImladrisRawRecordsFromPayload({
      ...baseInput,
      payload: {
        companies: [
          {
            name: "Acme",
            createdAt: "2026-05-12T08:00:00.000Z",
            sdkHelper: () => "not persisted",
          },
        ],
      },
    });

    const plainCompany = withoutSdkHelper.find((record) => record.objectType === "company");
    const sdkCompany = withSdkHelper.find((record) => record.objectType === "company");

    expect(sdkCompany?.payload).toEqual(plainCompany?.payload);
    expect(sdkCompany?.externalId).toBe(plainCompany?.externalId);
  });

  it("preserves Map-backed provider metadata before fallback identity hashing", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        companies: [
          {
            name: "Acme",
            metadata: new Map<string, unknown>([
              ["plan", "enterprise"],
              ["seats", 12],
            ]),
          },
          {
            name: "Acme",
            metadata: new Map<string, unknown>([
              ["plan", "startup"],
              ["seats", 4],
            ]),
          },
        ],
      },
    });

    const companies = records.filter((record) => record.objectType === "company");

    expect(companies).toHaveLength(2);
    expect(new Set(companies.map((record) => record.externalId)).size).toBe(2);
    expect(new Set(companies.map((record) => String(record.externalId).split(":").at(-1))).size).toBe(2);
    expect(companies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        payload: expect.objectContaining({
          metadata: {
            plan: "enterprise",
            seats: 12,
          },
        }),
      }),
      expect.objectContaining({
        payload: expect.objectContaining({
          metadata: {
            plan: "startup",
            seats: 4,
          },
        }),
      }),
    ]));
  });

  it("preserves object-keyed Map metadata before fallback identity hashing", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        companies: [
          {
            name: "Acme",
            metadata: new Map<unknown, unknown>([
              [{ dimension: "seats" }, 12],
              [{ dimension: "api_calls" }, 42_000],
            ]),
          },
          {
            name: "Acme",
            metadata: new Map<unknown, unknown>([
              [{ dimension: "seats" }, 12],
              [{ dimension: "api_calls" }, 24_000],
            ]),
          },
        ],
      },
    });

    const companies = records.filter((record) => record.objectType === "company");
    const metadataKeys = [
      'object:{"dimension":"api_calls"}',
      'object:{"dimension":"seats"}',
    ];

    expect(companies).toHaveLength(2);
    expect(new Set(companies.map((record) => record.externalId)).size).toBe(2);
    expect(companies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        payload: expect.objectContaining({
          metadata: {
            [metadataKeys[0]]: 42_000,
            [metadataKeys[1]]: 12,
          },
        }),
      }),
      expect.objectContaining({
        payload: expect.objectContaining({
          metadata: {
            [metadataKeys[0]]: 24_000,
            [metadataKeys[1]]: 12,
          },
        }),
      }),
    ]));
  });

  it("preserves primitive Map entries that would collide after string coercion", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        companies: [
          {
            name: "Acme",
            usageByTier: new Map<unknown, unknown>([
              ["1", "string-tier"],
              [1, "numeric-tier"],
              [true, "boolean-tier"],
              ["true", "string-boolean-tier"],
            ]),
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "company",
        payload: expect.objectContaining({
          usageByTier: {
            "1": "string-tier",
            "number:1": "numeric-tier",
            true: "string-boolean-tier",
            "boolean:true": "boolean-tier",
          },
        }),
      }),
    ]));
  });

  it("disambiguates string Map keys that look like generated typed keys", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        companies: [
          {
            name: "Acme",
            usageByTier: new Map<unknown, unknown>([
              ["number:1", "string-key-that-looks-typed"],
              [1, "numeric-tier"],
              ["boolean:true", "string-boolean-that-looks-typed"],
              [true, "boolean-tier"],
            ]),
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "company",
        payload: expect.objectContaining({
          usageByTier: {
            "string:number:1": "string-key-that-looks-typed",
            "number:1": "numeric-tier",
            "string:boolean:true": "string-boolean-that-looks-typed",
            "boolean:true": "boolean-tier",
          },
        }),
      }),
    ]));
  });

  it("does not let dropped Map entries force surviving string keys into typed labels", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.HUBSPOT,
      snapshotKey: "hubspot",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        companies: [
          {
            name: "Acme",
            usageByTier: new Map<unknown, unknown>([
              ["number:1", "string-key-that-should-survive"],
              [1, undefined],
            ]),
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "company",
        payload: expect.objectContaining({
          usageByTier: {
            "number:1": "string-key-that-should-survive",
          },
        }),
      }),
    ]));
  });

  it("preserves Set-backed provider tags before fallback identity hashing", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.PYLON,
      snapshotKey: "pylon",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        conversations: [
          {
            subject: "Acme support",
            tags: new Set(["billing", "urgent"]),
          },
          {
            subject: "Acme support",
            tags: new Set(["product", "trial"]),
          },
        ],
      },
    });

    const conversations = records.filter((record) => record.objectType === "conversation");

    expect(conversations).toHaveLength(2);
    expect(new Set(conversations.map((record) => String(record.externalId).split(":").at(-1))).size).toBe(2);
    expect(conversations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        payload: expect.objectContaining({
          tags: ["billing", "urgent"],
        }),
      }),
      expect.objectContaining({
        payload: expect.objectContaining({
          tags: ["product", "trial"],
        }),
      }),
    ]));
  });

  it("uses deterministic fallback identity hashes for equivalent Set-backed provider values", () => {
    const firstRecords = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.PYLON,
      snapshotKey: "pylon",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        conversations: [
          {
            subject: "Acme support",
            tags: new Set(["billing", "urgent"]),
          },
        ],
      },
    });
    const secondRecords = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.PYLON,
      snapshotKey: "pylon",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        conversations: [
          {
            subject: "Acme support",
            tags: new Set(["urgent", "billing"]),
          },
        ],
      },
    });

    const firstConversation = firstRecords.find((record) => record.objectType === "conversation");
    const secondConversation = secondRecords.find((record) => record.objectType === "conversation");

    expect(firstConversation?.externalId).toBe(secondConversation?.externalId);
    expect(firstConversation?.payload).toMatchObject({
      tags: ["billing", "urgent"],
    });
    expect(secondConversation?.payload).toMatchObject({
      tags: ["billing", "urgent"],
    });
  });
});
