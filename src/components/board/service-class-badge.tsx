"use client";

import { Clock, Calendar, Zap, Wrench } from "lucide-react";
import { clsx } from "clsx";
import {
  type ClassOfService,
  SERVICE_CLASS_META,
  getServiceClassColors,
  isDateBreachRisk,
  type ExpediteDebtResult,
} from "@/lib/class-of-service";

// ---------------------------------------------------------------------------
// Icon resolver
// ---------------------------------------------------------------------------

const ICON_MAP = {
  Clock,
  Calendar,
  Zap,
  Wrench,
} as const;

function ServiceClassIcon({
  cls,
  className,
}: {
  cls: ClassOfService;
  className?: string;
}) {
  const meta = SERVICE_CLASS_META[cls];
  const Icon = ICON_MAP[meta.iconName];
  return <Icon className={className} />;
}

// ---------------------------------------------------------------------------
// ServiceClassBadge
// ---------------------------------------------------------------------------

interface ServiceClassBadgeProps {
  classOfService: ClassOfService;
  /** Due date (ISO string or Date) — only relevant for fixed-date items */
  dueDate?: string | Date | null;
  /** Expedite debt summary — shown as a secondary indicator on expedite items */
  expediteDebt?: ExpediteDebtResult | null;
  /** Override the current time for testing / SSR */
  now?: Date;
  /** Compact mode hides the label text */
  compact?: boolean;
}

/**
 * Color-coded pill badge for class-of-service designation.
 *
 * Renders:
 * - Icon + label for the service class
 * - Fixed-date: days remaining, turns red when at risk
 * - Expedite: debt indicator (% of WIP used by expedites)
 */
export function ServiceClassBadge({
  classOfService,
  dueDate,
  expediteDebt,
  now,
  compact = false,
}: ServiceClassBadgeProps) {
  const meta = SERVICE_CLASS_META[classOfService];
  const colors = getServiceClassColors(classOfService);
  const breachRisk = isDateBreachRisk(dueDate, classOfService, { now });

  // When a fixed-date item is at risk, override to red styling
  const isBreaching = breachRisk?.atRisk ?? false;

  const badgeBg = isBreaching ? "bg-red-500/15" : colors.bg;
  const badgeText = isBreaching
    ? "text-red-600 dark:text-red-400"
    : colors.text;
  const badgeBorder = isBreaching ? "border-red-500/25" : colors.border;

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none",
        badgeBg,
        badgeText,
        badgeBorder
      )}
      title={`${meta.label}: ${meta.policy}`}
      role="status"
      aria-label={buildAriaLabel(classOfService, breachRisk, expediteDebt)}
    >
      <ServiceClassIcon cls={classOfService} className="h-2.5 w-2.5" />

      {!compact && <span>{meta.label}</span>}

      {/* Fixed-date: show days remaining */}
      {breachRisk && (
        <span
          className={clsx(
            "ml-0.5 tabular-nums",
            isBreaching && "font-semibold"
          )}
        >
          {breachRisk.label}
        </span>
      )}

      {/* Expedite: show debt percentage */}
      {classOfService === "expedite" && expediteDebt && (
        <span
          className={clsx(
            "ml-0.5 tabular-nums",
            expediteDebt.isOverThreshold && "font-semibold"
          )}
          title={`Expedite debt: ${expediteDebt.label}`}
        >
          {expediteDebt.expeditePercent}% debt
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAriaLabel(
  cls: ClassOfService,
  breachRisk: ReturnType<typeof isDateBreachRisk>,
  expediteDebt?: ExpediteDebtResult | null
): string {
  const meta = SERVICE_CLASS_META[cls];
  const parts = [`Class of service: ${meta.label}`];

  if (breachRisk) {
    parts.push(breachRisk.atRisk ? `At risk: ${breachRisk.label}` : breachRisk.label);
  }

  if (cls === "expedite" && expediteDebt) {
    parts.push(`Expedite debt: ${expediteDebt.label}`);
  }

  return parts.join(". ");
}
