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
 * 1. Runtime security headers on all responses
 * 2. API version header injection on all /api/* responses
 * 3. Unversioned /api/* route rewriting to /api/v1/*
 * 4. Unsupported version rejection
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const canonicalRedirect = maybeRedirectToCanonicalHost(request, pathname);
  if (canonicalRedirect) return canonicalRedirect;

  // For non-API routes, just add security headers
  if (!pathname.startsWith("/api/")) {
    const response = NextResponse.next();
    addSecurityHeaders(response);
    return response;
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

    addSecurityHeaders(response);
    return response;
  }

  // Unversioned API request — add version header indicating current version
  const response = NextResponse.next();
  response.headers.set("API-Version", CURRENT_API_VERSION);
  addSecurityHeaders(response);
  return response;
}

function maybeRedirectToCanonicalHost(
  request: NextRequest,
  pathname: string
): NextResponse | null {
  const canonical = process.env.NEXTAUTH_URL;
  if (!canonical) return null;

  let canonicalUrl: URL;
  try {
    canonicalUrl = new URL(canonical);
  } catch {
    return null;
  }

  const requestHost = request.headers.get("host");
  if (!requestHost || requestHost === canonicalUrl.host) return null;

  const isAuthPath = pathname === "/login" || pathname.startsWith("/api/auth/");
  if (!isAuthPath) return null;

  const redirectUrl = new URL(request.url);
  redirectUrl.protocol = canonicalUrl.protocol;
  redirectUrl.host = canonicalUrl.host;

  return NextResponse.redirect(redirectUrl, 307);
}

function addSecurityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
