/**
 * Shared types for the Whip View (scope creep and WIP pressure dashboard).
 */

import type { PlannedVsUnplannedResult, DailyDelta } from "@/lib/sprint-ledger";
import type {
  PersonWipPressure,
  FlowRiskRecommendation,
  FixedDateRiskAlert,
  FlowRiskIntelligenceReport,
} from "@/lib/flow/risk-intelligence";

/* ── Sprint selector ── */

export interface SprintOption {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  _count?: { tasks: number };
}

/* ── Task (lightweight shape from /api/tasks) ── */

export interface WhipTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  unplanned: boolean;
  unplannedReason: string | null;
  unplannedNote: string | null;
  addedBy: string | null;
  createdAt: string;
  sprintId: string | null;
  responsible: Array<{
    id: string;
    name: string | null;
    email: string;
  }>;
}

/* ── Filters ── */

export interface WhipFilters {
  sprintId: string | null;
  priority: string | null;
  ownerId: string | null;
}

/* ── Re-exports for convenience ── */

export type {
  PlannedVsUnplannedResult,
  DailyDelta,
  PersonWipPressure,
  FlowRiskRecommendation,
  FixedDateRiskAlert,
  FlowRiskIntelligenceReport,
};
