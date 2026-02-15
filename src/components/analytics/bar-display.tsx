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
}

export function BarDisplay({ items, formatValue, maxValue }: BarDisplayProps) {
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
                backgroundColor: item.color || "var(--primary)",
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
  value: number;
  max: number;
  label: string;
  color?: string;
  size?: number;
}

export function RingStat({
  value,
  max,
  label,
  color = "var(--primary)",
  size = 120,
}: RingStatProps) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const circumference = 2 * Math.PI * 42;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle
          cx="50" cy="50" r="42"
          fill="none"
          stroke="var(--border)"
          strokeWidth="8"
        />
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
        <text
          x="50" y="46"
          textAnchor="middle"
          className="fill-foreground text-lg font-bold"
          fontSize="18"
          fontWeight="700"
        >
          {pct.toFixed(0)}%
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
