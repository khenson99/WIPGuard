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
});
