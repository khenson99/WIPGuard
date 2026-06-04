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
