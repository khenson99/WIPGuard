import { computeRetryDelayMs } from "@/lib/outbox-worker";

export type IntegrationErrorCode =
  | "auth"
  | "rate_limit"
  | "upstream_5xx"
  | "timeout"
  | "schema"
  | "network"
  | "unknown";

export class IntegrationHttpError extends Error {
  readonly code: IntegrationErrorCode;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(input: {
    message: string;
    code: IntegrationErrorCode;
    status?: number | null;
    retryable?: boolean;
  }) {
    super(input.message);
    this.name = "IntegrationHttpError";
    this.code = input.code;
    this.status = input.status ?? null;
    this.retryable = input.retryable ?? false;
  }
}

export interface IntegrationHttpRequestInput {
  url: string;
  init?: RequestInit;
  timeoutMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

function classifyStatus(status: number): {
  code: IntegrationErrorCode;
  retryable: boolean;
} {
  if (status === 401 || status === 403) {
    return { code: "auth", retryable: false };
  }
  if (status === 429) {
    return { code: "rate_limit", retryable: true };
  }
  if (status >= 500) {
    return { code: "upstream_5xx", retryable: true };
  }
  return { code: "unknown", retryable: false };
}

function parseRetryAfterMs(response: Response): number | null {
  const raw = response.headers.get("retry-after")?.trim();
  if (!raw) return null;

  const asSeconds = Number(raw);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.round(asSeconds * 1000);
  }

  const asDate = Date.parse(raw);
  if (Number.isFinite(asDate)) {
    const waitMs = asDate - Date.now();
    return waitMs > 0 ? waitMs : 0;
  }

  return null;
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function mergeSignals(
  upstream: AbortSignal | null | undefined,
  timeoutMs: number
): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));

  const abortFromUpstream = () => controller.abort();
  if (upstream) {
    if (upstream.aborted) {
      controller.abort();
    } else {
      upstream.addEventListener("abort", abortFromUpstream, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timeout);
      if (upstream) {
        upstream.removeEventListener("abort", abortFromUpstream);
      }
    },
  };
}

export async function fetchWithResilience(
  input: IntegrationHttpRequestInput
): Promise<Response> {
  const maxAttempts = Math.max(1, input.maxAttempts ?? 3);
  const timeoutMs = Math.max(500, input.timeoutMs ?? 10_000);

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const merged = mergeSignals(input.init?.signal, timeoutMs);

    try {
      const response = await fetch(input.url, {
        ...input.init,
        signal: merged.signal,
      });

      if (response.ok) {
        merged.cancel();
        return response;
      }

      const classification = classifyStatus(response.status);
      const body = await response.text().catch(() => "");
      const message =
        body.slice(0, 300) || response.statusText || `HTTP ${response.status}`;

      if (!classification.retryable || attempt === maxAttempts) {
        merged.cancel();
        throw new IntegrationHttpError({
          message,
          code: classification.code,
          status: response.status,
          retryable: classification.retryable,
        });
      }

      const retryAfterMs = parseRetryAfterMs(response);
      const computedBackoff = computeRetryDelayMs(attempt, {
        baseDelayMs: input.baseDelayMs ?? 500,
        maxDelayMs: input.maxDelayMs ?? 10_000,
      });
      merged.cancel();
      await sleep(retryAfterMs ?? computedBackoff);
      continue;
    } catch (error) {
      merged.cancel();

      const currentError =
        error instanceof Error ? error : new Error("Integration request failed");

      if (currentError instanceof IntegrationHttpError) {
        lastError = currentError;
        if (!currentError.retryable || attempt === maxAttempts) {
          throw currentError;
        }
        continue;
      }

      const isAbort = currentError.name === "AbortError";
      const wrapped = new IntegrationHttpError({
        message: currentError.message || (isAbort ? "Request timed out" : "Network error"),
        code: isAbort ? "timeout" : "network",
        retryable: true,
      });
      lastError = wrapped;

      if (attempt === maxAttempts) {
        throw wrapped;
      }

      const waitMs = computeRetryDelayMs(attempt, {
        baseDelayMs: input.baseDelayMs ?? 500,
        maxDelayMs: input.maxDelayMs ?? 10_000,
      });
      await sleep(waitMs);
    }
  }

  throw (
    lastError ??
    new IntegrationHttpError({
      message: "Integration request failed",
      code: "unknown",
      retryable: false,
    })
  );
}

export async function fetchJsonWithResilience<T>(
  input: IntegrationHttpRequestInput
): Promise<T> {
  const response = await fetchWithResilience(input);
  const payload = (await response.json().catch(() => null)) as T | null;
  if (payload === null) {
    throw new IntegrationHttpError({
      message: "Invalid JSON response",
      code: "schema",
      status: response.status,
      retryable: false,
    });
  }
  return payload;
}
