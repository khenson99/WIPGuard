import { describe, expect, it } from "vitest";
import {
  discoverArdaOidcSubjectsByTenant,
  discoverArdaTenantIdsFromUserDetails,
  extractArdaTenantIdsFromResult,
  normalizeArdaTenantLookupKey,
} from "@/lib/retention/arda-tenant-resolution";

describe("arda tenant resolution helpers", () => {
  it("extracts tenant UUIDs from nested result payloads", () => {
    expect(
      extractArdaTenantIdsFromResult({
        metadata: {
          tenantId: "9189acf9-4f89-46cd-9760-0d4933d58c67",
        },
        payload: {
          eId: "1193d42d-ef80-4bc8-ab11-84e5c8046892",
        },
      })
    ).toEqual([
      "9189acf9-4f89-46cd-9760-0d4933d58c67",
      "1193d42d-ef80-4bc8-ab11-84e5c8046892",
    ]);
  });

  it("extracts tenant UUIDs from JSON-encoded result payloads", () => {
    expect(
      extractArdaTenantIdsFromResult(
        JSON.stringify({
          metadata: {
            tenantId: "6fa02301-2cd9-4cfa-a258-40474b828945",
          },
        })
      )
    ).toEqual(["6fa02301-2cd9-4cfa-a258-40474b828945"]);
  });

  it("discovers tenant UUIDs from non-generic email domains", () => {
    const discovered = discoverArdaTenantIdsFromUserDetails(
      [
        {
          configuredTenantId: "northstarchemical",
          companyName: "Northstar Chemical",
        },
        {
          configuredTenantId: "ArdaMerch",
          companyName: "Arda Dogfood",
        },
      ],
      [
        {
          email: "abrock@northstarchemical.com",
          tenantId: "6fa02301-2cd9-4cfa-a258-40474b828945",
        },
        {
          email: "customer-success+northstar@arda.cards",
          tenantId: "6fa02301-2cd9-4cfa-a258-40474b828945",
        },
      ]
    );

    expect(
      discovered.get(normalizeArdaTenantLookupKey("northstarchemical"))
    ).toEqual(["6fa02301-2cd9-4cfa-a258-40474b828945"]);
    expect(discovered.has(normalizeArdaTenantLookupKey("ArdaMerch"))).toBe(false);
  });

  it("requires a unique best match before assigning a UUID", () => {
    const discovered = discoverArdaTenantIdsFromUserDetails(
      [
        {
          configuredTenantId: "smartcona",
          companyName: "Smartcon Solutions A",
        },
        {
          configuredTenantId: "smartconb",
          companyName: "Smartcon Solutions B",
        },
      ],
      [
        {
          email: "ops@smartconsolutions.com",
          tenantId: "e24408eb-69b3-477d-9090-97e314113996",
        },
      ]
    );

    expect(discovered.size).toBe(0);
  });

  it("matches against customer ref names when company names differ", () => {
    const discovered = discoverArdaTenantIdsFromUserDetails(
      [
        {
          configuredTenantId: "P-20010",
          companyName: "Internal label",
          customerName: "SmartCon Solutions",
        },
      ],
      [
        {
          email: "ops@smartconsolutions.com",
          tenantId: "e24408eb-69b3-477d-9090-97e314113996",
        },
      ]
    );

    expect(discovered.get(normalizeArdaTenantLookupKey("P-20010"))).toEqual([
      "e24408eb-69b3-477d-9090-97e314113996",
    ]);
  });

  it("captures one oidc subject per tenant uuid", () => {
    const subjects = discoverArdaOidcSubjectsByTenant([
      {
        email: "user@smartconsolutions.com",
        tenantId: "e24408eb-69b3-477d-9090-97e314113996",
        oidcSubject: "14f8f4b8-f071-70f2-ae92-1fbf4bba71bd",
      },
      {
        email: "other@smartconsolutions.com",
        tenantId: "e24408eb-69b3-477d-9090-97e314113996",
        oidcSubject: "ignored-second-subject",
      },
    ]);

    expect(subjects.get("e24408eb-69b3-477d-9090-97e314113996")).toBe(
      "14f8f4b8-f071-70f2-ae92-1fbf4bba71bd"
    );
  });
});
