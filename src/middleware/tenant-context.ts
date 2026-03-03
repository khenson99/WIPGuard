import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { requestContext, RequestContext, TenantContextError } from '@/lib/request-context';

/**
 * Header name for organization ID override.
 * Useful for API clients that need to specify the org.
 */
export const ORG_HEADER = 'x-organization-id';

/**
 * Routes that should bypass tenant context enforcement.
 * These are public routes or routes that handle their own auth.
 */
const BYPASS_ROUTES = [
  '/api/auth',
  '/api/health',
  '/api/webhooks/incoming',
  '/api/public',
];

/**
 * Check if a route should bypass tenant enforcement.
 */
function shouldBypass(pathname: string): boolean {
  return BYPASS_ROUTES.some((route) => pathname.startsWith(route));
}

/**
 * Extract organization ID from the request.
 * Priority:
 * 1. x-organization-id header (for API clients)
 * 2. Session organizationId (for browser users)
 * 3. Query parameter orgId (fallback for specific use cases)
 */
async function extractOrganizationId(
  req: NextRequest,
  session: any
): Promise<string | undefined> {
  // 1. Header override
  const headerOrgId = req.headers.get(ORG_HEADER);
  if (headerOrgId) {
    return headerOrgId;
  }

  // 2. Session
  if (session?.user?.organizationId) {
    return session.user.organizationId;
  }

  // 3. Query parameter fallback
  const url = new URL(req.url);
  const queryOrgId = url.searchParams.get('orgId');
  if (queryOrgId) {
    return queryOrgId;
  }

  return undefined;
}

/**
 * Higher-order function that wraps an API route handler with tenant context.
 * This ensures the AsyncLocalStorage context is set before the handler runs.
 *
 * Usage:
 * ```ts
 * import { withTenantContext } from '@/middleware/tenant-context';
 *
 * export const GET = withTenantContext(async (req) => {
 *   // organizationId is automatically injected into all Prisma queries
 *   const projects = await prisma.project.findMany();
 *   return NextResponse.json(projects);
 * });
 * ```
 */
export function withTenantContext(
  handler: (req: NextRequest, context?: any) => Promise<NextResponse>
) {
  return async (req: NextRequest, routeContext?: any): Promise<NextResponse> => {
    const pathname = new URL(req.url).pathname;

    // Skip tenant enforcement for bypass routes
    if (shouldBypass(pathname)) {
      return handler(req, routeContext);
    }

    try {
      // Get session — this works with next-auth
      let session: any = null;
      try {
        session = await getServerSession();
      } catch {
        // If getServerSession fails, we'll try other methods
      }

      const organizationId = await extractOrganizationId(req, session);

      if (!organizationId) {
        return NextResponse.json(
          {
            error: 'Organization context required',
            code: 'TENANT_CONTEXT_MISSING',
            message:
              'Please provide an organization ID via the x-organization-id header, session, or orgId query parameter.',
          },
          { status: 403 }
        );
      }

      const ctx: RequestContext = {
        organizationId,
        userId: session?.user?.id,
      };

      // Run the handler within the AsyncLocalStorage context
      return await requestContext.run(ctx, () => handler(req, routeContext));
    } catch (error) {
      if (error instanceof TenantContextError) {
        return NextResponse.json(
          {
            error: 'Tenant isolation error',
            code: error.code,
            message: error.message,
          },
          { status: 403 }
        );
      }
      throw error;
    }
  };
}

/**
 * Middleware for Next.js middleware.ts (edge runtime compatible version).
 * This sets the org header for downstream use but cannot use AsyncLocalStorage
 * directly in edge runtime. Use withTenantContext for API routes instead.
 */
export function tenantMiddleware(req: NextRequest): NextResponse | undefined {
  const pathname = req.nextUrl.pathname;

  // Only process API routes
  if (!pathname.startsWith('/api')) {
    return undefined;
  }

  // Skip bypass routes
  if (shouldBypass(pathname)) {
    return undefined;
  }

  // If no org header is set, we let the route handler deal with it
  // This middleware just validates the header format if present
  const orgId = req.headers.get(ORG_HEADER);
  if (orgId && !/^[a-zA-Z0-9_-]+$/.test(orgId)) {
    return NextResponse.json(
      {
        error: 'Invalid organization ID format',
        code: 'INVALID_ORG_ID',
      },
      { status: 400 }
    );
  }

  return undefined;
}
