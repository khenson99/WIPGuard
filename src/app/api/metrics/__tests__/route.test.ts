import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

describe('GET /api/metrics', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function createRequest(headers: Record<string, string> = {}): NextRequest {
    return new NextRequest('http://localhost:3000/api/metrics', {
      method: 'GET',
      headers,
    });
  }

  it('returns 404 when METRICS_BEARER_TOKEN is not set', async () => {
    delete process.env.METRICS_BEARER_TOKEN;
    const request = createRequest();
    const response = await GET(request);
    expect(response.status).toBe(404);
  });

  it('returns 401 when no authorization header is provided', async () => {
    process.env.METRICS_BEARER_TOKEN = 'test-secret-token';
    const request = createRequest();
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('returns 401 for invalid token', async () => {
    process.env.METRICS_BEARER_TOKEN = 'test-secret-token';
    const request = createRequest({ authorization: 'Bearer wrong-token-here' });
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('returns 401 for malformed authorization header', async () => {
    process.env.METRICS_BEARER_TOKEN = 'test-secret-token';
    const request = createRequest({ authorization: 'Basic dXNlcjpwYXNz' });
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('returns 200 with Prometheus format for valid token', async () => {
    process.env.METRICS_BEARER_TOKEN = 'test-secret-token';
    const request = createRequest({ authorization: 'Bearer test-secret-token' });
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(response.headers.get('content-type')).toContain('version=0.0.4');

    const body = await response.text();
    expect(body).toContain('the_mother_node_up 1');
    expect(body).toContain('# HELP');
    expect(body).toContain('# TYPE');
  });

  it('returns no-cache headers', async () => {
    process.env.METRICS_BEARER_TOKEN = 'test-secret-token';
    const request = createRequest({ authorization: 'Bearer test-secret-token' });
    const response = await GET(request);

    expect(response.headers.get('cache-control')).toBe(
      'no-cache, no-store, must-revalidate'
    );
  });
});
