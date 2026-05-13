export type BudgetPeriod = "MONTHLY" | "QUARTERLY" | "ANNUAL";

export function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseDateInput(value: string): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function daysInMonthUtc(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function addMonthsClampedUtc(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  const totalMonths = month + months;
  const targetYear = year + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const targetDay = Math.min(day, daysInMonthUtc(targetYear, targetMonth));

  return new Date(Date.UTC(targetYear, targetMonth, targetDay));
}

function monthsForPeriod(period: BudgetPeriod): number {
  return period === "MONTHLY" ? 1 : period === "QUARTERLY" ? 3 : 12;
}

export function exclusiveEndDateForPeriod(startDate: string, period: BudgetPeriod): string {
  const parsed = parseDateInput(startDate);
  if (!parsed) return "";
  return formatDateInput(addMonthsClampedUtc(parsed, monthsForPeriod(period)));
}

export function endDateForPeriod(startDate: string, period: BudgetPeriod): string {
  const parsed = parseDateInput(startDate);
  if (!parsed) return "";

  const nextPeriodStart = addMonthsClampedUtc(parsed, monthsForPeriod(period));
  const end = new Date(nextPeriodStart);
  end.setUTCDate(end.getUTCDate() - 1);
  return formatDateInput(end);
}

export function normalizeStoredBudgetEndDate(
  startDateIso: string,
  endDateIso: string,
  period: BudgetPeriod,
): string {
  const startDate = startDateIso.slice(0, 10);
  const endDate = new Date(endDateIso);
  if (Number.isNaN(endDate.getTime())) return endDateIso;

  const isMidnightUtc =
    endDate.getUTCHours() === 0 &&
    endDate.getUTCMinutes() === 0 &&
    endDate.getUTCSeconds() === 0 &&
    endDate.getUTCMilliseconds() === 0;
  if (!isMidnightUtc) return endDateIso;

  const legacyExclusiveEnd = exclusiveEndDateForPeriod(startDate, period);
  if (!legacyExclusiveEnd) return endDateIso;
  if (endDateIso.slice(0, 10) !== legacyExclusiveEnd) return endDateIso;

  return `${endDateForPeriod(startDate, period)}T00:00:00.000Z`;
}

export function defaultDateRange(period: BudgetPeriod): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startDate = formatDateInput(start);
  return { start: startDate, end: endDateForPeriod(startDate, period) };
}
