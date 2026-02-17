/**
 * Normalize a Coda document ID to its canonical form.
 * Strips URL prefixes and whitespace so that stored IDs are consistent.
 */
export function normalizeCodaDocId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Already a bare ID.
  if (/^d[A-Za-z0-9_-]{5,}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname.endsWith("coda.io")) {
      return trimmed;
    }

    // Support URLs with ?docId=dXXXX.
    const queryDocId = parsed.searchParams.get("docId")?.trim() ?? "";
    if (/^d[A-Za-z0-9_-]{5,}$/.test(queryDocId)) {
      return queryDocId;
    }

    // Support common share URLs such as:
    // - /d/Doc-Name_dXXXX
    // - /d/_dXXXX
    const segments = parsed.pathname
      .split("/")
      .map((segment) => decodeURIComponent(segment).trim())
      .filter(Boolean);

    for (const segment of segments) {
      const fromSuffix = segment.match(/(?:^|_)(d[A-Za-z0-9_-]{5,})$/);
      if (fromSuffix) {
        return fromSuffix[1];
      }
    }
  } catch {
    // Fall through to legacy behavior below.
  }

  // Preserve existing fallback behavior for unknown formats.
  return trimmed;
}
