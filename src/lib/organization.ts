/**
 * Organization utilities for multi-tenant data isolation.
 *
 * This module provides helper functions for working with organizations.
 * It serves as the foundation for tenant-scoped queries (Phase 2).
 */

import { PrismaClient } from '@prisma/client';

export const DEFAULT_ORG_ID = 'org_default_000000000';

/**
 * Get or create the default organization.
 * Used during initial setup and backfill.
 */
export async function ensureDefaultOrganization(prisma: PrismaClient) {
  return prisma.organization.upsert({
    where: { id: DEFAULT_ORG_ID },
    update: {},
    create: {
      id: DEFAULT_ORG_ID,
      name: 'Default Organization',
      slug: 'default',
    },
  });
}

/**
 * Create a new organization.
 */
export async function createOrganization(
  prisma: PrismaClient,
  data: { name: string; slug: string }
) {
  return prisma.organization.create({
    data: {
      name: data.name,
      slug: data.slug,
    },
  });
}

/**
 * Get an organization by ID.
 */
export async function getOrganizationById(
  prisma: PrismaClient,
  id: string
) {
  return prisma.organization.findUnique({
    where: { id },
  });
}

/**
 * Get an organization by slug.
 */
export async function getOrganizationBySlug(
  prisma: PrismaClient,
  slug: string
) {
  return prisma.organization.findUnique({
    where: { slug },
  });
}

/**
 * Build a where clause that includes organizationId scoping.
 * This is a helper for Phase 2 middleware integration.
 *
 * @example
 * const where = withOrgScope({ status: 'active' }, 'org_abc123');
 * // => { status: 'active', organizationId: 'org_abc123' }
 */
export function withOrgScope<T extends Record<string, unknown>>(
  where: T,
  organizationId: string
): T & { organizationId: string } {
  return {
    ...where,
    organizationId,
  };
}

/**
 * Validate that a given organizationId exists.
 * Returns true if the organization exists, false otherwise.
 */
export async function organizationExists(
  prisma: PrismaClient,
  organizationId: string
): Promise<boolean> {
  const count = await prisma.organization.count({
    where: { id: organizationId },
  });
  return count > 0;
}
