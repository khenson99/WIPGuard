import { describe, it, expect, afterEach } from 'vitest';
import http from 'http';
import { startHealthServer, updateSyncStatus, setReady } from '../health';

function fetch(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

describe('health server', () => {
  let server: http.Server;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('returns 200 on /health', async () => {
    // Use a random high port to avoid conflicts
    process.env.WORKER_HEALTH_PORT = '0';
    vi.resetModules();
    const healthModule = await import('../health');
    server = healthModule.startHealthServer();

    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No address');

    const res = await fetch(`http://127.0.0.1:${address.port}/health`);
    expect(res.status).toBe(200);

    const data = JSON.parse(res.body);
    expect(data.status).toBe('ok');
    expect(data.service).toBe('the-mother-node-worker');
    expect(typeof data.uptime).toBe('number');
  });

  it('returns 503 on /ready when not ready', async () => {
    process.env.WORKER_HEALTH_PORT = '0';
    vi.resetModules();
    const healthModule = await import('../health');
    healthModule.setReady(false);
    server = healthModule.startHealthServer();

    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No address');

    const res = await fetch(`http://127.0.0.1:${address.port}/ready`);
    expect(res.status).toBe(503);
  });

  it('returns 200 on /ready when ready', async () => {
    process.env.WORKER_HEALTH_PORT = '0';
    vi.resetModules();
    const healthModule = await import('../health');
    healthModule.setReady(true);
    server = healthModule.startHealthServer();

    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No address');

    const res = await fetch(`http://127.0.0.1:${address.port}/ready`);
    expect(res.status).toBe(200);
  });

  it('tracks sync status updates', async () => {
    process.env.WORKER_HEALTH_PORT = '0';
    vi.resetModules();
    const healthModule = await import('../health');
    healthModule.updateSyncStatus('success', 1500);
    server = healthModule.startHealthServer();

    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No address');

    const res = await fetch(`http://127.0.0.1:${address.port}/health`);
    const data = JSON.parse(res.body);
    expect(data.lastSyncStatus).toBe('success');
    expect(data.lastSyncDurationMs).toBe(1500);
    expect(data.lastSync).toBeTruthy();
  });
});
