import { IntegrationConnectionStatus, IntegrationProvider } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { unprotectIntegrationSecret } from "@/lib/integrations/token-crypto";
import { verifyCodaApiToken, verifyPylonApiToken } from "@/lib/integrations/oauth";

type HealthCheckResult = {
  provider: IntegrationProvider;
  ok: boolean;
  message: string | null;
};

async function checkSlack(accessToken: string): Promise<void> {
  const response = await fetch("https://slack.com/api/auth.test", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({}).toString(),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!response.ok || !payload || payload.ok !== true) {
    const error = payload?.error ? `: ${payload.error}` : "";
    throw new Error(`Slack auth.test failed (${response.status})${error}`);
  }
}

export async function runIntegrationHealthChecks(input: { userId: string }): Promise<{
  checked: number;
  ok: number;
  failed: number;
  results: HealthCheckResult[];
}> {
  const connections = await prisma.integrationConnection.findMany({
    where: {
      userId: input.userId,
      status: IntegrationConnectionStatus.CONNECTED,
      provider: { in: [IntegrationProvider.SLACK, IntegrationProvider.CODA, IntegrationProvider.PYLON] },
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
      if (connection.provider === IntegrationProvider.SLACK) {
        await checkSlack(token);
      } else if (connection.provider === IntegrationProvider.CODA) {
        await verifyCodaApiToken(token);
      } else if (connection.provider === IntegrationProvider.PYLON) {
        await verifyPylonApiToken(token);
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

