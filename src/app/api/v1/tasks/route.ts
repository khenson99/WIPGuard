/**
 * API v1: Tasks
 *
 * Versioned endpoint: /api/v1/tasks
 * This re-exports the main tasks route handlers for version pinning.
 *
 * When v2 is needed, create /api/v2/tasks/route.ts with new behavior
 * while keeping this v1 route stable.
 */

// Re-export from the main (unversioned) route
// This allows /api/v1/tasks and /api/tasks to serve the same handlers
export { GET, POST } from "../../tasks/route";
