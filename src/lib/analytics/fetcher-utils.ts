/**
 * Safe JSON parsing for analytics fetcher responses.
 *
 * Wraps `response.json()` so that malformed responses (empty body,
 * HTML error pages from gateways, etc.) produce a descriptive error
 * instead of an opaque SyntaxError.
 */
export async function safeJson<T = unknown>(
  response: Response,
  label?: string,
): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.length > 200 ? `${text.slice(0, 200)}…` : text;
    throw new Error(
      `Invalid JSON from ${label ?? response.url}${preview ? `: ${preview}` : ""}`,
    );
  }
}
