/**
 * Class of Service — lane classification for Kanban tasks.
 *
 * Each task may carry a class-of-service designation that determines
 * scheduling policy, visual styling, and WIP-level constraints.
 *
 * See David Anderson's "Kanban" for the canonical definitions:
 *   standard   — normal FIFO; no special treatment
 *   fixed-date — hard external deadline; must be tracked for breach risk
 *   expedite   — drop-everything lane; limited to ~1 per board at a time
 *   intangible — tech-debt / maintenance; scheduled during slack capacity
 */

import type {
  Calendar,
  Zap,
  Clock,
  Wrench,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ClassOfService =
  | "standard"
  | "fixed-date"
  | "expedite"
  | "intangible";

export const CLASS_OF_SERVICE_VALUES: ClassOfService[] = [
  "standard",
  "fixed-date",
  "expedite",
  "intangible",
];

export interface ServiceClassMeta {
  label: string;
  description: string;
  /** Policy tooltip shown on hover */
  policy: string;
  /** Lucide icon name (resolved at render time) */
  iconName: "Clock" | "Calendar" | "Zap" | "Wrench";
}

export const SERVICE_CLASS_META: Record<ClassOfService, ServiceClassMeta> = {
  standard: {
    label: "Standard",
    description: "Normal priority, FIFO scheduling",
    policy:
      "Pulled in order from the backlog. No special treatment or scheduling override.",
    iconName: "Clock",
  },
  "fixed-date": {
    label: "Fixed Date",
    description: "Hard external deadline",
    policy:
      "Must be completed by its due date. Breach risk is highlighted when the remaining time drops below a configurable threshold.",
    iconName: "Calendar",
  },
  expedite: {
    label: "Expedite",
    description: "Drop everything — emergency lane",
    policy:
      "Limited to at most one active expedite per board at a time. Every active expedite increases flow debt and should be tracked as a process smell.",
    iconName: "Zap",
  },
  intangible: {
    label: "Intangible",
    description: "Tech debt, maintenance, enablers",
    policy:
      "Scheduled during slack capacity. Should represent ~20% of throughput to prevent infrastructure erosion.",
    iconName: "Wrench",
  },
};

// ---------------------------------------------------------------------------
// Styling tokens
// ---------------------------------------------------------------------------

export interface ServiceClassColors {
  /** Tailwind bg class for the badge */
  bg: string;
  /** Tailwind text class for the badge */
  text: string;
  /** Tailwind border class for the badge */
  border: string;
  /** CSS color value for dot/accent */
  dot: string;
}

export function getServiceClassColors(
  cls: ClassOfService
): ServiceClassColors {
  switch (cls) {
    case "standard":
      return {
        bg: "bg-slate-500/10",
        text: "text-slate-600 dark:text-slate-400",
        border: "border-slate-500/20",
        dot: "#64748b",
      };
    case "fixed-date":
      return {
        bg: "bg-blue-500/10",
        text: "text-blue-600 dark:text-blue-400",
        border: "border-blue-500/20",
        dot: "#3b82f6",
      };
    case "expedite":
      return {
        bg: "bg-red-500/15",
        text: "text-red-600 dark:text-red-400",
        border: "border-red-500/25",
        dot: "#ef4444",
      };
    case "intangible":
      return {
        bg: "bg-violet-500/10",
        text: "text-violet-600 dark:text-violet-400",
        border: "border-violet-500/20",
        dot: "#8b5cf6",
      };
  }
}

// ---------------------------------------------------------------------------
// Breach risk calculation
// ---------------------------------------------------------------------------

/** Default threshold in days — items with fewer days remaining are "at risk". */
export const DEFAULT_BREACH_THRESHOLD_DAYS = 3;

export interface BreachRiskResult {
  /** Whether the item is at risk of breaching its due date */
  atRisk: boolean;
  /** Days remaining (negative = overdue) */
  daysRemaining: number;
  /** Human-readable label */
  label: string;
}

/**
 * Check whether a fixed-date item is at risk of breaching its due date.
 *
 * Only meaningful when `classOfService === "fixed-date"` and `dueDate` is set.
 * Returns `null` for non-fixed-date items or when no due date exists.
 */
export function isDateBreachRisk(
  dueDate: string | Date | null | undefined,
  classOfService: ClassOfService,
  options?: {
    now?: Date;
    thresholdDays?: number;
  }
): BreachRiskResult | null {
  if (classOfService !== "fixed-date") return null;
  if (!dueDate) return null;

  const now = options?.now ?? new Date();
  const threshold = options?.thresholdDays ?? DEFAULT_BREACH_THRESHOLD_DAYS;

  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const diffMs = due.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysRemaining < 0) {
    return {
      atRisk: true,
      daysRemaining,
      label: `${Math.abs(daysRemaining)}d overdue`,
    };
  }

  if (daysRemaining === 0) {
    return {
      atRisk: true,
      daysRemaining: 0,
      label: "Due today",
    };
  }

  return {
    atRisk: daysRemaining <= threshold,
    daysRemaining,
    label: `${daysRemaining}d remaining`,
  };
}

// ---------------------------------------------------------------------------
// Expedite debt calculation
// ---------------------------------------------------------------------------

export interface ExpediteDebtResult {
  /** Total task count */
  totalTasks: number;
  /** Number of expedite tasks */
  expediteCount: number;
  /** Percentage of tasks that are expedite (0-100) */
  expeditePercent: number;
  /** Whether the percentage exceeds the healthy threshold */
  isOverThreshold: boolean;
  /** Human-readable label */
  label: string;
}

/** Healthy expedite threshold — anything above this is "debt". */
export const DEFAULT_EXPEDITE_THRESHOLD_PERCENT = 10;

/**
 * Calculate the expedite "debt" for a set of tasks.
 *
 * In Kanban practice, expedite items should be rare exceptions —
 * typically <10% of active WIP. When the percentage exceeds the
 * threshold, it indicates a process problem.
 *
 * Accepts a `getClassOfService` accessor to remain decoupled from
 * any particular data shape.
 */
export function calculateExpediteDebt<T>(
  tasks: T[],
  getClassOfService: (task: T) => ClassOfService | undefined | null,
  options?: { thresholdPercent?: number }
): ExpediteDebtResult {
  const threshold =
    options?.thresholdPercent ?? DEFAULT_EXPEDITE_THRESHOLD_PERCENT;

  const totalTasks = tasks.length;
  if (totalTasks === 0) {
    return {
      totalTasks: 0,
      expediteCount: 0,
      expeditePercent: 0,
      isOverThreshold: false,
      label: "No tasks",
    };
  }

  const expediteCount = tasks.filter(
    (t) => getClassOfService(t) === "expedite"
  ).length;
  const expeditePercent = Math.round((expediteCount / totalTasks) * 100);
  const isOverThreshold = expeditePercent > threshold;

  return {
    totalTasks,
    expediteCount,
    expeditePercent,
    isOverThreshold,
    label: `${expeditePercent}% expedite (${expediteCount}/${totalTasks})`,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a class-of-service string, returning "standard" as the default
 * when the value is missing or unrecognized.
 */
export function parseClassOfService(
  value: string | null | undefined
): ClassOfService {
  if (!value) return "standard";
  const normalized = value.toLowerCase().trim();
  if (
    normalized === "standard" ||
    normalized === "fixed-date" ||
    normalized === "expedite" ||
    normalized === "intangible"
  ) {
    return normalized as ClassOfService;
  }
  return "standard";
}
