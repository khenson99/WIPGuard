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
    expect(workerConfig.healthCheckHost).toBe('0.0.0.0');
    expect(workerConfig.syncTimeoutMs).toBe(300000);
    expect(workerConfig.syncIntervalMs).toBe(300000);
    expect(workerConfig.runOnce).toBe(false);
    expect(workerConfig.logLevel).toBe('info');
    expect(workerConfig.modules.hubspot).toBe(false);
    expect(workerConfig.modules.slack).toBe(false);
    expect(workerConfig.modules.coda).toBe(false);
    expect(workerConfig.modules.google).toBe(false);
    expect(workerConfig.modules.providerRules).toBe(true);
    expect(workerConfig.modules.visitorFunnelEnrichment).toBe(true);
    expect(workerConfig.modules.analytics).toBe(true);
    expect(workerConfig.modules.healthChecks).toBe(true);
  });

  it('reads custom values from environment', async () => {
    process.env.WORKER_DB_POOL_SIZE = '10';
    process.env.WORKER_DB_TIMEOUT = '60000';
    process.env.WORKER_HEALTH_PORT = '9090';
    process.env.WORKER_HEALTH_HOST = '127.0.0.1';
    process.env.WORKER_SYNC_TIMEOUT = '600000';
    process.env.WORKER_SYNC_INTERVAL = '120000';
    process.env.WORKER_RUN_ONCE = 'true';
    process.env.WORKER_LOG_LEVEL = 'debug';

    const { workerConfig } = await import('../config');

    expect(workerConfig.databasePoolSize).toBe(10);
    expect(workerConfig.databaseTimeout).toBe(60000);
    expect(workerConfig.healthCheckPort).toBe(9090);
    expect(workerConfig.healthCheckHost).toBe('127.0.0.1');
    expect(workerConfig.syncTimeoutMs).toBe(600000);
    expect(workerConfig.syncIntervalMs).toBe(120000);
    expect(workerConfig.runOnce).toBe(true);
    expect(workerConfig.logLevel).toBe('debug');
  });

  it('falls back to safe defaults for invalid numeric values and zero continuous interval', async () => {
    process.env.WORKER_DB_POOL_SIZE = 'not-a-number';
    process.env.WORKER_DB_TIMEOUT = '-1';
    process.env.WORKER_HEALTH_PORT = '-1';
    process.env.WORKER_SYNC_TIMEOUT = 'NaN';
    process.env.WORKER_SYNC_INTERVAL = '0';

    const { workerConfig } = await import('../config');

    expect(workerConfig.databasePoolSize).toBe(5);
    expect(workerConfig.databaseTimeout).toBe(30000);
    expect(workerConfig.healthCheckPort).toBe(8081);
    expect(workerConfig.syncTimeoutMs).toBe(300000);
    expect(workerConfig.syncIntervalMs).toBe(300000);
    expect(workerConfig.runOnce).toBe(false);
  });

  it('allows enabling provider-specific modules and disabling wired sync modules', async () => {
    process.env.WORKER_SYNC_HUBSPOT = 'true';
    process.env.WORKER_SYNC_SLACK = 'true';
    process.env.WORKER_SYNC_PROVIDER_RULES = 'false';
    process.env.WORKER_SYNC_VISITOR_FUNNEL_ENRICHMENT = 'false';

    const { workerConfig } = await import('../config');

    expect(workerConfig.modules.hubspot).toBe(true);
    expect(workerConfig.modules.slack).toBe(true);
    expect(workerConfig.modules.coda).toBe(false);
    expect(workerConfig.modules.google).toBe(false);
    expect(workerConfig.modules.providerRules).toBe(false);
    expect(workerConfig.modules.visitorFunnelEnrichment).toBe(false);
    expect(workerConfig.modules.analytics).toBe(true);
    expect(workerConfig.modules.healthChecks).toBe(true);
  });

  it('ignores stale Coda worker flags because task-migration sync is retired', async () => {
    process.env.WORKER_SYNC_CODA = 'true';

    const { workerConfig } = await import('../config');

    expect(workerConfig.modules.coda).toBe(false);
  });
});
