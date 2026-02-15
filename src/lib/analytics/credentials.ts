// ─── Analytics Credentials Helper ─────────────────────────
// Retrieves API tokens from environment variables or HubSpot integration connection

import { prisma } from "@/lib/prisma";

export interface AnalyticsCredentials {
  hubspotToken: string | null;
  stripeKey: string | null;
  mercuryKey: string | null;
}

/**
 * Get analytics credentials for the current user.
 * Priority: Integration connection (OAuth) > Environment variables
 */
export async function getCredentials(userId?: string): Promise<AnalyticsCredentials> {
  const envHubspot = process.env.HUBSPOT_ACCESS_TOKEN?.trim() || null;
  const stripeKey: string | null = process.env.STRIPE_SECRET_KEY?.trim() || null;
  const mercuryKey: string | null = process.env.MERCURY_API_TOKEN?.trim() || null;

  // Prefer env var when set; only fall back to DB integration connection
  let hubspotToken: string | null = envHubspot;

  if (!hubspotToken && userId) {
    try {
      const conn = await prisma.integrationConnection.findUnique({
        where: { userId_provider: { userId, provider: "HUBSPOT" } },
      });
      if (conn?.accessToken && conn.status === "CONNECTED") {
        hubspotToken = conn.accessToken;
      }
    } catch {
      // No DB connection available
    }
  }

  return { hubspotToken, stripeKey, mercuryKey };
}
