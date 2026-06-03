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
});
