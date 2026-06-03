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
let lastSyncError: string | null = null;
let isReady = false;

export function updateSyncStatus(
  status: 'success' | 'error' | 'running',
  durationMs?: number,
  error?: string
) {
  lastSyncStatus = status;
  lastSyncError = status === 'error' ? error ?? null : null;

  if (status !== 'running') {
    lastSyncTimestamp = new Date().toISOString();
    lastSyncDurationMs = durationMs ?? null;
  }
}

export function setReady(ready: boolean) {
  isReady = ready;
}

export function createHealthServer(): http.Server {
  return http.createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'the-mother-node-worker',
          uptime: process.uptime(),
          lastSync: lastSyncTimestamp,
          lastSyncDurationMs,
          lastSyncStatus,
          lastSyncError,
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
}

export function startHealthServer(): http.Server {
  const server = createHealthServer();
  server.listen(workerConfig.healthCheckPort, workerConfig.healthCheckHost, () => {
    logger.info(
      `Worker health server listening on ${workerConfig.healthCheckHost}:${workerConfig.healthCheckPort}`
    );
  });

  return server;
}
