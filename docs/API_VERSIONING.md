# API Versioning Strategy

## Overview

WIPGuard uses **URL-based API versioning** to ensure backwards-compatible API evolution. All API endpoints are available at both versioned (`/api/v1/tasks`) and unversioned (`/api/tasks`) paths.

## Versioning Scheme

### URL Pattern

```
/api/v{major}/{resource}
```

Examples:
- `/api/v1/tasks` — Tasks endpoint, version 1
- `/api/v1/projects` — Projects endpoint, version 1
- `/api/v1/deals` — Deals endpoint, version 1

### Unversioned Alias

Unversioned paths (`/api/tasks`) always point to the **current default version**. This ensures existing integrations continue to work, but we recommend all new integrations use explicit versioned endpoints.

## Response Headers

All API responses include the following headers:

| Header | Description | Example |
|--------|-------------|----------|
| `API-Version` | The version that handled the request | `v1` |
| `Deprecation` | Present if the version is deprecated | `true` |
| `Sunset` | Date when deprecated version will be removed | `2025-06-01` |

## Version Lifecycle

### Active Versions

| Version | Status | Release Date | Sunset Date |
|---------|--------|-------------|-------------|
| v1 | **Active** | 2025-01-01 | — |

### Policy

1. **New versions** are created only for **breaking changes**
2. **Non-breaking changes** (new fields, new endpoints) are added to the current version
3. **Deprecated versions** are supported for **6 months** after the successor is released
4. **Sunset dates** are communicated via `Sunset` response header and this document

## What Constitutes a Breaking Change?

**Breaking (requires new version):**
- Removing a field from a response
- Renaming a field
- Changing a field's type
- Changing the meaning/behavior of an endpoint
- Removing an endpoint
- Changing authentication requirements

**Non-breaking (safe for current version):**
- Adding a new field to a response
- Adding a new endpoint
- Adding a new optional query parameter
- Adding a new optional request body field
- Fixing a bug (correcting wrong behavior)

## Creating a New Version

When a breaking change is needed:

### 1. Create new version route handlers

```typescript
// src/app/api/v2/tasks/route.ts
export async function GET(request: Request) {
  // New v2 implementation with breaking changes
}
```

### 2. Keep v1 routes unchanged

The existing v1 routes continue to work as-is. Do NOT modify them.

### 3. Update version constants

```typescript
// src/lib/api/versioning.ts
export const API_VERSIONS = {
  V1: "v1",
  V2: "v2",  // Add new version
} as const;

export const CURRENT_API_VERSION = API_VERSIONS.V2;  // Update default

export const VERSION_SUNSET_DATES = {
  v1: "2026-01-01",  // 6 months from v2 release
};
```

### 4. Create v2 response types

```typescript
// src/lib/api/types/v2/index.ts
export interface TaskResponse {
  // Updated shape with breaking changes
}
```

### 5. Update this document

Add the new version to the Active Versions table above.

## Webhook Integrations

### External Webhook Endpoints

Webhook endpoints called by external services (HubSpot, Slack, etc.) should **always use versioned URLs**:

```
✅ https://wipguard-app-production.up.railway.app/api/v1/integrations/hubspot/webhook
❌ https://wipguard-app-production.up.railway.app/api/integrations/hubspot/webhook
```

When registering webhooks with external providers, always use the versioned endpoint to ensure the contract doesn't change unexpectedly.

### Outgoing Webhooks

When WIPGuard sends webhooks to customer endpoints, include the `API-Version` header so recipients know which version of the payload format they're receiving.

## Response Types

All API response types are exported from `src/lib/api/types/`:

```typescript
// Import latest version types
import type { TaskResponse, ProjectResponse } from '@/lib/api/types';

// Import specific version types
import type { TaskResponse } from '@/lib/api/types/v1';
```

### Available Types (v1)

**Resources:**
- `TaskResponse`, `CreateTaskRequest`, `UpdateTaskRequest`
- `ProjectResponse`, `CreateProjectRequest`, `UpdateProjectRequest`
- `DealResponse`, `CreateDealRequest`, `UpdateDealRequest`
- `ContactResponse`
- `WebhookEventResponse`
- `IntegrationStatusResponse`

**Common:**
- `PaginatedResponse<T>` — Paginated list wrapper
- `ApiErrorResponse` — Standard error format
- `ApiSuccessResponse<T>` — Standard success format
- `ApiListResponse<T>` — Non-paginated list wrapper

## Version Discovery

### GET /api/v1

Returns version information:

```json
{
  "version": "v1",
  "current": "v1",
  "supported": ["v1"],
  "deprecated": {},
  "endpoints": [
    "/api/v1/tasks",
    "/api/v1/projects",
    "/api/v1/deals"
  ]
}
```

## FAQ

**Q: Should I use `/api/tasks` or `/api/v1/tasks`?**
A: For internal frontend code, either works. For external integrations and webhooks, always use the versioned path.

**Q: When will v1 be deprecated?**
A: Not until v2 is released. After v2 release, v1 will be supported for 6 more months.

**Q: What if I need a small breaking change for just one endpoint?**
A: Consider if you can make it non-breaking (add new field, keep old field). If truly breaking, you may version just that endpoint while keeping others at v1.
