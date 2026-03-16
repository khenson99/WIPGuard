/**
 * API v1: Retired Work Endpoint
 *
 * Versioned endpoint: /api/v1/tasks
 * This re-exports the retired tasks handler for backward compatibility.
 */

export const dynamic = "force-dynamic";

// Re-export the retired compatibility handler from the main route.
export { GET, POST } from "../../tasks/route";
