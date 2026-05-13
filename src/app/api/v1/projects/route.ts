/**
 * API v1: Retired Work Endpoint
 *
 * Versioned endpoint: /api/v1/projects
 * This re-exports the retired projects handler for backward compatibility.
 */
export const dynamic = "force-dynamic";
export { GET, POST } from "../../projects/route";
