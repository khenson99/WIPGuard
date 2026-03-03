import { describe, it, expect, vi } from 'vitest';
import {
  buildOutboxMetrics,
  buildCircuitBreakerMetrics,
  buildSloMetrics,
  buildAppInfoMetrics,
  collectMetrics,
} from '../collector';

describe('metrics collector', () => {
  describe('buildOutboxMetrics', () => {
    it('builds metrics from standard field names', () => {
      const families = buildOutboxMetrics({
        pending: 10,
        failed: 3,
        deadLetter: 1,
        processed: 100,
        total: 114,
      });

      expect(families).toHaveLength(5);

      const pendingFamily = families.find(
        (f) => f.definition.name === 'wipguard_outbox_events_pending'
      );
      expect(pendingFamily?.samples[0].value).toBe(10);

      const failedFamily = families.find(
        (f) => f.definition.name === 'wipguard_outbox_events_failed'
      );
      expect(failedFamily?.samples[0].value).toBe(3);

      const deadLetterFamily = families.find(
        (f) => f.definition.name === 'wipguard_outbox_events_dead_letter'
      );
      expect(deadLetterFamily?.samples[0].value).toBe(1);
    });

    it('builds metrics from alternative field names (pendingCount, etc.)', () => {
      const families = buildOutboxMetrics({
        pendingCount: 5,
        failedCount: 2,
        deadLetterCount: 0,
        processedCount: 50,
        totalCount: 57,
      });

      const pendingFamily = families.find(
        (f) => f.definition.name === 'wipguard_outbox_events_pending'
      );
      expect(pendingFamily?.samples[0].value).toBe(5);
    });

    it('defaults to 0 for missing fields', () => {
      const families = buildOutboxMetrics({});

      for (const family of families) {
        expect(family.samples[0].value).toBe(0);
      }
    });
  });

  describe('buildCircuitBreakerMetrics', () => {
    it('builds state metrics for multiple providers', () => {
      const families = buildCircuitBreakerMetrics([
        { provider: 'HUBSPOT', state: 'closed', failureCount: 0 },
        { provider: 'SLACK', state: 'open', failureCount: 5 },
      ]);

      const stateFamily = families.find(
        (f) => f.definition.name === 'wipguard_circuit_breaker_state'
      );
      expect(stateFamily).toBeDefined();
      expect(stateFamily!.samples).toHaveLength(2);
      expect(stateFamily!.samples[0].value).toBe(0); // closed
      expect(stateFamily!.samples[0].labels?.provider).toBe('HUBSPOT');
      expect(stateFamily!.samples[1].value).toBe(1); // open
      expect(stateFamily!.samples[1].labels?.provider).toBe('SLACK');
    });

    it('builds failure count metrics', () => {
      const families = buildCircuitBreakerMetrics([
        { provider: 'HUBSPOT', state: 'closed', failureCount: 3 },
      ]);

      const failureFamily = families.find(
        (f) => f.definition.name === 'wipguard_circuit_breaker_failure_count'
      );
      expect(failureFamily).toBeDefined();
      expect(failureFamily!.samples[0].value).toBe(3);
    });

    it('returns empty array for no breakers', () => {
      const families = buildCircuitBreakerMetrics([]);
      expect(families).toHaveLength(0);
    });
  });

  describe('buildSloMetrics', () => {
    it('builds target, current, and met metrics', () => {
      const families = buildSloMetrics([
        { name: 'availability', target: 0.999, current: 0.998, met: false },
        { name: 'latency_p99', target: 500, current: 450, met: true },
      ]);

      const targetFamily = families.find(
        (f) => f.definition.name === 'wipguard_slo_target'
      );
      expect(targetFamily).toBeDefined();
      expect(targetFamily!.samples).toHaveLength(2);

      const metFamily = families.find(
        (f) => f.definition.name === 'wipguard_slo_met'
      );
      expect(metFamily).toBeDefined();
      expect(metFamily!.samples[0].value).toBe(0); // not met
      expect(metFamily!.samples[1].value).toBe(1); // met
    });

    it('returns empty array for empty SLO list', () => {
      const families = buildSloMetrics([]);
      expect(families).toHaveLength(0);
    });
  });

  describe('buildAppInfoMetrics', () => {
    it('returns app info and up metrics', () => {
      const families = buildAppInfoMetrics();
      expect(families).toHaveLength(2);

      const upFamily = families.find(
        (f) => f.definition.name === 'wipguard_up'
      );
      expect(upFamily?.samples[0].value).toBe(1);
    });
  });

  describe('collectMetrics', () => {
    it('returns app info even with no collectors', async () => {
      const result = await collectMetrics();
      expect(result).toContain('wipguard_up 1');
      expect(result).toContain('wipguard_app_info');
    });

    it('includes outbox metrics when collector is provided', async () => {
      const result = await collectMetrics({
        getOutboxMetrics: () => ({
          pending: 5,
          failed: 1,
          deadLetter: 0,
          processed: 50,
          total: 56,
        }),
      });

      expect(result).toContain('wipguard_outbox_events_pending 5');
      expect(result).toContain('wipguard_outbox_events_failed 1');
    });

    it('includes circuit breaker metrics when collector is provided', async () => {
      const result = await collectMetrics({
        getCircuitBreakers: () => [
          { provider: 'HUBSPOT', state: 'closed', failureCount: 0 },
        ],
      });

      expect(result).toContain('wipguard_circuit_breaker_state{provider="HUBSPOT"} 0');
    });

    it('handles collector errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await collectMetrics({
        getOutboxMetrics: () => {
          throw new Error('DB connection failed');
        },
      });

      // Should still return app info
      expect(result).toContain('wipguard_up 1');
      // Should not crash
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('handles async collectors', async () => {
      const result = await collectMetrics({
        getOutboxMetrics: async () => ({
          pending: 3,
          failed: 0,
          deadLetter: 0,
          processed: 20,
          total: 23,
        }),
      });

      expect(result).toContain('wipguard_outbox_events_pending 3');
    });
  });
});
