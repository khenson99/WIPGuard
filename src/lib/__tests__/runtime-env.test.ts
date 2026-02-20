import { afterEach, describe, expect, it } from "vitest";
import {
  formatRuntimeEnvMissingKeysMessage,
  getIntegrationRuntimeEnvStatus,
} from "@/lib/env/runtime-env";

const ENV_KEYS = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "INTEGRATION_TOKEN_SECRET",
] as const;

const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]])
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

function resetEnv(): void {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }
}

describe("runtime env validation", () => {
  afterEach(() => {
    resetEnv();
  });

  it("reports missing required and recommended keys", () => {
    delete process.env.DATABASE_URL;
    delete process.env.NEXTAUTH_SECRET;
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    delete process.env.INTEGRATION_TOKEN_SECRET;

    const status = getIntegrationRuntimeEnvStatus();
    expect(status.missingRequired).toEqual(["DATABASE_URL", "NEXTAUTH_SECRET"]);
    expect(status.missingRecommended).toEqual(["INTEGRATION_TOKEN_SECRET"]);
  });

  it("returns no missing keys when runtime env is complete", () => {
    process.env.DATABASE_URL = "postgres://example";
    process.env.NEXTAUTH_SECRET = "secret";
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    process.env.INTEGRATION_TOKEN_SECRET = "token-secret";

    const status = getIntegrationRuntimeEnvStatus();
    expect(status.missingRequired).toEqual([]);
    expect(status.missingRecommended).toEqual([]);
  });

  it("formats missing key message for UI", () => {
    expect(
      formatRuntimeEnvMissingKeysMessage(["DATABASE_URL", "NEXTAUTH_SECRET"])
    ).toBe("Missing runtime env keys: DATABASE_URL, NEXTAUTH_SECRET");
  });
});
