export type SprintLike = {
  name?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

function parseIsoDate(value: string): Date | null {
  const trimmed = value.trim();
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const parsed = new Date(isDateOnly ? `${trimmed}T00:00:00Z` : trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function formatSprintDay(
  dateValue: string | null | undefined,
  options?: { includeYear?: boolean }
): string | null {
  if (!dateValue) return null;
  const parsed = parseIsoDate(dateValue);
  if (!parsed) return null;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(options?.includeYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

export function formatSprintRangeLabel(
  sprint: { startDate?: string | null; endDate?: string | null },
  options?: { includeYear?: boolean }
): string | null {
  const startLabel = formatSprintDay(sprint.startDate, options);
  const endLabel = formatSprintDay(sprint.endDate, options);
  if (!startLabel || !endLabel) return null;
  return `${startLabel} – ${endLabel}`;
}

export function getSprintLabel(
  sprint: SprintLike,
  options?: { includeYear?: boolean }
): string {
  return (
    formatSprintRangeLabel(sprint, options) ||
    sprint.name ||
    "Unnamed sprint"
  );
}

