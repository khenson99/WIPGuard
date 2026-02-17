"use client";

import { useMemo, useState, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Calendar } from "lucide-react";

const PRESETS = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "180d", label: "6m" },
  { value: "365d", label: "12m" },
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
  const [isCustomOpen, setIsCustomOpen] = useState(initial.range === "custom");

  const navigate = useCallback(
    (newRange: string, newFrom?: string, newTo?: string) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("range", newRange);
      params.set("from", newFrom || from);
      params.set("to", newTo || to);
      router.replace(`${pathname || "/analytics"}?${params.toString()}`);
    },
    [searchParams, pathname, router, from, to],
  );

  const handlePresetClick = (preset: string) => {
    setRange(preset);
    if (preset === "custom") {
      setIsCustomOpen(true);
      return; // Don't navigate yet — wait for Apply
    }
    setIsCustomOpen(false);
    navigate(preset);
  };

  const applyCustom = () => {
    navigate("custom", from, to);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Preset pills */}
      <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
        {PRESETS.map((preset) => {
          const isActive = range === preset.value;
          return (
            <button
              key={preset.value}
              onClick={() => handlePresetClick(preset.value)}
              className={`relative rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {preset.value === "custom" && (
                <Calendar className="mr-1 inline-block h-3 w-3" />
              )}
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Custom date range — slides in */}
      {isCustomOpen && (
        <div className="flex items-center gap-2 animate-analytics-in">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
          />
          <button
            onClick={applyCustom}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
