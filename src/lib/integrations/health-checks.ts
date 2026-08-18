import { IntegrationConnectionStatus, IntegrationProvider } from "@/generated/prisma/client";
import { verifyAirtableConnection } from "@/lib/integrations/airtable";
import { prisma } from "@/lib/prisma";
import { unprotectIntegrationSecret } from "@/lib/integrations/token-crypto";
import { verifyCodaApiToken, verifyPylonApiToken } from "@/lib/integrations/oauth";
import { getValidIntegrationAccessToken } from "@/lib/integrations/token-refresh";
import {
  getProviderRegistryEntry,
  type ProviderAuthType,
} from "@/lib/integrations/provider-registry";

type HealthCheckResult = {
  provider: IntegrationProvider;
  ok: boolean;
  message: string | null;
};

const HEALTH_CHECK_TIMEOUT_MS = 10_000;

async function checkSlack(accessToken: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

  try {
    const response = await fetch("https://slack.com/api/auth.test", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({}).toString(),
      cache: "no-store",
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!response.ok || !payload || payload.ok !== true) {
      const error = payload?.error ? `: ${payload.error}` : "";
      throw new Error(`Slack auth.test failed (${response.status})${error}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Lightweight health check for OAuth providers: verifies the token can be
 * refreshed (or is still valid) by triggering the shared token lifecycle.
 * This catches expired refresh tokens and revoked grants without needing
 * a provider-specific API endpoint.
 */
async function checkOAuthTokenHealth(userId: string, provider: IntegrationProvider): Promise<void> {
  await getValidIntegrationAccessToken({ userId, provider });
}

export async function runIntegrationHealthChecks(input: { userId: string }): Promise<{
  checked: number;
  ok: number;
  failed: number;
  results: HealthCheckResult[];
}> {
  // Check ALL connected integrations, not just a subset
  const connections = await prisma.integrationConnection.findMany({
    where: {
      userId: input.userId,
      status: { in: [IntegrationConnectionStatus.CONNECTED, IntegrationConnectionStatus.ERROR] },
    },
  });

  const results: HealthCheckResult[] = [];

  for (const connection of connections) {
    const token = unprotectIntegrationSecret(connection.accessToken);
    if (!token) {
      const message = "Missing access token";
      await prisma.integrationConnection.update({
        where: {
          userId_provider: { userId: input.userId, provider: connection.provider },
        },
        data: { status: IntegrationConnectionStatus.ERROR, lastError: message, lastSyncedAt: null },
      });
      results.push({ provider: connection.provider, ok: false, message });
      continue;
    }

    try {
      // Providers with dedicated health-check endpoints
      if (connection.provider === IntegrationProvider.SLACK) {
        await checkSlack(token);
      } else if (connection.provider === IntegrationProvider.CODA) {
        await verifyCodaApiToken(token);
      } else if (connection.provider === IntegrationProvider.AIRTABLE) {
        const metadata =
          connection.metadata && typeof connection.metadata === "object" && !Array.isArray(connection.metadata)
            ? (connection.metadata as Record<string, unknown>)
            : {};
        const baseId = typeof metadata.baseId === "string" ? metadata.baseId.trim() : "";
        const tableName =
          typeof metadata.tableName === "string" ? metadata.tableName.trim() : "";
        await verifyAirtableConnection({ token, baseId, tableName });
      } else if (connection.provider === IntegrationProvider.PYLON) {
        await verifyPylonApiToken(token);
      } else {
        // For all other OAuth providers, verify token lifecycle health
        const registryEntry = getProviderRegistryEntry(connection.provider);
        const authType: ProviderAuthType = registryEntry?.authType ?? "oauth";
        if (authType === "oauth") {
          await checkOAuthTokenHealth(input.userId, connection.provider);
        }
        // Token-based providers without a verify endpoint are assumed healthy
        // if their access token is present (already checked above).
      }

      await prisma.integrationConnection.update({
        where: {
          userId_provider: { userId: input.userId, provider: connection.provider },
        },
        data: {
          status: IntegrationConnectionStatus.CONNECTED,
          lastError: null,
          lastSyncedAt: new Date(),
        },
      });
      results.push({ provider: connection.provider, ok: true, message: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Health check failed";
      await prisma.integrationConnection.update({
        where: {
          userId_provider: { userId: input.userId, provider: connection.provider },
        },
        data: { status: IntegrationConnectionStatus.ERROR, lastError: message, lastSyncedAt: null },
      });
      results.push({ provider: connection.provider, ok: false, message });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  return { checked: results.length, ok, failed: results.length - ok, results };
}
