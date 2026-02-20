import pThrottle from "p-throttle";

const FETCH_TIMEOUT_MS = 15_000;

/**
 * Throttled fetch: 1 request every 2 seconds (polite scraping).
 * Uses p-throttle to enforce rate limits across concurrent callers.
 * Includes a 15-second timeout per request via AbortController.
 */
const throttle = pThrottle({ limit: 1, interval: 2000 });

export const throttledFetch = throttle(
  async (url: string, init?: RequestInit): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          "User-Agent": "WIPGuard-Prospecting/1.0 (+https://wipguard.com)",
          ...init?.headers,
        },
      });
    } finally {
      clearTimeout(timer);
    }
  }
);
