import { describe, it, expect, afterEach } from 'vitest';
import type { IncomingMessage, Server, ServerResponse } from 'http';

function request(
  server: Server,
  url: string
): Promise<{ status: number; body: string }> {
  return new Promise((resolve) => {
    const req = { method: 'GET', url } as IncomingMessage;
    const res = {
      statusCode: 200,
      body: '',
      writeHead(statusCode: number) {
        this.statusCode = statusCode;
        return this;
      },
      end(chunk?: string) {
        this.body += chunk ?? '';
        resolve({ status: this.statusCode, body: this.body });
      },
    } as ServerResponse & { body: string };

    server.emit('request', req, res);
  });
}

describe('health server', () => {
  let server: Server;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('returns 200 on /health', async () => {
    vi.resetModules();
    const healthModule = await import('../health');
    server = healthModule.createHealthServer();

    const res = await request(server, '/health');
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
    server = healthModule.createHealthServer();

    const res = await request(server, '/ready');
    expect(res.status).toBe(503);
  });

  it('returns 200 on /ready when ready', async () => {
    vi.resetModules();
    const healthModule = await import('../health');
    healthModule.setReady(true);
    server = healthModule.createHealthServer();

    const res = await request(server, '/ready');
    expect(res.status).toBe(200);
  });

  it('tracks sync status updates', async () => {
    vi.resetModules();
    const healthModule = await import('../health');
    healthModule.updateSyncStatus('success', 1500);
    server = healthModule.createHealthServer();

    const res = await request(server, '/health');
    const data = JSON.parse(res.body);
    expect(data.lastSyncStatus).toBe('success');
    expect(data.lastSyncDurationMs).toBe(1500);
    expect(data.lastSync).toBeTruthy();
  });

  it('exposes the latest sync error detail and clears it after success', async () => {
    vi.resetModules();
    const healthModule = await import('../health');
    healthModule.updateSyncStatus('error', 2500, 'analytics: 2 provider refresh failures');
    server = healthModule.createHealthServer();

    const failed = await request(server, '/health');
    const failedData = JSON.parse(failed.body);
    expect(failedData.lastSyncStatus).toBe('error');
    expect(failedData.lastSyncError).toBe('analytics: 2 provider refresh failures');

    healthModule.updateSyncStatus('success', 1000);

    const recovered = await request(server, '/health');
    const recoveredData = JSON.parse(recovered.body);
    expect(recoveredData.lastSyncStatus).toBe('success');
    expect(recoveredData.lastSyncError).toBeNull();
  });
});
