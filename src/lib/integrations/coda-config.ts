/**
 * Normalize a Coda document ID to its canonical form.
 * Strips URL prefixes and whitespace so that stored IDs are consistent.
 */
export function normalizeCodaDocId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // If the user pasted a full Coda URL, extract the doc ID segment.
  const urlMatch = trimmed.match(/coda\.io\/d\/[^/]+\/_d([A-Za-z0-9_-]+)/);
  if (urlMatch) return urlMatch[1];

  // Already a bare ID — return as-is.
  return trimmed;
}
