"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { CustomTooltip } from "./custom-tooltip";
import { CHART_DEFAULTS, CHART_PALETTE } from "./chart-theme";

interface DonutSegment {
  name: string;
  value: number;
  color?: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  innerRadius?: number;
  centerLabel?: string;
  centerValue?: string;
  valueFormatter?: (value: number) => string;
}

export function DonutChart({
  segments,
  size = 180,
  innerRadius = 55,
  centerLabel,
  centerValue,
  valueFormatter,
}: DonutChartProps) {
  const outerRadius = size / 2 - 10;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={segments}
            dataKey="value"
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            animationDuration={CHART_DEFAULTS.animationDuration}
          >
            {segments.map((seg, i) => (
              <Cell key={i} fill={seg.color ?? CHART_PALETTE[i % CHART_PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip
            content={
              <CustomTooltip
                valueFormatter={valueFormatter ? (v) => valueFormatter(v as number) : undefined}
              />
            }
          />
        </PieChart>
      </ResponsiveContainer>
      {(centerLabel || centerValue) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerValue && (
            <span className="text-lg font-bold tabular-nums text-foreground">{centerValue}</span>
          )}
          {centerLabel && (
            <span className="text-[10px] text-muted-foreground">{centerLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
