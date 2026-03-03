/**
 * API Response Types
 *
 * Import types from the specific version you need:
 *
 * @example
 * import type { TaskResponse } from '@/lib/api/types/v1';
 *
 * Or import from latest (re-exported here):
 * import type { TaskResponse } from '@/lib/api/types';
 */

// Re-export latest version types as default
export * from './v1';

// Also export common types
export * from './common';
