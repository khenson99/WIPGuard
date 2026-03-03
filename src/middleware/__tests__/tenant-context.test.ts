import { NextRequest, NextResponse } from 'next/server';
import { withTenantContext, ORG_HEADER } from '../tenant-context';
import { getRequestContext } from '@/lib/request-context';

// Mock next-auth
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

import { getServerSession } from 'next-auth';

const mockedGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;

function createRequest(
  url: string,
  options: { headers?: Record<string, string> } = {}
): NextRequest {
  const headers = new Headers(options.headers);
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    headers,
  });
}

describe('withTenantContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets organization context from header', async () => {
    let capturedOrgId: string | undefined;

    const handler = withTenantContext(async () => {
      capturedOrgId = getRequestContext()?.organizationId;
      return NextResponse.json({ ok: true });
    });

    const req = createRequest('/api/projects', {
      headers: { [ORG_HEADER]: 'org-from-header' },
    });

    mockedGetServerSession.mockResolvedValue(null);

    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(capturedOrgId).toBe('org-from-header');
  });

  it('sets organization context from session', async () => {
    let capturedOrgId: string | undefined;

    const handler = withTenantContext(async () => {
      capturedOrgId = getRequestContext()?.organizationId;
      return NextResponse.json({ ok: true });
    });

    const req = createRequest('/api/projects');

    mockedGetServerSession.mockResolvedValue({
      user: { id: 'user-1', organizationId: 'org-from-session' },
    } as any);

    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(capturedOrgId).toBe('org-from-session');
  });

  it('sets organization context from query parameter', async () => {
    let capturedOrgId: string | undefined;

    const handler = withTenantContext(async () => {
      capturedOrgId = getRequestContext()?.organizationId;
      return NextResponse.json({ ok: true });
    });

    const req = createRequest('/api/projects?orgId=org-from-query');

    mockedGetServerSession.mockResolvedValue(null);

    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(capturedOrgId).toBe('org-from-query');
  });

  it('returns 403 when no organization context is available', async () => {
    const handler = withTenantContext(async () => {
      return NextResponse.json({ ok: true });
    });

    const req = createRequest('/api/projects');
    mockedGetServerSession.mockResolvedValue(null);

    const res = await handler(req);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.code).toBe('TENANT_CONTEXT_MISSING');
  });

  it('bypasses auth routes', async () => {
    let handlerCalled = false;

    const handler = withTenantContext(async () => {
      handlerCalled = true;
      return NextResponse.json({ ok: true });
    });

    const req = createRequest('/api/auth/signin');

    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(handlerCalled).toBe(true);
  });

  it('bypasses health check routes', async () => {
    const handler = withTenantContext(async () => {
      return NextResponse.json({ healthy: true });
    });

    const req = createRequest('/api/health');
    const res = await handler(req);
    expect(res.status).toBe(200);
  });

  it('header takes priority over session', async () => {
    let capturedOrgId: string | undefined;

    const handler = withTenantContext(async () => {
      capturedOrgId = getRequestContext()?.organizationId;
      return NextResponse.json({ ok: true });
    });

    const req = createRequest('/api/projects', {
      headers: { [ORG_HEADER]: 'org-header-priority' },
    });

    mockedGetServerSession.mockResolvedValue({
      user: { id: 'user-1', organizationId: 'org-session' },
    } as any);

    await handler(req);
    expect(capturedOrgId).toBe('org-header-priority');
  });

  it('captures userId from session', async () => {
    let capturedUserId: string | undefined;

    const handler = withTenantContext(async () => {
      capturedUserId = getRequestContext()?.userId;
      return NextResponse.json({ ok: true });
    });

    const req = createRequest('/api/projects', {
      headers: { [ORG_HEADER]: 'org-123' },
    });

    mockedGetServerSession.mockResolvedValue({
      user: { id: 'user-captured', organizationId: 'org-123' },
    } as any);

    await handler(req);
    expect(capturedUserId).toBe('user-captured');
  });

  it('handles getServerSession failure gracefully', async () => {
    const handler = withTenantContext(async () => {
      return NextResponse.json({ ok: true });
    });

    const req = createRequest('/api/projects', {
      headers: { [ORG_HEADER]: 'org-fallback' },
    });

    mockedGetServerSession.mockRejectedValue(new Error('Session error'));

    const res = await handler(req);
    expect(res.status).toBe(200);
  });
});
