/**
 * API v1 Response Types
 *
 * These types define the contract for API v1 responses.
 * They should NOT be modified after release — create v2 types for breaking changes.
 *
 * @module api/types/v1
 */

export type { PaginatedResponse, ApiErrorResponse, ApiSuccessResponse, ApiListResponse } from "../common";

// ============================================================
// Deal Types
// ============================================================

export interface DealResponse {
  id: string;
  name: string;
  value: number | null;
  stage: string;
  contactId: string | null;
  ownerId: string | null;
  expectedCloseDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDealRequest {
  name: string;
  value?: number;
  stage?: string;
  contactId?: string;
  expectedCloseDate?: string;
}

export interface UpdateDealRequest {
  name?: string;
  value?: number;
  stage?: string;
  contactId?: string;
  expectedCloseDate?: string;
}

// ============================================================
// Contact Types
// ============================================================

export interface ContactResponse {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// Webhook Types
// ============================================================

export interface WebhookEventResponse {
  id: string;
  event: string;
  source: string;
  payload: Record<string, unknown>;
  processedAt: string | null;
  createdAt: string;
}

// ============================================================
// Integration Types
// ============================================================

export interface IntegrationStatusResponse {
  provider: string;
  connected: boolean;
  lastSyncAt: string | null;
  version: string;
}
