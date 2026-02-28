export interface DailyCountPoint {
  date: string; // YYYY-MM-DD (UTC)
  count: number;
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

export function buildDailyCountSeriesUtc({
  now,
  days,
  timestamps,
}: {
  now: Date;
  days: number;
  timestamps: Date[];
}): DailyCountPoint[] {
  const safeDays = Number.isFinite(days) ? Math.max(1, Math.floor(days)) : 14;
  const todayUtc = startOfUtcDay(now);
  const startUtc = addUtcDays(todayUtc, -(safeDays - 1));
  const endExclusiveUtc = addUtcDays(todayUtc, 1);

  const countsByDate = new Map<string, number>();
  for (const ts of timestamps) {
    if (!(ts instanceof Date) || Number.isNaN(ts.getTime())) continue;
    if (ts < startUtc || ts >= endExclusiveUtc) continue;
    const key = ts.toISOString().slice(0, 10);
    countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
  }

  const series: DailyCountPoint[] = [];
  for (let i = 0; i < safeDays; i += 1) {
    const day = addUtcDays(startUtc, i);
    const key = day.toISOString().slice(0, 10);
    series.push({ date: key, count: countsByDate.get(key) ?? 0 });
  }
  return series;
}

