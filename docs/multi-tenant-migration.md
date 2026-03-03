# Multi-Tenant Migration Guide

## Overview

This document describes the schema changes introduced for multi-tenant data isolation (Issue #376).

## What Changed

### New Model: Organization

```prisma
model Organization {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### New Field: organizationId

Added as an **optional** (`String?`) field to all tenant-scoped models:

- `User`
- `Project`
- `Task`
- `Sprint`
- `Deal`
- `Department`
- `CompanyPriority`
- `IntegrationConnection`
- `Conference`

Each field has:
- A foreign key relationship to `Organization`
- A database index (`@@index([organizationId])`) for query performance

### Why Optional?

The field is nullable (`String?`) to allow a non-breaking migration:
1. Add the column as nullable
2. Backfill existing data with a default organization
3. In a follow-up ticket, make the field required (`String`) once all data is backfilled

## Migration Steps

### 1. Run the Prisma migration

```bash
npx prisma migrate deploy
```

### 2. Backfill existing data

```bash
npx tsx scripts/backfill-organization.ts
```

This creates a default organization and assigns all existing records to it.

### 3. Verify

```sql
-- Check that all users have an organizationId
SELECT COUNT(*) FROM "User" WHERE "organizationId" IS NULL;
-- Should return 0

-- Check the default org exists
SELECT * FROM "Organization" WHERE slug = 'default';
```

## Follow-up Work

### Phase 2: Middleware & API Scoping (Ticket #379)

- Add `organizationId` to JWT/session tokens
- Create Prisma middleware that auto-injects org scope
- Update all API routes to filter by organization
- Make `organizationId` NOT NULL after full enforcement

### Phase 3: Organization Management

- Organization creation/settings UI
- Invite flow for adding users to an organization
- Organization switching for multi-org users

## Helper Utilities

The `src/lib/organization.ts` module provides:

- `DEFAULT_ORG_ID` - The ID of the default organization
- `withOrgScope(where, orgId)` - Adds org scoping to Prisma where clauses
- `ensureDefaultOrganization(prisma)` - Creates/gets the default org
- `createOrganization(prisma, data)` - Creates a new organization
- `organizationExists(prisma, orgId)` - Checks if an org exists
