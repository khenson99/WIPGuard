"use client";

interface TrendsToggleProps {
  value: "snapshot" | "trends";
  onChange: (value: "snapshot" | "trends") => void;
}

export function TrendsToggle({ value, onChange }: TrendsToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="View mode"
      className="inline-flex rounded-lg bg-secondary p-1"
    >
      {(["snapshot", "trends"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={value === mode}
          onClick={() => onChange(mode)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            value === mode
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {mode === "snapshot" ? "Snapshot" : "Trends"}
        </button>
      ))}
    </div>
  );
}
