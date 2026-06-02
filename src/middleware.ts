import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  CURRENT_API_VERSION,
  extractVersionFromPath,
  isVersionSupported,
  isVersionDeprecated,
  VERSION_SUNSET_DATES,
} from "@/lib/api/versioning";

const LEGACY_PRODUCT_API_PREFIXES = [
  "/api/board-settings",
  "/api/priorities",
  "/api/projects",
  "/api/sprints",
  "/api/standup",
  "/api/tasks",
  "/api/v1/projects",
  "/api/v1/tasks",
] as const;

const RETIRED_ROUTE_REDIRECTS = [
  { prefixes: ["/deals"], destination: "/sources" },
  {
    prefixes: [
      "/dashboard",
      "/tasks",
      "/board",
      "/my-tasks",
      "/projects",
      "/standup",
      "/today",
      "/whip",
      "/table",
      "/logbook",
    ],
    destination: "/metrics",
  },
] as const;

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

  const retiredRouteRedirect = maybeRedirectRetiredRoute(request, pathname);
  if (retiredRouteRedirect) return retiredRouteRedirect;

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

    const legacyProductApiResponse = maybeRejectLegacyProductApi(pathname);
    if (legacyProductApiResponse) return legacyProductApiResponse;

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

  const legacyProductApiResponse = maybeRejectLegacyProductApi(pathname);
  if (legacyProductApiResponse) return legacyProductApiResponse;

  // Unversioned API request — add version header indicating current version
  const response = NextResponse.next();
  response.headers.set("API-Version", CURRENT_API_VERSION);
  addSecurityHeaders(response);
  return response;
}

function maybeRedirectRetiredRoute(
  request: NextRequest,
  pathname: string
): NextResponse | null {
  for (const redirect of RETIRED_ROUTE_REDIRECTS) {
    const matched = redirect.prefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
    if (!matched) continue;

    const redirectUrl = new URL(request.url);
    redirectUrl.pathname = redirect.destination;
    redirectUrl.search = "";
    redirectUrl.hash = "";

    const response = NextResponse.redirect(redirectUrl, 307);
    addSecurityHeaders(response);
    return response;
  }

  return null;
}

function maybeRejectLegacyProductApi(pathname: string): NextResponse | null {
  if (legacyProductApisEnabled()) {
    return null;
  }

  const isLegacyProductApi = LEGACY_PRODUCT_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (!isLegacyProductApi) {
    return null;
  }

  const response = NextResponse.json(
    {
      error: "Legacy product API disabled",
      replacement: "/api/analytics",
      dashboard: "/analytics",
    },
    { status: 410 }
  );
  response.headers.set("API-Version", CURRENT_API_VERSION);
  addSecurityHeaders(response);
  return response;
}

function legacyProductApisEnabled(): boolean {
  const flag = process.env.ENABLE_LEGACY_PRODUCT_APIS?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes" || flag === "on") {
    return true;
  }
  if (flag === "0" || flag === "false" || flag === "no" || flag === "off") {
    return false;
  }

  return process.env.NODE_ENV !== "production";
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
