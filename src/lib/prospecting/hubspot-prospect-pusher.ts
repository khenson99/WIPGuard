import {
  Prisma,
  IntegrationProvider,
  IntegrationConnectionStatus,
  type ManufacturerProspect,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type TransactionClient = Prisma.TransactionClient;
import {
  protectIntegrationSecret,
  unprotectIntegrationSecret,
} from "@/lib/integrations/token-crypto";
import type { PushResult } from "./types";

const HUBSPOT_TOKEN_ENDPOINT = "https://api.hubapi.com/oauth/v1/token";

// ── Token refresh mutex (prevents concurrent refresh race condition) ──────────

let refreshPromise: Promise<string> | null = null;

// ── Token management (mirrors hubspot-customer-signals.ts pattern) ───────────

async function getValidAccessToken(
  userId: string
): Promise<string> {
  // Single-flight: if a refresh is already in progress, reuse it
  if (refreshPromise) return refreshPromise;
  const connection = await prisma.integrationConnection.findUnique({
    where: { userId_provider: { userId, provider: IntegrationProvider.HUBSPOT } },
  });

  if (!connection || connection.status !== IntegrationConnectionStatus.CONNECTED) {
    throw new Error("HubSpot is not connected");
  }

  const token = unprotectIntegrationSecret(connection.accessToken);
  if (!token) throw new Error("HubSpot access token is missing");

  const expiresSoon =
    Boolean(connection.expiresAt) && connection.expiresAt!.getTime() <= Date.now() + 60_000;

  if (!expiresSoon) return token;

  // Refresh the token — use mutex so concurrent callers share this promise
  refreshPromise = (async () => {
    try {
      const refreshToken = unprotectIntegrationSecret(connection.refreshToken);
      if (!refreshToken) throw new Error("HubSpot refresh token is missing");
      if (!process.env.HUBSPOT_CLIENT_ID || !process.env.HUBSPOT_CLIENT_SECRET) {
        throw new Error("HubSpot OAuth client credentials are missing");
      }

      const response = await fetch(HUBSPOT_TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: process.env.HUBSPOT_CLIENT_ID,
          client_secret: process.env.HUBSPOT_CLIENT_SECRET,
          refresh_token: refreshToken,
        }),
        cache: "no-store",
      });

      if (!response.ok) throw new Error("HubSpot token refresh failed");

      const json = (await response.json()) as Record<string, unknown>;
      const newToken = json.access_token as string;
      const expiresIn = (json.expires_in as number) ?? 21600;
      const newRefreshToken = (json.refresh_token as string) ?? null;

      await prisma.integrationConnection.update({
        where: { userId_provider: { userId, provider: IntegrationProvider.HUBSPOT } },
        data: {
          accessToken: protectIntegrationSecret(newToken),
          refreshToken: newRefreshToken
            ? protectIntegrationSecret(newRefreshToken)
            : connection.refreshToken,
          expiresAt: new Date(Date.now() + expiresIn * 1000),
          status: IntegrationConnectionStatus.CONNECTED,
          lastError: null,
          lastSyncedAt: new Date(),
        },
      });

      return newToken;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ── HubSpot API helpers ──────────────────────────────────────────────────────

async function hubspotPost<T>(
  accessToken: string,
  path: string,
  body: unknown
): Promise<T> {
  const response = await fetch(`https://api.hubapi.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HubSpot API ${path} failed (${response.status}): ${text}`);
  }

  return (await response.json()) as T;
}

async function hubspotPut(
  accessToken: string,
  path: string
): Promise<void> {
  const response = await fetch(`https://api.hubapi.com${path}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`HubSpot PUT ${path} failed (${response.status})`);
  }
}

// ── Search for existing company by domain ────────────────────────────────────

async function findExistingCompany(
  accessToken: string,
  domain: string
): Promise<string | null> {
  try {
    const result = await hubspotPost<{
      results: Array<{ id: string }>;
    }>(accessToken, "/crm/v3/objects/companies/search", {
      filterGroups: [
        {
          filters: [
            { propertyName: "domain", operator: "EQ", value: domain },
          ],
        },
      ],
      properties: ["domain"],
      limit: 1,
    });

    return result.results?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

// ── Search for existing contact by email ─────────────────────────────────────

async function findExistingContact(
  accessToken: string,
  email: string
): Promise<string | null> {
  try {
    const result = await hubspotPost<{
      results: Array<{ id: string }>;
    }>(accessToken, "/crm/v3/objects/contacts/search", {
      filterGroups: [
        {
          filters: [
            { propertyName: "email", operator: "EQ", value: email },
          ],
        },
      ],
      properties: ["email"],
      limit: 1,
    });

    return result.results?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

// ── Create company ───────────────────────────────────────────────────────────

async function createCompany(
  accessToken: string,
  prospect: ManufacturerProspect
): Promise<string> {
  const rawEvidence = Array.isArray(prospect.kanbanEvidence)
    ? prospect.kanbanEvidence
    : [];
  const evidenceUrls = rawEvidence
    .filter((e): e is { url: string } => typeof e === "object" && e !== null && typeof (e as Record<string, unknown>).url === "string")
    .map((e) => e.url)
    .slice(0, 5)
    .join("; ");

  const result = await hubspotPost<{ id: string }>(
    accessToken,
    "/crm/v3/objects/companies",
    {
      properties: {
        name: prospect.companyName,
        domain: prospect.domain ?? undefined,
        industry: prospect.industry ?? undefined,
        city: prospect.location ?? undefined,
        numberofemployees: prospect.employeeCount ?? undefined,
        description: `Discovered via WIPGuard prospecting. Kanban confidence: ${Math.round(prospect.confidence * 100)}%`,
        // Custom properties (create these in HubSpot settings first)
        kanban_confidence_score: String(Math.round(prospect.confidence * 100)),
        kanban_evidence_urls: evidenceUrls,
      },
    }
  );

  return result.id;
}

// ── Create contact ───────────────────────────────────────────────────────────

async function createContact(
  accessToken: string,
  prospect: ManufacturerProspect
): Promise<string> {
  const nameParts = (prospect.contactName ?? "").split(" ");

  const result = await hubspotPost<{ id: string }>(
    accessToken,
    "/crm/v3/objects/contacts",
    {
      properties: {
        email: prospect.contactEmail,
        firstname: nameParts[0] || undefined,
        lastname: nameParts.slice(1).join(" ") || undefined,
        jobtitle: prospect.contactTitle ?? undefined,
        company: prospect.companyName,
      },
    }
  );

  return result.id;
}

// ── Associate contact with company ───────────────────────────────────────────

async function associateContactToCompany(
  accessToken: string,
  contactId: string,
  companyId: string
): Promise<void> {
  await hubspotPut(
    accessToken,
    `/crm/v3/objects/contacts/${contactId}/associations/companies/${companyId}/280`
  );
}

// ── Create IntegrationReceipt for dedup ──────────────────────────────────────

async function createReceipt(
  userId: string,
  prospect: ManufacturerProspect,
  hubspotCompanyId: string,
  tx: TransactionClient = prisma
): Promise<void> {
  // Find or use a default IntegrationRule for prospecting
  let rule = await tx.integrationRule.findFirst({
    where: { userId, provider: IntegrationProvider.HUBSPOT, key: "prospect_push" },
    select: { id: true },
  });

  if (!rule) {
    rule = await tx.integrationRule.create({
      data: {
        userId,
        provider: IntegrationProvider.HUBSPOT,
        key: "prospect_push",
        config: {},
        enabled: true,
      },
    });
  }

  const now = new Date();
  await tx.integrationReceipt.upsert({
    where: { dedupeKey: `hubspot-prospect:${prospect.domain ?? prospect.id}` },
    create: {
      ruleId: rule.id,
      externalObjectType: "company",
      externalObjectId: hubspotCompanyId,
      sourceUrl: prospect.sourceUrl,
      dedupeKey: `hubspot-prospect:${prospect.domain ?? prospect.id}`,
      lastObservedAt: now,
      metadata: { prospectId: prospect.id, confidence: prospect.confidence },
    },
    update: {
      lastObservedAt: now,
    },
  });
}

// ── Main push function ───────────────────────────────────────────────────────

export async function pushProspectsToHubSpot(
  userId: string,
  options?: { limit?: number }
): Promise<PushResult[]> {
  const accessToken = await getValidAccessToken(userId);
  const limit = options?.limit ?? 25;

  // Get DISCOVERED prospects that haven't been pushed yet
  const prospects = await prisma.manufacturerProspect.findMany({
    where: {
      userId,
      status: "DISCOVERED",
      hubspotCompanyId: null,
    },
    orderBy: { confidence: "desc" },
    take: limit,
  });

  const results: PushResult[] = [];

  for (const prospect of prospects) {
    try {
      // Layer 2: Check IntegrationReceipt
      const existingReceipt = await prisma.integrationReceipt.findUnique({
        where: { dedupeKey: `hubspot-prospect:${prospect.domain ?? prospect.id}` },
        select: { id: true },
      });

      if (existingReceipt) {
        results.push({
          prospectId: prospect.id,
          companyName: prospect.companyName,
          domain: prospect.domain,
          status: "PUSHED",
          hubspotCompanyId: null,
          hubspotContactId: null,
          error: "Already pushed (receipt exists)",
        });
        continue;
      }

      // Layer 3: Check HubSpot for existing company by domain
      let companyId: string | null = null;
      if (prospect.domain) {
        companyId = await findExistingCompany(accessToken, prospect.domain);
      }

      // Create company if not found
      if (!companyId) {
        companyId = await createCompany(accessToken, prospect);
      }

      // Handle contact
      let contactId: string | null = null;
      if (prospect.contactEmail) {
        contactId = await findExistingContact(accessToken, prospect.contactEmail);
        if (!contactId) {
          contactId = await createContact(accessToken, prospect);
        }
        if (contactId && companyId) {
          await associateContactToCompany(accessToken, contactId, companyId);
        }
      }

      // Update local record + create dedup receipt atomically
      await prisma.$transaction(async (tx) => {
        await tx.manufacturerProspect.update({
          where: { id: prospect.id },
          data: {
            status: "PUSHED",
            hubspotCompanyId: companyId,
            hubspotContactId: contactId,
            pushedToHubspotAt: new Date(),
          },
        });

        await createReceipt(userId, prospect, companyId!, tx);
      });

      results.push({
        prospectId: prospect.id,
        companyName: prospect.companyName,
        domain: prospect.domain,
        status: "PUSHED",
        hubspotCompanyId: companyId,
        hubspotContactId: contactId,
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "push failed";
      console.error(`[prospecting] Failed to push ${prospect.companyName}:`, error);

      const existingMeta =
        prospect.metadata != null && typeof prospect.metadata === "object" && !Array.isArray(prospect.metadata)
          ? (prospect.metadata as Record<string, unknown>)
          : {};
      await prisma.manufacturerProspect.update({
        where: { id: prospect.id },
        data: {
          status: "ERROR",
          metadata: { ...existingMeta, lastError: message } as Prisma.InputJsonValue,
        },
      });

      results.push({
        prospectId: prospect.id,
        companyName: prospect.companyName,
        domain: prospect.domain,
        status: "ERROR",
        hubspotCompanyId: null,
        hubspotContactId: null,
        error: message,
      });
    }
  }

  return results;
}
