const CODA_DOC_ID_REGEX = /^d[a-zA-Z0-9_-]{5,}$/;

function asTrimmed(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function normalizeCodaDocId(value: string | null | undefined): string | null {
  const trimmed = asTrimmed(value);
  if (!trimmed) return null;
  return CODA_DOC_ID_REGEX.test(trimmed) ? trimmed : null;
}

export function extractCodaDocIdFromUrl(urlLike: string): string | null {
  const raw = asTrimmed(urlLike);
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (!parsed.hostname.endsWith("coda.io")) {
    return null;
  }

  const docIdFromQuery = normalizeCodaDocId(parsed.searchParams.get("docId"));
  if (docIdFromQuery) {
    return docIdFromQuery;
  }

  const segments = parsed.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));

  if (segments.length === 0) {
    return null;
  }

  if ((segments[0] === "d" || segments[0] === "docs") && segments.length > 1) {
    const direct = normalizeCodaDocId(segments[1]);
    if (direct) {
      return direct;
    }
  }

  for (const segment of segments) {
    const underscoreSplit = segment.split("_");
    const candidate = normalizeCodaDocId(underscoreSplit[underscoreSplit.length - 1] ?? null);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

export function resolveCodaDocId(input: {
  docId?: string | null;
  docUrl?: string | null;
}): string | null {
  const hasDocIdInput = asTrimmed(input.docId) !== null;
  const hasDocUrlInput = asTrimmed(input.docUrl) !== null;

  const parsedDocId = normalizeCodaDocId(input.docId);
  const parsedDocIdFromUrl = input.docUrl
    ? extractCodaDocIdFromUrl(input.docUrl)
    : null;

  if (hasDocIdInput && !parsedDocId) {
    throw new Error("Invalid Coda doc ID");
  }

  if (hasDocUrlInput && !parsedDocIdFromUrl) {
    throw new Error("Invalid Coda doc URL");
  }

  if (
    parsedDocId &&
    parsedDocIdFromUrl &&
    parsedDocId !== parsedDocIdFromUrl
  ) {
    throw new Error("Coda doc ID and doc URL do not match");
  }

  return parsedDocId ?? parsedDocIdFromUrl ?? null;
}
