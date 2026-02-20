"use client";

interface TooltipPayloadEntry {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
  labelFormatter?: (label: string) => string;
  valueFormatter?: (value: number, name: string) => string;
}

export function CustomTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
}: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
      {label != null && (
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          {labelFormatter ? labelFormatter(String(label)) : String(label)}
        </p>
      )}
      {payload.map((entry: TooltipPayloadEntry, i: number) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-semibold tabular-nums text-foreground">
            {valueFormatter
              ? valueFormatter(entry.value as number, entry.name ?? "")
              : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}
