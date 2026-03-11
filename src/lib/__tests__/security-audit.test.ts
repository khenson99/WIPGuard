import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    securityAuditEvent: {
      create: mockCreate,
    },
  },
}));

import { recordSecurityAuditEvent } from "@/lib/security-audit";

describe("security-audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({ id: "audit-1" });
  });

  it("records request metadata on the security audit event", async () => {
    const request = new Request("https://example.com/api/test", {
      headers: {
        "x-forwarded-for": "203.0.113.7, 10.0.0.5",
        "user-agent": "Vitest",
      },
    });

    await recordSecurityAuditEvent({
      action: "board.settings.update",
      category: "board",
      outcome: "ALLOWED",
      actorId: "user-1",
      actorRole: "admin",
      targetType: "board",
      targetId: "board-1",
      details: { changedColumns: 2 },
      request,
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "board.settings.update",
        category: "board",
        outcome: "ALLOWED",
        actorId: "user-1",
        actorRole: "admin",
        targetType: "board",
        targetId: "board-1",
        ipAddress: "203.0.113.7",
        userAgent: "Vitest",
      }),
    });
  });

  it("swallows Prisma failures so audit logging stays fail-safe", async () => {
    mockCreate.mockRejectedValueOnce(new Error("db unavailable"));

    await expect(
      recordSecurityAuditEvent({
        action: "test.action",
        category: "test",
        outcome: "ERROR",
      }),
    ).resolves.toBeUndefined();
  });
});
