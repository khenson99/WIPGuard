/**
 * Lightweight HTTP health check server for the worker process.
 *
 * Railway (and other platforms) can use this to determine if the worker is alive.
 * Exposes:
 *   GET /health  → { status: 'ok', lastSync: ..., uptime: ... }
 *   GET /ready   → 200 if ready, 503 if not
 */

import http from 'http';
import { workerConfig } from './config';
import { logger } from './logger';

let lastSyncTimestamp: string | null = null;
let lastSyncDurationMs: number | null = null;
let lastSyncStatus: 'success' | 'error' | 'running' | null = null;
let isReady = false;

export function updateSyncStatus(status: 'success' | 'error' | 'running', durationMs?: number) {
  lastSyncStatus = status;
  if (status !== 'running') {
    lastSyncTimestamp = new Date().toISOString();
    lastSyncDurationMs = durationMs ?? null;
  }
}

export function setReady(ready: boolean) {
  isReady = ready;
}

export function startHealthServer(): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'wipguard-worker',
          uptime: process.uptime(),
          lastSync: lastSyncTimestamp,
          lastSyncDurationMs,
          lastSyncStatus,
        })
      );
    } else if (req.url === '/ready' && req.method === 'GET') {
      if (isReady) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ready: true }));
      } else {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ready: false }));
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(workerConfig.healthCheckPort, () => {
    logger.info(`Worker health server listening on port ${workerConfig.healthCheckPort}`);
  });

  return server;
}
