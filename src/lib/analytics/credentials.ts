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
  let hubspotToken: string | null = process.env.HUBSPOT_ACCESS_TOKEN?.trim() || null;
  const stripeKey: string | null = process.env.STRIPE_SECRET_KEY?.trim() || null;
  const mercuryKey: string | null = process.env.MERCURY_API_TOKEN?.trim() || null;

  // Try to get HubSpot token from integration connection
  if (userId) {
    try {
      const conn = await prisma.integrationConnection.findUnique({
        where: { userId_provider: { userId, provider: "HUBSPOT" } },
      });
      if (conn?.accessToken && conn.status === "CONNECTED") {
        // Decrypt if encrypted, otherwise use directly
        hubspotToken = conn.accessToken;
      }
    } catch {
      // Fall back to env var
    }
  }

  return { hubspotToken, stripeKey, mercuryKey };
}
