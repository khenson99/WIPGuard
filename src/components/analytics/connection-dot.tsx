// src/components/analytics/connection-dot.tsx
"use client";

interface ConnectionDotProps {
  status: "connected" | "stale" | "disconnected";
  provider?: string;
  lastSync?: string;
  size?: "sm" | "md";
}

const STATUS_STYLES = {
  connected: "bg-emerald-500",
  stale: "bg-amber-500",
  disconnected: "bg-red-500",
} as const;

const STATUS_LABELS = {
  connected: "Connected",
  stale: "Stale",
  disconnected: "Disconnected",
} as const;

export function ConnectionDot({
  status,
  provider,
  lastSync,
  size = "sm",
}: ConnectionDotProps) {
  const dotSize = size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2";

  return (
    <span
      className={`inline-block rounded-full ${dotSize} ${STATUS_STYLES[status]}`}
      title={
        provider
          ? `${provider}: ${STATUS_LABELS[status]}${lastSync ? ` — ${lastSync}` : ""}`
          : STATUS_LABELS[status]
      }
    />
  );
}
