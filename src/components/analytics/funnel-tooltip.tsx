"use client";

interface FunnelTooltipProps {
  id: string;
  content: string;
  visible: boolean;
  className?: string;
}

export function FunnelTooltip({ id, content, visible, className }: FunnelTooltipProps) {
  if (!visible) return null;

  return (
    <div
      id={id}
      role="tooltip"
      className={`absolute z-50 whitespace-nowrap rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg pointer-events-none motion-safe:animate-tooltip-fade-in dark:bg-gray-700 ${className ?? ""}`}
    >
      {content}
      <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-gray-900 dark:bg-gray-700" />
    </div>
  );
}
