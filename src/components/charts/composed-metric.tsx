"use client";

import {
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { CustomTooltip } from "./custom-tooltip";
import { CHART_DEFAULTS, CHART_PALETTE } from "./chart-theme";

interface SeriesConfig {
  key: string;
  type: "bar" | "line" | "area";
  color?: string;
  yAxisId?: "left" | "right";
  name?: string;
}

interface ComposedMetricProps {
  data: Array<Record<string, unknown>>;
  xKey: string;
  series: SeriesConfig[];
  height?: number;
  yLeftFormatter?: (value: number) => string;
  yRightFormatter?: (value: number) => string;
  showLegend?: boolean;
}

export function ComposedMetric({
  data,
  xKey,
  series,
  height = 280,
  yLeftFormatter,
  yRightFormatter,
  showLegend = true,
}: ComposedMetricProps) {
  const hasRight = series.some((s) => s.yAxisId === "right");

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data}>
        <CartesianGrid
          strokeDasharray={CHART_DEFAULTS.gridStrokeDasharray}
          stroke="hsl(var(--border))"
          strokeOpacity={0.5}
        />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          yAxisId="left"
          tickFormatter={yLeftFormatter}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          width={50}
        />
        {hasRight && (
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={yRightFormatter}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
            width={50}
          />
        )}
        <Tooltip content={<CustomTooltip />} />
        {showLegend && (
          <Legend wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }} />
        )}
        {series.map((s, i) => {
          const color = s.color ?? CHART_PALETTE[i % CHART_PALETTE.length];
          const yAxisId = s.yAxisId ?? "left";
          const name = s.name ?? s.key;

          if (s.type === "bar") {
            return (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={name}
                yAxisId={yAxisId}
                fill={color}
                radius={[4, 4, 0, 0]}
                animationDuration={CHART_DEFAULTS.animationDuration}
              />
            );
          }
          if (s.type === "area") {
            return (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={name}
                yAxisId={yAxisId}
                stroke={color}
                fill={color}
                fillOpacity={0.15}
                strokeWidth={CHART_DEFAULTS.strokeWidth}
                dot={false}
                animationDuration={CHART_DEFAULTS.animationDuration}
              />
            );
          }
          return (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={name}
              yAxisId={yAxisId}
              stroke={color}
              strokeWidth={CHART_DEFAULTS.strokeWidth}
              dot={false}
              activeDot={{ r: CHART_DEFAULTS.activeDotRadius }}
              animationDuration={CHART_DEFAULTS.animationDuration}
            />
          );
        })}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
