import { describe, expect, it } from "vitest";
import { normalizeCodaMasterOrderArchiveRow } from "@/lib/retention/coda-normalization";

describe("normalizeCodaMasterOrderArchiveRow", () => {
  it("maps live Master Order Archive column names into retention fields", () => {
    const row = normalizeCodaMasterOrderArchiveRow({
      id: "row_1",
      createdAt: "2026-01-05T00:00:00.000Z",
      updatedAt: "2026-01-06T00:00:00.000Z",
      values: {
        Company: "Neff Machine",
        "Order Date": "2026-01-04T00:00:00.000Z",
        Item: "A-100 Bracket",
        Status: "Ordered",
        Quantity: 4,
      },
    });

    expect(row).not.toBeNull();
    expect(row?.tenantKey).toBeNull();
    expect(row?.occurredAt).toBe("2026-01-04T00:00:00.000Z");
    expect(row?.payload.companyName).toBe("Neff Machine");
    expect(row?.payload.accountName).toBe("Neff Machine");
    expect(row?.payload.tenantName).toBe("Neff Machine");
    expect(row?.payload.itemName).toBe("A-100 Bracket");
    expect(row?.payload.orderStatus).toBe("Ordered");
    expect(row?.payload.quantity).toBe(4);
  });

  it("preserves explicit tenant and account ids when present", () => {
    const row = normalizeCodaMasterOrderArchiveRow({
      id: "row_2",
      values: {
        tenant_id: "tenant_123",
        account_id: "acct_456",
        tenant_name: "Arda Foods",
        order_date: "2026-02-01T00:00:00.000Z",
      },
    });

    expect(row).not.toBeNull();
    expect(row?.tenantKey).toBe("tenant_123");
    expect(row?.payload.tenantId).toBe("tenant_123");
    expect(row?.payload.accountId).toBe("acct_456");
    expect(row?.payload.companyName).toBe("Arda Foods");
    expect(row?.occurredAt).toBe("2026-02-01T00:00:00.000Z");
  });
});
