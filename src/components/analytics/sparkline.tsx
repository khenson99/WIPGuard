"use client";

interface SparklineProps {
  data: number[];
  forecast?: number[];
  width?: number;
  height?: number;
  anomalyIndices?: number[];
  className?: string;
}

function toPoints(values: number[], w: number, h: number, yMin: number, yMax: number): string {
  const range = yMax - yMin || 1;
  const step = w / Math.max(values.length - 1, 1);
  return values.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - yMin) / range) * h).toFixed(1)}`).join(" ");
}

export function Sparkline({
  data,
  forecast,
  width = 120,
  height = 32,
  anomalyIndices = [],
  className = "",
}: SparklineProps) {
  if (data.length < 2) return null;

  const all = [...data, ...(forecast ?? [])];
  const yMin = Math.min(...all);
  const yMax = Math.max(...all);
  const range = yMax - yMin || 1;

  const historyPts = toPoints(data, width, height, yMin, yMax);

  // Forecast line starts from last data point
  let forecastPts = "";
  if (forecast && forecast.length > 0) {
    const combined = [data[data.length - 1], ...forecast];
    const step = width / Math.max(data.length + forecast.length - 2, 1);
    const startIdx = data.length - 1;
    forecastPts = combined
      .map((v, i) => {
        const x = (startIdx + i) * step;
        const y = height - ((v - yMin) / range) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  const step = width / Math.max(data.length - 1, 1);
  const anomalyDots = anomalyIndices
    .filter((idx) => idx >= 0 && idx < data.length)
    .map((idx) => ({
      cx: idx * step,
      cy: height - ((data[idx] - yMin) / range) * height,
    }));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      preserveAspectRatio="none"
    >
      {/* History line */}
      <polyline
        points={historyPts}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        className="text-primary"
      />

      {/* Forecast dashed line */}
      {forecastPts && (
        <polyline
          points={forecastPts}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="3,2"
          strokeLinejoin="round"
          className="text-muted-foreground"
        />
      )}

      {/* Anomaly dots */}
      {anomalyDots.map((dot, i) => (
        <circle key={i} cx={dot.cx} cy={dot.cy} r="2.5" className="fill-red-500" />
      ))}
    </svg>
  );
}
