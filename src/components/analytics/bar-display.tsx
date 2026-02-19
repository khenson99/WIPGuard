// Simple horizontal bar chart using Tailwind (no chart library needed)

interface BarItem {
  label: string;
  value: number;
  color?: string;
}

interface BarDisplayProps {
  items: BarItem[];
  formatValue?: (v: number) => string;
  maxValue?: number;
  gradient?: boolean;
}

export function BarDisplay({ items, formatValue, maxValue, gradient = false }: BarDisplayProps) {
  const max = maxValue || Math.max(...items.map((i) => i.value), 1);
  const fmt = formatValue || ((v: number) => v.toLocaleString());

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-foreground">{item.label}</span>
            <span className="tabular-nums font-medium text-foreground">
              {fmt(item.value)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min((item.value / max) * 100, 100)}%`,
                background: gradient
                  ? `linear-gradient(90deg, ${item.color || "var(--primary)"} 0%, color-mix(in srgb, ${item.color || "var(--primary)"} 70%, white) 100%)`
                  : (item.color || "var(--primary)"),
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// Donut-like ring display
interface RingStatProps {
  value?: number;
  max?: number;
  segments?: Array<{ label: string; value: number; color: string }>;
  total?: number;
  label: string;
  color?: string;
  size?: number;
}

export function RingStat({
  value,
  max,
  segments,
  total,
  label,
  color = "var(--primary)",
  size = 120,
}: RingStatProps) {
  const hasSegments = Array.isArray(segments) && segments.length > 0;
  const effectiveTotal = total ?? (hasSegments ? segments.reduce((sum, segment) => sum + segment.value, 0) : max ?? 0);
  const normalizedValue = value ?? 0;
  const normalizedMax = max ?? 0;
  const pct = !hasSegments && normalizedMax > 0 ? Math.min((normalizedValue / normalizedMax) * 100, 100) : 0;
  const circumference = 2 * Math.PI * 42;
  const strokeDashoffset = circumference - (pct / 100) * circumference;
  let consumed = 0;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle
          cx="50" cy="50" r="42"
          fill="none"
          stroke="var(--border)"
          strokeWidth="8"
        />
        {!hasSegments && (
          <circle
            cx="50" cy="50" r="42"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform="rotate(-90 50 50)"
            className="transition-all duration-700"
          />
        )}
        {hasSegments && segments.map((segment) => {
          const safeTotal = effectiveTotal > 0 ? effectiveTotal : 1;
          const segmentLength = (segment.value / safeTotal) * circumference;
          const dashOffset = circumference - consumed;
          consumed += segmentLength;

          return (
            <circle
              key={segment.label}
              cx="50" cy="50" r="42"
              fill="none"
              stroke={segment.color}
              strokeWidth="8"
              strokeLinecap="butt"
              strokeDasharray={`${segmentLength} ${circumference}`}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 50 50)"
              className="transition-all duration-700"
            />
          );
        })}
        <text
          x="50" y="46"
          textAnchor="middle"
          className="fill-foreground text-lg font-bold"
          fontSize="18"
          fontWeight="700"
        >
          {hasSegments ? `${effectiveTotal}` : `${pct.toFixed(0)}%`}
        </text>
        <text
          x="50" y="62"
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize="9"
        >
          {label}
        </text>
      </svg>
    </div>
  );
}
