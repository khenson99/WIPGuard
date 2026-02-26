"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";
import { CHART_PALETTE } from "./chart-theme";

interface SparkLineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

export function SparkLine({
  data,
  color = CHART_PALETTE[0],
  width = 48,
  height = 24,
}: SparkLineProps) {
  if (data.length < 2) return null;

  const points = data.map((value, index) => ({ index, value }));

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
