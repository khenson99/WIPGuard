import { describe, it, expect, vi } from 'vitest';
import type http from 'http';

type HealthModule = typeof import('../health');

function request(
  healthModule: HealthModule,
  url: string,
): { status: number; body: string; headers: http.OutgoingHttpHeaders | undefined } {
  const response = {
    status: 0,
    body: '',
    headers: undefined as http.OutgoingHttpHeaders | undefined,
  };
  const res = {
    writeHead(status: number, headers?: http.OutgoingHttpHeaders) {
      response.status = status;
      response.headers = headers;
      return res;
    },
    end(body?: string) {
      response.body = body ?? '';
      return res;
    },
  } as unknown as http.ServerResponse;

  healthModule.handleHealthRequest(
    { url, method: 'GET' } as http.IncomingMessage,
    res,
  );

  return response;
}

describe('health server', () => {
  it('returns 200 on /health', async () => {
    vi.resetModules();
    const healthModule = await import('../health');

    const res = request(healthModule, '/health');
    expect(res.status).toBe(200);

    const data = JSON.parse(res.body);
    expect(data.status).toBe('ok');
    expect(data.service).toBe('the-mother-node-worker');
    expect(typeof data.uptime).toBe('number');
  });

  it('returns 503 on /ready when not ready', async () => {
    vi.resetModules();
    const healthModule = await import('../health');
    healthModule.setReady(false);

    const res = request(healthModule, '/ready');
    expect(res.status).toBe(503);
  });

  it('returns 200 on /ready when ready', async () => {
    vi.resetModules();
    const healthModule = await import('../health');
    healthModule.setReady(true);

    const res = request(healthModule, '/ready');
    expect(res.status).toBe(200);
  });

  it('tracks sync status updates', async () => {
    vi.resetModules();
    const healthModule = await import('../health');
    healthModule.updateSyncStatus('success', 1500);

    const res = request(healthModule, '/health');
    const data = JSON.parse(res.body);
    expect(data.lastSyncStatus).toBe('success');
    expect(data.lastSyncDurationMs).toBe(1500);
    expect(data.lastSync).toBeTruthy();
  });

  it('exposes the latest sync error detail and clears it after success', async () => {
    vi.resetModules();
    const healthModule = await import('../health');
    healthModule.updateSyncStatus('error', 2500, 'analytics: 2 provider refresh failures');

    const failed = request(healthModule, '/health');
    const failedData = JSON.parse(failed.body);
    expect(failedData.lastSyncStatus).toBe('error');
    expect(failedData.lastSyncError).toBe('analytics: 2 provider refresh failures');

    healthModule.updateSyncStatus('success', 1000);

    const recovered = request(healthModule, '/health');
    const recoveredData = JSON.parse(recovered.body);
    expect(recoveredData.lastSyncStatus).toBe('success');
    expect(recoveredData.lastSyncError).toBeNull();
  });
});
