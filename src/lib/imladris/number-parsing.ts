const COMPACT_MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  mm: 1_000_000,
  mn: 1_000_000,
  mil: 1_000_000,
  b: 1_000_000_000,
  bn: 1_000_000_000,
  t: 1_000_000_000_000,
  tn: 1_000_000_000_000,
};

const WORD_MULTIPLIERS: Record<string, number> = {
  thousand: 1_000,
  million: 1_000_000,
  billion: 1_000_000_000,
  trillion: 1_000_000_000_000,
};
const SCALE_SUFFIX_PATTERN = "(?:k|m|mm|mn|mil|b|bn|t|tn|thousand|million|billion|trillion)";
const DECIMAL_COMMA_NUMBER_PATTERN = new RegExp(
  `^(?:[-+]?\\d+,\\d{1,2}${SCALE_SUFFIX_PATTERN}?|\\([-+]?\\d+,\\d{1,2}${SCALE_SUFFIX_PATTERN}?\\))$`,
  "i",
);

function normalizeDecimalSeparators(value: string): string {
  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1 && lastComma > lastDot) {
    return value.replace(/\./g, "").replace(/,/g, ".");
  }
  if (
    lastComma !== -1 &&
    lastDot === -1 &&
    DECIMAL_COMMA_NUMBER_PATTERN.test(value)
  ) {
    return value.replace(/,/g, ".");
  }
  return value.replace(/,/g, "");
}

function normalizeTrailingSign(value: string): string {
  const trailingSign = value.match(/^(.+)([+-])$/);
  if (!trailingSign) return value;
  const [, amount, sign] = trailingSign;
  return sign === "-" ? `-${amount}` : amount;
}

function normalizePercentSuffix(value: string): string {
  const normalized = value.trim();
  const parenthesized = normalized.match(/^\((.*)\)$/);
  if (parenthesized) {
    const inner = parenthesized[1].trim();
    const normalizedInner = normalizePercentSuffix(inner);
    return normalizedInner === inner ? normalized : `(${normalizedInner})`;
  }
  return normalized.replace(/\s*(?:%|percent|pct)$/i, "");
}

function normalizeAccountingSignSuffix(value: string): string {
  const match = value.trim().match(/^(.+?)\s+(dr|debit|cr|credit)$/i);
  if (!match) return value;

  const [, amount, direction] = match;
  const normalizedAmount = amount.trim();
  if (/^(?:dr|debit)$/i.test(direction)) {
    return /^[+-]/.test(normalizedAmount) || /^\(.+\)$/.test(normalizedAmount)
      ? normalizedAmount
      : `-${normalizedAmount}`;
  }
  return normalizedAmount.startsWith("+") ? normalizedAmount.slice(1) : normalizedAmount;
}

export function parseImladrisNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;

  const asciiSignedValue = value.trim().replace(/[−‒–—]/g, "-");
  const withoutIsoCurrency = asciiSignedValue
    .replace(/^([+-])\s*[A-Z]{3}(?=\s|\(|\d)/i, "$1")
    .replace(/^(\(?)[A-Z]{3}(?=\s|[+-]|\(|\d)/i, "$1")
    .replace(/\s*\([A-Z]{3}\)$/i, "")
    .replace(/([0-9](?:\s*(?:k|m|mm|mn|mil|b|bn|t|tn))?\)?|\b(?:thousand|million|billion|trillion)\b\)?)\s*(?!mil\b)[A-Z]{3}(\)?)$/i, "$1$2");
  const withoutCurrencySymbols = withoutIsoCurrency.replace(/[$€£¥'’‘]/g, "");
  const withoutDecorativeSuffixes = normalizeAccountingSignSuffix(
    normalizePercentSuffix(withoutCurrencySymbols),
  );
  const withoutCurrency = normalizeDecimalSeparators(
    normalizeTrailingSign(withoutDecorativeSuffixes.replace(/\s/g, "")),
  );
  const normalized = /^\(.+\)$/.test(withoutCurrency)
    ? `-${withoutCurrency.slice(1, -1)}`
    : withoutCurrency;
  const compactMatch = normalized.match(/^([+-]?\d+(?:\.\d+)?)(k|m|mm|mn|mil|b|bn|t|tn)$/i);
  if (compactMatch) {
    const [, amount, suffix] = compactMatch;
    const parsed = Number(amount);
    const multiplier = COMPACT_MULTIPLIERS[suffix.toLowerCase()];
    return Number.isFinite(parsed) && multiplier ? parsed * multiplier : null;
  }
  const wordMatch = normalized.match(/^([+-]?\d+(?:\.\d+)?)(thousand|million|billion|trillion)$/i);
  if (wordMatch) {
    const [, amount, suffix] = wordMatch;
    const parsed = Number(amount);
    const multiplier = WORD_MULTIPLIERS[suffix.toLowerCase()];
    return Number.isFinite(parsed) && multiplier ? parsed * multiplier : null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
