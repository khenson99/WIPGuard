import { describe, expect, it, vi } from "vitest";

import {
  isConnectionAcquisitionTimeout,
  withConnectionAcquisitionRetry,
} from "../prisma-connect-retry";

const checkoutTimeout = () =>
  new Error("timeout exceeded when trying to connect");
const handshakeTimeout = () =>
  new Error("Connection terminated due to connection timeout");

describe("isConnectionAcquisitionTimeout", () => {
  it("matches the pg-pool checkout timeout", () => {
    expect(isConnectionAcquisitionTimeout(checkoutTimeout())).toBe(true);
  });

  it("matches the pg handshake timeout regardless of case", () => {
    expect(isConnectionAcquisitionTimeout(handshakeTimeout())).toBe(true);
    expect(
      isConnectionAcquisitionTimeout(
        new Error("CONNECTION TERMINATED DUE TO CONNECTION TIMEOUT")
      )
    ).toBe(true);
  });

  it("matches errors wrapped in a cause chain (driver-adapter wrapping)", () => {
    const wrapped = Object.assign(
      new Error("Invalid `prisma.user.count()` invocation"),
      { cause: checkoutTimeout() }
    );
    expect(isConnectionAcquisitionTimeout(wrapped)).toBe(true);

    const doubleWrapped = Object.assign(new Error("outer"), {
      cause: Object.assign(new Error("middle"), { cause: handshakeTimeout() }),
    });
    expect(isConnectionAcquisitionTimeout(doubleWrapped)).toBe(true);
  });

  it("matches members of an AggregateError", () => {
    const aggregate = Object.assign(new Error("several things failed"), {
      errors: [new Error("unrelated"), checkoutTimeout()],
    });
    expect(isConnectionAcquisitionTimeout(aggregate)).toBe(true);
  });

  it("matches plain string and message-bearing objects", () => {
    expect(
      isConnectionAcquisitionTimeout("timeout exceeded when trying to connect")
    ).toBe(true);
    expect(
      isConnectionAcquisitionTimeout({
        message: "Connection terminated due to connection timeout",
      })
    ).toBe(true);
  });

  it("does not match post-dispatch failures or unrelated errors", () => {
    expect(
      isConnectionAcquisitionTimeout(
        new Error("Connection terminated unexpectedly")
      )
    ).toBe(false);
    expect(
      isConnectionAcquisitionTimeout(
        new Error("duplicate key value violates unique constraint")
      )
    ).toBe(false);
    expect(isConnectionAcquisitionTimeout(new Error("query timeout"))).toBe(
      false
    );
    expect(isConnectionAcquisitionTimeout(null)).toBe(false);
    expect(isConnectionAcquisitionTimeout(undefined)).toBe(false);
  });

  it("terminates on self-referential cause chains", () => {
    const circular = new Error("outer") as Error & { cause?: unknown };
    circular.cause = circular;
    expect(isConnectionAcquisitionTimeout(circular)).toBe(false);
  });
});

describe("withConnectionAcquisitionRetry", () => {
  const instantSleep = () => Promise.resolve();

  it("returns the result without retrying on success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(
      withConnectionAcquisitionRetry(fn, { sleep: instantSleep })
    ).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries acquisition timeouts and then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(checkoutTimeout())
      .mockRejectedValueOnce(handshakeTimeout())
      .mockResolvedValue("ok");
    const onRetry = vi.fn();

    await expect(
      withConnectionAcquisitionRetry(fn, {
        retries: 2,
        sleep: instantSleep,
        onRetry,
      })
    ).resolves.toBe("ok");

    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("gives up after the configured number of retries", async () => {
    const fn = vi.fn().mockRejectedValue(checkoutTimeout());

    await expect(
      withConnectionAcquisitionRetry(fn, {
        retries: 2,
        sleep: instantSleep,
        onRetry: () => {},
      })
    ).rejects.toThrow("timeout exceeded when trying to connect");

    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("does not retry non-acquisition errors", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(new Error("Connection terminated unexpectedly"));

    await expect(
      withConnectionAcquisitionRetry(fn, { retries: 5, sleep: instantSleep })
    ).rejects.toThrow("Connection terminated unexpectedly");

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("setting retries to 0 disables retrying entirely", async () => {
    const fn = vi.fn().mockRejectedValue(checkoutTimeout());

    await expect(
      withConnectionAcquisitionRetry(fn, { retries: 0, sleep: instantSleep })
    ).rejects.toThrow("timeout exceeded when trying to connect");

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("backs off exponentially and caps the delay at maxDelayMs + jitter", async () => {
    const delays: number[] = [];
    const fn = vi.fn().mockRejectedValue(checkoutTimeout());

    await withConnectionAcquisitionRetry(fn, {
      retries: 4,
      baseDelayMs: 100,
      maxDelayMs: 250,
      sleep: instantSleep,
      onRetry: (_attempt, delayMs) => {
        delays.push(delayMs);
      },
    }).catch(() => {});

    expect(delays).toHaveLength(4);
    // attempt 1: 100 + jitter(0..100); later attempts capped at 250 + jitter.
    expect(delays[0]).toBeGreaterThanOrEqual(100);
    for (const delay of delays) {
      expect(delay).toBeLessThanOrEqual(250 + 100);
    }
    // non-decreasing up to the cap
    expect(delays[1]).toBeGreaterThanOrEqual(delays[0] - 100);
  });
});
