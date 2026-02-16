"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CustomTooltip } from "./custom-tooltip";
import { CHART_DEFAULTS, CHART_PALETTE } from "./chart-theme";

interface AreaTrendProps {
  data: Array<Record<string, unknown>>;
  xKey: string;
  yKeys: string[];
  colors?: string[];
  height?: number;
  yFormatter?: (value: number) => string;
  xFormatter?: (value: string) => string;
  stacked?: boolean;
  showGrid?: boolean;
}

export function AreaTrend({
  data,
  xKey,
  yKeys,
  colors,
  height = 280,
  yFormatter,
  xFormatter,
  stacked = false,
  showGrid = true,
}: AreaTrendProps) {
  const palette = colors ?? CHART_PALETTE;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        {showGrid && (
          <CartesianGrid
            strokeDasharray={CHART_DEFAULTS.gridStrokeDasharray}
            stroke="hsl(var(--border))"
            strokeOpacity={0.5}
          />
        )}
        <XAxis
          dataKey={xKey}
          tickFormatter={xFormatter}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={yFormatter}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          width={50}
        />
        <Tooltip
          content={
            <CustomTooltip
              valueFormatter={yFormatter ? (v) => yFormatter(v as number) : undefined}
              labelFormatter={xFormatter}
            />
          }
        />
        {yKeys.map((key, i) => (
          <Area
            key={key}
            type="monotone"
            dataKey={key}
            stackId={stacked ? "stack" : undefined}
            stroke={palette[i % palette.length]}
            fill={palette[i % palette.length]}
            fillOpacity={0.15}
            strokeWidth={CHART_DEFAULTS.strokeWidth}
            dot={false}
            activeDot={{ r: CHART_DEFAULTS.activeDotRadius }}
            animationDuration={CHART_DEFAULTS.animationDuration}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
