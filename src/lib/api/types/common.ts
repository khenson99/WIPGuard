/**
 * Common API response types shared across all versions.
 * These types form the contract between frontend and backend.
 */

/** Standard paginated response wrapper */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/** Standard error response */
export interface ApiErrorResponse {
  error: string;
  message?: string;
  details?: Record<string, string[]>;
}

/** Standard success response for mutations */
export interface ApiSuccessResponse<T = void> {
  success: true;
  data?: T;
  message?: string;
}

/** Standard list response (non-paginated) */
export interface ApiListResponse<T> {
  data: T[];
  count: number;
}
