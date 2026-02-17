"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import { CustomTooltip } from "./custom-tooltip";
import { CHART_DEFAULTS } from "./chart-theme";

interface FunnelStage {
  label: string;
  value: number;
  color: string;
  extra?: Record<string, string | number>;
}

interface HorizontalFunnelProps {
  stages: FunnelStage[];
  height?: number;
  valueFormatter?: (value: number) => string;
}

export function HorizontalFunnel({
  stages,
  height = 320,
  valueFormatter,
}: HorizontalFunnelProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={stages} layout="vertical" barCategoryGap="20%">
        <XAxis
          type="number"
          tickFormatter={valueFormatter}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          dataKey="label"
          type="category"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          width={140}
        />
        <Tooltip
          content={
            <CustomTooltip
              valueFormatter={valueFormatter ? (v) => valueFormatter(v as number) : undefined}
            />
          }
        />
        <Bar
          dataKey="value"
          radius={[0, 4, 4, 0]}
          animationDuration={CHART_DEFAULTS.animationDuration}
        >
          {stages.map((stage, idx) => (
            <Cell key={idx} fill={stage.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
