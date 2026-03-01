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

export function endDateForPeriod(startDate: string, period: BudgetPeriod): string {
  const parsed = parseDateInput(startDate);
  if (!parsed) return "";

  const months = period === "MONTHLY" ? 1 : period === "QUARTERLY" ? 3 : 12;
  const nextPeriodStart = addMonthsClampedUtc(parsed, months);
  const end = new Date(nextPeriodStart);
  end.setUTCDate(end.getUTCDate() - 1);
  return formatDateInput(end);
}

export function defaultDateRange(period: BudgetPeriod): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startDate = formatDateInput(start);
  return { start: startDate, end: endDateForPeriod(startDate, period) };
}
