import { describe, it, expect } from 'vitest';
import {
  formatMetricFamily,
  formatLabels,
  escapeLabelValue,
  formatValue,
  formatMetrics,
  circuitBreakerStateToNumber,
  type MetricFamily,
} from '../prometheus';

describe('prometheus formatter', () => {
  describe('escapeLabelValue', () => {
    it('escapes backslashes', () => {
      expect(escapeLabelValue('a\\b')).toBe('a\\\\b');
    });

    it('escapes double quotes', () => {
      expect(escapeLabelValue('a"b')).toBe('a\\"b');
    });

    it('escapes newlines', () => {
      expect(escapeLabelValue('a\nb')).toBe('a\\nb');
    });

    it('returns plain strings unchanged', () => {
      expect(escapeLabelValue('hello')).toBe('hello');
    });
  });

  describe('formatLabels', () => {
    it('returns empty string for undefined labels', () => {
      expect(formatLabels(undefined)).toBe('');
    });

    it('returns empty string for empty labels', () => {
      expect(formatLabels({})).toBe('');
    });

    it('formats single label', () => {
      expect(formatLabels({ provider: 'HUBSPOT' })).toBe('{provider="HUBSPOT"}');
    });

    it('formats multiple labels', () => {
      const result = formatLabels({ provider: 'HUBSPOT', region: 'us-east-1' });
      expect(result).toBe('{provider="HUBSPOT",region="us-east-1"}');
    });
  });

  describe('formatValue', () => {
    it('formats regular numbers', () => {
      expect(formatValue(42)).toBe('42');
      expect(formatValue(3.14)).toBe('3.14');
      expect(formatValue(0)).toBe('0');
    });

    it('formats NaN', () => {
      expect(formatValue(NaN)).toBe('NaN');
    });

    it('formats Infinity', () => {
      expect(formatValue(Infinity)).toBe('+Inf');
      expect(formatValue(-Infinity)).toBe('-Inf');
    });
  });

  describe('formatMetricFamily', () => {
    it('formats a gauge without labels', () => {
      const family: MetricFamily = {
        definition: {
          name: 'wipguard_up',
          help: 'Whether the app is up',
          type: 'gauge',
        },
        samples: [{ name: 'wipguard_up', value: 1 }],
      };

      const result = formatMetricFamily(family);
      expect(result).toBe(
        '# HELP wipguard_up Whether the app is up\n' +
        '# TYPE wipguard_up gauge\n' +
        'wipguard_up 1'
      );
    });

    it('formats a gauge with labels', () => {
      const family: MetricFamily = {
        definition: {
          name: 'wipguard_circuit_breaker_state',
          help: 'Circuit breaker state',
          type: 'gauge',
        },
        samples: [
          { name: 'wipguard_circuit_breaker_state', value: 0, labels: { provider: 'HUBSPOT' } },
          { name: 'wipguard_circuit_breaker_state', value: 1, labels: { provider: 'SLACK' } },
        ],
      };

      const result = formatMetricFamily(family);
      expect(result).toContain('wipguard_circuit_breaker_state{provider="HUBSPOT"} 0');
      expect(result).toContain('wipguard_circuit_breaker_state{provider="SLACK"} 1');
    });

    it('formats a counter', () => {
      const family: MetricFamily = {
        definition: {
          name: 'wipguard_events_total',
          help: 'Total events',
          type: 'counter',
        },
        samples: [{ name: 'wipguard_events_total', value: 100 }],
      };

      const result = formatMetricFamily(family);
      expect(result).toContain('# TYPE wipguard_events_total counter');
      expect(result).toContain('wipguard_events_total 100');
    });
  });

  describe('formatMetrics', () => {
    it('formats multiple families separated by blank lines', () => {
      const families: MetricFamily[] = [
        {
          definition: { name: 'metric_a', help: 'First metric', type: 'gauge' },
          samples: [{ name: 'metric_a', value: 1 }],
        },
        {
          definition: { name: 'metric_b', help: 'Second metric', type: 'gauge' },
          samples: [{ name: 'metric_b', value: 2 }],
        },
      ];

      const result = formatMetrics(families);
      expect(result).toContain('metric_a 1');
      expect(result).toContain('metric_b 2');
      // Should have blank line between families
      expect(result).toContain('\n\n');
      // Should end with newline
      expect(result.endsWith('\n')).toBe(true);
    });
  });

  describe('circuitBreakerStateToNumber', () => {
    it('maps closed to 0', () => {
      expect(circuitBreakerStateToNumber('closed')).toBe(0);
      expect(circuitBreakerStateToNumber('CLOSED')).toBe(0);
    });

    it('maps open to 1', () => {
      expect(circuitBreakerStateToNumber('open')).toBe(1);
      expect(circuitBreakerStateToNumber('OPEN')).toBe(1);
    });

    it('maps half-open to 0.5', () => {
      expect(circuitBreakerStateToNumber('half-open')).toBe(0.5);
      expect(circuitBreakerStateToNumber('HALF-OPEN')).toBe(0.5);
      expect(circuitBreakerStateToNumber('half_open')).toBe(0.5);
    });

    it('maps unknown states to -1', () => {
      expect(circuitBreakerStateToNumber('unknown')).toBe(-1);
    });
  });
});
