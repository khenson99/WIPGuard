"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const PRESETS = [
  { value: "7d", label: "Last 7d" },
  { value: "30d", label: "Last 30d" },
  { value: "90d", label: "Last 90d" },
  { value: "180d", label: "Last 180d" },
  { value: "365d", label: "Last 12m" },
  { value: "custom", label: "Custom" },
] as const;

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function AnalyticsTimeRangeControls() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initial = useMemo(() => {
    const now = new Date();
    const fallbackFrom = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
    return {
      range: searchParams?.get("range") || "30d",
      from: searchParams?.get("from") || formatDateInput(fallbackFrom),
      to: searchParams?.get("to") || formatDateInput(now),
    };
  }, [searchParams]);

  const [range, setRange] = useState(initial.range);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  const apply = () => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("range", range);
    params.set("from", from);
    params.set("to", to);
    router.replace(`${pathname || "/analytics"}?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={range}
        onChange={(event) => setRange(event.target.value)}
        className="rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground"
      >
        {PRESETS.map((preset) => (
          <option key={preset.value} value={preset.value}>
            {preset.label}
          </option>
        ))}
      </select>

      {range === "custom" && (
        <>
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground"
          />
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground"
          />
        </>
      )}

      <button
        onClick={apply}
        className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        Apply
      </button>
    </div>
  );
}

