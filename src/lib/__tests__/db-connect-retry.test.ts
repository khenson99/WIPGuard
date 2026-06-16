import { describe, it, expect, vi } from "vitest";
import {
  connectWithRetry,
  isTransientConnectionError,
} from "../db-connect-retry";

function errWithCode(message: string, code: string): Error {
  const error = new Error(message);
  (error as Error & { code: string }).code = code;
  return error;
}

describe("isTransientConnectionError", () => {
  it("classifies the pg-pool checkout timeout as transient", () => {
    // Exact message thrown by pg-pool when connectionTimeoutMillis elapses —
    // the error seen across the 2026-06-11 07:49-07:54 incident window.
    expect(
      isTransientConnectionError(
        new Error("timeout exceeded when trying to connect")
      )
    ).toBe(true);
  });

  it("classifies socket-level transient errno codes as transient", () => {
    for (const code of ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"]) {
      expect(isTransientConnectionError(errWithCode("connect failed", code))).toBe(
        true
      );
    }
  });

  it("classifies temporarily-unavailable Postgres SQLSTATEs as transient", () => {
    expect(
      isTransientConnectionError(
        errWithCode("the database system is starting up", "57P03")
      )
    ).toBe(true);
    expect(
      isTransientConnectionError(
        errWithCode("sorry, too many clients already", "53300")
      )
    ).toBe(true);
  });

  it("does not classify auth/config failures as transient", () => {
    expect(
      isTransientConnectionError(
        errWithCode("password authentication failed", "28P01")
      )
    ).toBe(false);
    expect(
      isTransientConnectionError(errWithCode("database does not exist", "3D000"))
    ).toBe(false);
    expect(isTransientConnectionError(new Error("unexpected"))).toBe(false);
    expect(isTransientConnectionError(null)).toBe(false);
    expect(isTransientConnectionError("string error")).toBe(false);
  });
});

describe("connectWithRetry", () => {
  const noSleep = () => Promise.resolve();

  it("returns the first successful result without retrying", async () => {
    const acquire = vi.fn().mockResolvedValue("client");
    const onRetry = vi.fn();

    await expect(
      connectWithRetry(acquire, {
        retries: 2,
        baseDelayMs: 100,
        sleep: noSleep,
        onRetry,
      })
    ).resolves.toBe("client");

    expect(acquire).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("retries transient failures and succeeds", async () => {
    const acquire = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout exceeded when trying to connect"))
      .mockRejectedValueOnce(new Error("timeout exceeded when trying to connect"))
      .mockResolvedValue("client");
    const onRetry = vi.fn();

    await expect(
      connectWithRetry(acquire, {
        retries: 2,
        baseDelayMs: 100,
        sleep: noSleep,
        onRetry,
      })
    ).resolves.toBe("client");

    expect(acquire).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ attempt: 1, maxAttempts: 3 })
    );
  });

  it("fails fast on non-transient errors", async () => {
    const fatal = errWithCode("password authentication failed", "28P01");
    const acquire = vi.fn().mockRejectedValue(fatal);

    await expect(
      connectWithRetry(acquire, { retries: 5, baseDelayMs: 100, sleep: noSleep })
    ).rejects.toBe(fatal);

    expect(acquire).toHaveBeenCalledTimes(1);
  });

  it("throws the final error once retries are exhausted", async () => {
    const transient = new Error("timeout exceeded when trying to connect");
    const acquire = vi.fn().mockRejectedValue(transient);

    await expect(
      connectWithRetry(acquire, { retries: 2, baseDelayMs: 100, sleep: noSleep })
    ).rejects.toBe(transient);

    expect(acquire).toHaveBeenCalledTimes(3);
  });

  it("retries: 0 disables retrying entirely", async () => {
    const transient = new Error("timeout exceeded when trying to connect");
    const acquire = vi.fn().mockRejectedValue(transient);

    await expect(
      connectWithRetry(acquire, { retries: 0, baseDelayMs: 100, sleep: noSleep })
    ).rejects.toBe(transient);

    expect(acquire).toHaveBeenCalledTimes(1);
  });

  it("backs off exponentially with jittered delays within bounds", async () => {
    const delays: number[] = [];
    const sleep = (ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    };
    const acquire = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout exceeded when trying to connect"))
      .mockRejectedValueOnce(new Error("timeout exceeded when trying to connect"))
      .mockRejectedValueOnce(new Error("timeout exceeded when trying to connect"))
      .mockResolvedValue("client");

    await connectWithRetry(acquire, {
      retries: 3,
      baseDelayMs: 200,
      maxDelayMs: 350,
      sleep,
    });

    expect(delays).toHaveLength(3);
    // Attempt 1: exp 200, jitter range [100, 200]
    expect(delays[0]).toBeGreaterThanOrEqual(100);
    expect(delays[0]).toBeLessThanOrEqual(200);
    // Attempt 2: exp 400 capped to 350, jitter range [175, 350]
    expect(delays[1]).toBeGreaterThanOrEqual(175);
    expect(delays[1]).toBeLessThanOrEqual(350);
    // Attempt 3: exp 800 capped to 350
    expect(delays[2]).toBeGreaterThanOrEqual(175);
    expect(delays[2]).toBeLessThanOrEqual(350);
  });

  it("honors a custom isRetryable classifier", async () => {
    const weird = new Error("weird transient thing");
    const acquire = vi
      .fn()
      .mockRejectedValueOnce(weird)
      .mockResolvedValue("client");

    await expect(
      connectWithRetry(acquire, {
        retries: 1,
        baseDelayMs: 10,
        sleep: noSleep,
        isRetryable: (e) => e === weird,
      })
    ).resolves.toBe("client");

    expect(acquire).toHaveBeenCalledTimes(2);
  });
});
