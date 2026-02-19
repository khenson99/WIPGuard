"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { CustomTooltip } from "./custom-tooltip";
import { CHART_DEFAULTS, CHART_PALETTE } from "./chart-theme";

interface StackedBarChartProps {
  data: Array<Record<string, unknown>>;
  xKey: string;
  barKeys: string[];
  colors?: string[];
  height?: number;
  yFormatter?: (value: number) => string;
  stacked?: boolean;
  layout?: "horizontal" | "vertical";
  showLegend?: boolean;
}

export function StackedBarChart({
  data,
  xKey,
  barKeys,
  colors,
  height = 280,
  yFormatter,
  stacked = true,
  layout = "horizontal",
  showLegend = true,
}: StackedBarChartProps) {
  const palette = colors ?? CHART_PALETTE;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout === "vertical" ? "vertical" : "horizontal"}>
        <CartesianGrid
          strokeDasharray={CHART_DEFAULTS.gridStrokeDasharray}
          stroke="hsl(var(--border))"
          strokeOpacity={0.5}
        />
        {layout === "vertical" ? (
          <>
            <XAxis
              type="number"
              tickFormatter={yFormatter}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              dataKey={xKey}
              type="category"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              width={120}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey={xKey}
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
          </>
        )}
        <Tooltip
          content={
            <CustomTooltip
              valueFormatter={yFormatter ? (v) => yFormatter(v as number) : undefined}
            />
          }
        />
        {showLegend && (
          <Legend
            wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}
          />
        )}
        {barKeys.map((key, i) => (
          <Bar
            key={key}
            dataKey={key}
            stackId={stacked ? "stack" : undefined}
            fill={palette[i % palette.length]}
            radius={stacked ? undefined : [4, 4, 0, 0]}
            animationDuration={CHART_DEFAULTS.animationDuration}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
