import { afterEach, describe, expect, it, vi } from 'vitest';
import { withTimeout } from '../timeout';

describe('withTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('clears the timeout when the operation finishes successfully', async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    await expect(withTimeout(Promise.resolve('ok'), 1_000, 'timed out')).resolves.toBe('ok');
    await vi.runAllTimersAsync();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('rejects with the timeout error when the operation does not finish in time', async () => {
    vi.useFakeTimers();

    const pending = new Promise<string>(() => {});
    const result = withTimeout(pending, 1_000, 'timed out');
    const rejection = expect(result).rejects.toThrow('timed out');

    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
  });
});
