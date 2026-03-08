import { afterEach, describe, expect, it, vi } from "vitest";
import {
  protectIntegrationSecret,
  unprotectIntegrationSecret,
} from "@/lib/integrations/token-crypto";

const originalIntegrationSecret = process.env.INTEGRATION_TOKEN_SECRET;
const originalNextAuthSecret = process.env.NEXTAUTH_SECRET;

function resetSecrets(): void {
  if (originalIntegrationSecret === undefined) {
    delete process.env.INTEGRATION_TOKEN_SECRET;
  } else {
    process.env.INTEGRATION_TOKEN_SECRET = originalIntegrationSecret;
  }

  if (originalNextAuthSecret === undefined) {
    delete process.env.NEXTAUTH_SECRET;
  } else {
    process.env.NEXTAUTH_SECRET = originalNextAuthSecret;
  }
}

describe("token crypto", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetSecrets();
  });

  it("refuses to store plaintext tokens when no secret is configured", () => {
    delete process.env.INTEGRATION_TOKEN_SECRET;
    delete process.env.NEXTAUTH_SECRET;

    expect(() => protectIntegrationSecret("secret-token")).toThrow(
      "INTEGRATION_TOKEN_SECRET or NEXTAUTH_SECRET must be set"
    );
  });

  it("still reads legacy plaintext tokens", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(unprotectIntegrationSecret("plainv1.legacy-token")).toBe("legacy-token");
    expect(warnSpy).toHaveBeenCalledWith(
      "token-crypto: Reading legacy plaintext token. Re-encrypt by updating the integration connection."
    );
  });

  it("requires a secret to decrypt encrypted tokens", () => {
    process.env.INTEGRATION_TOKEN_SECRET = "integration-secret";
    const encrypted = protectIntegrationSecret("secret-token");

    delete process.env.INTEGRATION_TOKEN_SECRET;
    delete process.env.NEXTAUTH_SECRET;

    expect(() => unprotectIntegrationSecret(encrypted)).toThrow(
      "INTEGRATION_TOKEN_SECRET or NEXTAUTH_SECRET must be set to decrypt tokens."
    );
  });
});
