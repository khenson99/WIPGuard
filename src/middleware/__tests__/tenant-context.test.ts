import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRequestContext } from "@/lib/request-context";
import { ORG_HEADER, withTenantContext } from "../tenant-context";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { getServerSession } from "next-auth";

const mockedGetServerSession = vi.mocked(getServerSession);

function createRequest(
  url: string,
  options: { headers?: Record<string, string> } = {}
): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    headers: new Headers(options.headers),
  });
}

describe("withTenantContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets organization context from header", async () => {
    let capturedOrgId: string | undefined;
    const handler = withTenantContext(async () => {
      capturedOrgId = getRequestContext()?.organizationId;
      return NextResponse.json({ ok: true });
    });

    mockedGetServerSession.mockResolvedValue(null);
    const res = await handler(createRequest("/api/projects", { headers: { [ORG_HEADER]: "org-from-header" } }));

    expect(res.status).toBe(200);
    expect(capturedOrgId).toBe("org-from-header");
  });

  it("sets organization context from session", async () => {
    let capturedOrgId: string | undefined;
    const handler = withTenantContext(async () => {
      capturedOrgId = getRequestContext()?.organizationId;
      return NextResponse.json({ ok: true });
    });

    mockedGetServerSession.mockResolvedValue({
      user: { id: "user-1", organizationId: "org-from-session" },
    } as never);

    const res = await handler(createRequest("/api/projects"));

    expect(res.status).toBe(200);
    expect(capturedOrgId).toBe("org-from-session");
  });

  it("sets organization context from query parameter", async () => {
    let capturedOrgId: string | undefined;
    const handler = withTenantContext(async () => {
      capturedOrgId = getRequestContext()?.organizationId;
      return NextResponse.json({ ok: true });
    });

    mockedGetServerSession.mockResolvedValue(null);
    const res = await handler(createRequest("/api/projects?orgId=org-from-query"));

    expect(res.status).toBe(200);
    expect(capturedOrgId).toBe("org-from-query");
  });

  it("returns 403 when no organization context is available", async () => {
    const handler = withTenantContext(async () => NextResponse.json({ ok: true }));

    mockedGetServerSession.mockResolvedValue(null);
    const res = await handler(createRequest("/api/projects"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe("TENANT_CONTEXT_MISSING");
  });

  it("bypasses auth routes", async () => {
    let handlerCalled = false;
    const handler = withTenantContext(async () => {
      handlerCalled = true;
      return NextResponse.json({ ok: true });
    });

    const res = await handler(createRequest("/api/auth/signin"));
    expect(res.status).toBe(200);
    expect(handlerCalled).toBe(true);
  });

  it("bypasses health check routes", async () => {
    const handler = withTenantContext(async () => NextResponse.json({ healthy: true }));
    await expect(handler(createRequest("/api/health"))).resolves.toHaveProperty("status", 200);
  });

  it("header takes priority over session", async () => {
    let capturedOrgId: string | undefined;
    const handler = withTenantContext(async () => {
      capturedOrgId = getRequestContext()?.organizationId;
      return NextResponse.json({ ok: true });
    });

    mockedGetServerSession.mockResolvedValue({
      user: { id: "user-1", organizationId: "org-session" },
    } as never);

    await handler(createRequest("/api/projects", { headers: { [ORG_HEADER]: "org-header-priority" } }));
    expect(capturedOrgId).toBe("org-header-priority");
  });

  it("captures userId from session", async () => {
    let capturedUserId: string | undefined;
    const handler = withTenantContext(async () => {
      capturedUserId = getRequestContext()?.userId;
      return NextResponse.json({ ok: true });
    });

    mockedGetServerSession.mockResolvedValue({
      user: { id: "user-captured", organizationId: "org-123" },
    } as never);

    await handler(createRequest("/api/projects", { headers: { [ORG_HEADER]: "org-123" } }));
    expect(capturedUserId).toBe("user-captured");
  });

  it("handles getServerSession failure gracefully", async () => {
    const handler = withTenantContext(async () => NextResponse.json({ ok: true }));
    mockedGetServerSession.mockRejectedValue(new Error("Session error"));

    const res = await handler(createRequest("/api/projects", { headers: { [ORG_HEADER]: "org-fallback" } }));
    expect(res.status).toBe(200);
  });
});
