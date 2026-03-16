/**
 * API Versioning Strategy
 *
 * This module provides utilities for API version management.
 *
 * Versioning Policy:
 * - URL-based versioning: /api/v1/*, /api/v2/*, etc.
 * - /api/* routes as alias for latest stable version
 * - API-Version response header on all responses
 * - Deprecated versions supported for 6 months after successor release
 *
 * @see docs/API_VERSIONING.md for full documentation
 */

import { NextResponse } from "next/server";

export const API_VERSIONS = {
  V1: "v1",
} as const;

export type ApiVersion = (typeof API_VERSIONS)[keyof typeof API_VERSIONS];

/** The current default/latest API version */
export const CURRENT_API_VERSION: ApiVersion = API_VERSIONS.V1;

/** Minimum supported API version */
export const MIN_SUPPORTED_VERSION: ApiVersion = API_VERSIONS.V1;

/** Version deprecation dates (version -> sunset date) */
export const VERSION_SUNSET_DATES: Partial<Record<ApiVersion, string>> = {
  // No versions deprecated yet
};

/**
 * Extracts the API version from a request URL path.
 * Returns the version string if found, or the current default version.
 *
 * @example
 * extractVersionFromPath("/api/v1/deals") // "v1"
 * extractVersionFromPath("/api/analytics") // CURRENT_API_VERSION
 */
export function extractVersionFromPath(pathname: string): ApiVersion {
  const versionMatch = pathname.match(/\/api\/(v\d+)\//);
  if (versionMatch) {
    const version = versionMatch[1] as ApiVersion;
    if (Object.values(API_VERSIONS).includes(version)) {
      return version;
    }
  }
  return CURRENT_API_VERSION;
}

/**
 * Checks if an API version is still supported.
 */
export function isVersionSupported(version: string): boolean {
  return Object.values(API_VERSIONS).includes(version as ApiVersion);
}

/**
 * Checks if an API version is deprecated (has a sunset date set).
 */
export function isVersionDeprecated(version: ApiVersion): boolean {
  return version in VERSION_SUNSET_DATES;
}

/**
 * Adds standard API versioning headers to a NextResponse.
 *
 * Headers added:
 * - API-Version: The version of the API that handled the request
 * - Deprecation: (if applicable) RFC 8594 deprecation header
 * - Sunset: (if applicable) The date when this version will be removed
 */
export function addVersionHeaders(
  response: NextResponse,
  version: ApiVersion = CURRENT_API_VERSION
): NextResponse {
  response.headers.set("API-Version", version);

  if (isVersionDeprecated(version)) {
    response.headers.set("Deprecation", "true");
    const sunsetDate = VERSION_SUNSET_DATES[version];
    if (sunsetDate) {
      response.headers.set("Sunset", sunsetDate);
    }
  }

  return response;
}

/**
 * Creates a versioned JSON response with appropriate headers.
 * Use this as a drop-in replacement for NextResponse.json() in API routes.
 *
 * @example
 * export async function GET(request: Request) {
 *   const data = await fetchTasks();
 *   return versionedResponse(data, "v1");
 * }
 */
export function versionedResponse<T>(
  data: T,
  version: ApiVersion = CURRENT_API_VERSION,
  init?: ResponseInit
): NextResponse {
  const response = NextResponse.json(data, init);
  return addVersionHeaders(response, version);
}

/**
 * Creates a versioned error response.
 */
export function versionedErrorResponse(
  message: string,
  status: number = 500,
  version: ApiVersion = CURRENT_API_VERSION
): NextResponse {
  const response = NextResponse.json({ error: message }, { status });
  return addVersionHeaders(response, version);
}

/**
 * Maps an unversioned path to a versioned path.
 * Used for route aliasing.
 *
 * @example
 * resolveVersionedPath("/api/analytics") // "/api/v1/analytics"
 */
export function resolveVersionedPath(path: string): string {
  // Already versioned
  if (/\/api\/v\d+\//.test(path)) {
    return path;
  }
  // Add current version
  return path.replace(/\/api\//, `/api/${CURRENT_API_VERSION}/`);
}
