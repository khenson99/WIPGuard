import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  CURRENT_API_VERSION,
  extractVersionFromPath,
  isVersionSupported,
  isVersionDeprecated,
  VERSION_SUNSET_DATES,
} from "@/lib/api/versioning";

/**
 * Next.js Middleware
 *
 * Handles:
 * 1. API version header injection on all /api/* responses
 * 2. Unversioned /api/* route rewriting to /api/v1/*
 * 3. Unsupported version rejection
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only process API routes
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Check if the path contains an explicit version
  const versionMatch = pathname.match(/^\/api\/(v\d+)\//);

  if (versionMatch) {
    const requestedVersion = versionMatch[1];

    // Reject unsupported versions
    if (!isVersionSupported(requestedVersion)) {
      return NextResponse.json(
        {
          error: `API version '${requestedVersion}' is not supported. Supported versions: v1`,
          currentVersion: CURRENT_API_VERSION,
        },
        {
          status: 400,
          headers: {
            "API-Version": CURRENT_API_VERSION,
          },
        }
      );
    }

    // Add version headers to versioned requests
    const response = NextResponse.next();
    const version = extractVersionFromPath(pathname);
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

  // Unversioned API request — add version header indicating current version
  // The actual route handling stays at /api/* for backwards compatibility
  // This means /api/tasks and /api/v1/tasks both work
  const response = NextResponse.next();
  response.headers.set("API-Version", CURRENT_API_VERSION);
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
