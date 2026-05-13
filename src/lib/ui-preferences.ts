import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export interface DashboardPreferenceConfig {
  pinnedWidgets: string[];
  hiddenWidgets: string[];
  timeHorizonDays: number;
  recommendationMode: "urgency" | "due_date";
}

export interface ProjectsPreferenceConfig {
  defaultLayout: "grid" | "swimlane" | "list";
  showMetrics: string[];
}

export interface AnalyticsPreferenceConfig {
  defaultSection: string;
}

export const DEFAULT_DASHBOARD_CONFIG: DashboardPreferenceConfig = {
  pinnedWidgets: [
    "my_active",
    "my_blocked",
    "my_overdue",
    "my_due_soon",
    "recommendations",
    "team_health",
  ],
  hiddenWidgets: [],
  timeHorizonDays: 7,
  recommendationMode: "urgency",
};

export const DEFAULT_PROJECTS_CONFIG: ProjectsPreferenceConfig = {
  defaultLayout: "grid",
  showMetrics: ["progress", "status", "owner", "department"],
};

export const DEFAULT_ANALYTICS_CONFIG: AnalyticsPreferenceConfig = {
  defaultSection: "overview",
};

function parseRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  return input as Record<string, unknown>;
}

function parseStringArray(input: unknown, fallback: string[]): string[] {
  if (!Array.isArray(input)) return fallback;
  const values = input
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  return values.length > 0 ? values : fallback;
}

export function normalizeDashboardConfig(input: unknown): DashboardPreferenceConfig {
  const record = parseRecord(input) ?? {};
  return {
    pinnedWidgets: parseStringArray(record.pinnedWidgets, DEFAULT_DASHBOARD_CONFIG.pinnedWidgets),
    hiddenWidgets: parseStringArray(record.hiddenWidgets, DEFAULT_DASHBOARD_CONFIG.hiddenWidgets),
    timeHorizonDays:
      typeof record.timeHorizonDays === "number" && Number.isFinite(record.timeHorizonDays)
        ? Math.max(1, Math.min(30, Math.trunc(record.timeHorizonDays)))
        : DEFAULT_DASHBOARD_CONFIG.timeHorizonDays,
    recommendationMode:
      record.recommendationMode === "due_date" ? "due_date" : DEFAULT_DASHBOARD_CONFIG.recommendationMode,
  };
}

export function normalizeProjectsConfig(input: unknown): ProjectsPreferenceConfig {
  const record = parseRecord(input) ?? {};
  return {
    defaultLayout:
      record.defaultLayout === "swimlane" || record.defaultLayout === "list"
        ? record.defaultLayout
        : DEFAULT_PROJECTS_CONFIG.defaultLayout,
    showMetrics: parseStringArray(record.showMetrics, DEFAULT_PROJECTS_CONFIG.showMetrics),
  };
}

export function normalizeAnalyticsConfig(input: unknown): AnalyticsPreferenceConfig {
  const record = parseRecord(input) ?? {};
  return {
    defaultSection:
      typeof record.defaultSection === "string" && record.defaultSection.trim().length > 0
        ? record.defaultSection
        : DEFAULT_ANALYTICS_CONFIG.defaultSection,
  };
}

export async function getOrCreateUserUiPreference(userId: string) {
  const existing = await prisma.userUiPreference.findUnique({
    where: { userId },
  });

  if (existing) return existing;

  return prisma.userUiPreference.create({
    data: {
      userId,
      dashboardConfig: DEFAULT_DASHBOARD_CONFIG as unknown as Prisma.InputJsonValue,
      projectsConfig: DEFAULT_PROJECTS_CONFIG as unknown as Prisma.InputJsonValue,
      analyticsConfig: DEFAULT_ANALYTICS_CONFIG as unknown as Prisma.InputJsonValue,
    },
  });
}
