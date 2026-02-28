import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import type { RawProspect } from "./types";

/**
 * Calculate a confidence score (0..1) based on the quality of evidence.
 */
function calculateConfidence(prospect: RawProspect): number {
  let score = 0;

  // Base: evidence count
  const evidenceCount = prospect.kanbanEvidence.length;
  score += Math.min(evidenceCount * 0.15, 0.45);

  // Average evidence confidence
  if (evidenceCount > 0) {
    const avgEvidence =
      prospect.kanbanEvidence.reduce((sum, e) => sum + e.confidence, 0) / evidenceCount;
    score += avgEvidence * 0.2;
  }

  // Contact info available
  if (prospect.contactEmail) score += 0.15;
  if (prospect.contactName) score += 0.05;
  if (prospect.contactTitle) score += 0.05;

  // Domain available (we can look them up)
  if (prospect.domain) score += 0.05;

  // Multiple sources (higher quality evidence)
  const sources = new Set(prospect.kanbanEvidence.map((e) => new URL(e.url).hostname));
  if (sources.size > 1) score += 0.05;

  return Math.min(score, 1);
}

/**
 * Check if a prospect with this domain already exists in the local DB.
 */
async function isDuplicate(userId: string, domain: string | null): Promise<boolean> {
  if (!domain) return false;

  const existing = await prisma.manufacturerProspect.findUnique({
    where: { userId_domain: { userId, domain } },
    select: { id: true },
  });

  return existing !== null;
}

/**
 * Validate and deduplicate a batch of raw prospects.
 * Returns only valid, non-duplicate prospects with calculated confidence scores.
 */
export async function validateProspects(
  userId: string,
  prospects: RawProspect[]
): Promise<{ valid: RawProspect[]; duplicatesSkipped: number }> {
  const valid: RawProspect[] = [];
  let duplicatesSkipped = 0;
  const seenDomains = new Set<string>();

  for (const prospect of prospects) {
    // Basic validation
    if (!prospect.companyName || prospect.companyName.length < 2) continue;
    if (prospect.kanbanEvidence.length === 0) continue;

    // Deduplicate within the batch
    if (prospect.domain) {
      if (seenDomains.has(prospect.domain)) {
        duplicatesSkipped++;
        continue;
      }
      seenDomains.add(prospect.domain);
    }

    // Deduplicate against existing DB records
    try {
      if (await isDuplicate(userId, prospect.domain)) {
        duplicatesSkipped++;
        continue;
      }
    } catch (error) {
      console.warn(`[prospecting] DB lookup failed for ${prospect.domain}, skipping:`, error);
      continue;
    }

    // Calculate confidence and only keep prospects above threshold
    const confidence = calculateConfidence(prospect);
    if (confidence < 0.2) continue;

    valid.push({
      ...prospect,
      metadata: {
        ...prospect.metadata,
        calculatedConfidence: confidence,
      },
    });
  }

  return { valid, duplicatesSkipped };
}

/**
 * Store validated prospects in the database.
 */
export async function storeProspects(
  userId: string,
  prospects: RawProspect[]
): Promise<number> {
  let stored = 0;

  for (const prospect of prospects) {
    const meta =
      prospect.metadata != null && typeof prospect.metadata === "object" && !Array.isArray(prospect.metadata)
        ? (prospect.metadata as Record<string, unknown>)
        : undefined;
    const storedConfidence = typeof meta?.calculatedConfidence === "number" ? meta.calculatedConfidence : undefined;
    const confidence = storedConfidence ?? calculateConfidence(prospect);

    try {
      await prisma.manufacturerProspect.upsert({
        where: {
          userId_domain: {
            userId,
            domain: prospect.domain ?? `no-domain-${crypto.randomUUID()}`,
          },
        },
        create: {
          userId,
          companyName: prospect.companyName,
          domain: prospect.domain,
          industry: prospect.industry,
          location: prospect.location,
          employeeCount: prospect.employeeCount,
          kanbanEvidence: prospect.kanbanEvidence as unknown as Prisma.InputJsonValue,
          contactName: prospect.contactName,
          contactEmail: prospect.contactEmail,
          contactTitle: prospect.contactTitle,
          sourceType: prospect.sourceType,
          sourceUrl: prospect.sourceUrl,
          confidence,
          metadata: (prospect.metadata ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
        },
        update: {
          // If re-discovered, update evidence and confidence if better
          kanbanEvidence: prospect.kanbanEvidence as unknown as Prisma.InputJsonValue,
          confidence: { set: confidence },
          contactName: prospect.contactName,
          contactEmail: prospect.contactEmail,
          contactTitle: prospect.contactTitle,
        },
      });
      stored++;
    } catch (error) {
      // Only skip unique constraint violations (P2002); rethrow anything else
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        console.warn(`[prospecting] Duplicate prospect skipped: ${prospect.domain}`);
      } else {
        console.error(`[prospecting] Failed to store prospect ${prospect.domain}:`, error);
      }
    }
  }

  return stored;
}
