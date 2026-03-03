import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('workerConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Clear the module cache so config re-reads env vars
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses default values when env vars are not set', async () => {
    const { workerConfig } = await import('../config');

    expect(workerConfig.databasePoolSize).toBe(5);
    expect(workerConfig.databaseTimeout).toBe(30000);
    expect(workerConfig.healthCheckPort).toBe(8081);
    expect(workerConfig.syncTimeoutMs).toBe(300000);
    expect(workerConfig.syncIntervalMs).toBe(300000);
    expect(workerConfig.runOnce).toBe(false);
    expect(workerConfig.logLevel).toBe('info');
  });

  it('reads custom values from environment', async () => {
    process.env.WORKER_DB_POOL_SIZE = '10';
    process.env.WORKER_DB_TIMEOUT = '60000';
    process.env.WORKER_HEALTH_PORT = '9090';
    process.env.WORKER_SYNC_TIMEOUT = '600000';
    process.env.WORKER_SYNC_INTERVAL = '120000';
    process.env.WORKER_RUN_ONCE = 'true';
    process.env.WORKER_LOG_LEVEL = 'debug';

    const { workerConfig } = await import('../config');

    expect(workerConfig.databasePoolSize).toBe(10);
    expect(workerConfig.databaseTimeout).toBe(60000);
    expect(workerConfig.healthCheckPort).toBe(9090);
    expect(workerConfig.syncTimeoutMs).toBe(600000);
    expect(workerConfig.syncIntervalMs).toBe(120000);
    expect(workerConfig.runOnce).toBe(true);
    expect(workerConfig.logLevel).toBe('debug');
  });

  it('allows disabling individual sync modules', async () => {
    process.env.WORKER_SYNC_HUBSPOT = 'false';
    process.env.WORKER_SYNC_SLACK = 'false';

    const { workerConfig } = await import('../config');

    expect(workerConfig.modules.hubspot).toBe(false);
    expect(workerConfig.modules.slack).toBe(false);
    expect(workerConfig.modules.coda).toBe(true);
    expect(workerConfig.modules.google).toBe(true);
    expect(workerConfig.modules.analytics).toBe(true);
    expect(workerConfig.modules.healthChecks).toBe(true);
  });
});
