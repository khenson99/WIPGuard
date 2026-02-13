import { beforeEach, describe, expect, it } from "vitest";
import { createInviteToken, verifyInviteToken } from "@/lib/invite-token";

describe("invite-token", () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = "test-secret";
    delete process.env.INVITE_TOKEN_SECRET;
  });

  it("creates and verifies a signed token", () => {
    const { token } = createInviteToken({
      email: "new.user@example.com",
      inviterId: "user_123",
      ttlSeconds: 3600,
    });

    const verification = verifyInviteToken(token);

    expect(verification.valid).toBe(true);
    expect(verification.claims?.email).toBe("new.user@example.com");
    expect(verification.claims?.inviterId).toBe("user_123");
    expect(typeof verification.claims?.expiresAt).toBe("string");
  });

  it("rejects expired tokens", () => {
    const { token } = createInviteToken({
      email: "new.user@example.com",
      inviterId: "user_123",
      ttlSeconds: 0,
    });

    const verification = verifyInviteToken(token);

    expect(verification.valid).toBe(false);
    expect(verification.error).toContain("expired");
  });

  it("rejects tampered token signatures", () => {
    const { token } = createInviteToken({
      email: "new.user@example.com",
      inviterId: "user_123",
      ttlSeconds: 3600,
    });
    const [payload] = token.split(".");
    const tampered = `${payload}.tampered`;

    const verification = verifyInviteToken(tampered);

    expect(verification.valid).toBe(false);
    expect(verification.error).toContain("signature");
  });
});
