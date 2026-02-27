"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  SprintOption,
  WhipTask,
  WhipFilters,
  PlannedVsUnplannedResult,
  FlowRiskIntelligenceReport,
} from "./types";

interface WhipData {
  sprints: SprintOption[];
  sprintData: PlannedVsUnplannedResult | null;
  riskReport: FlowRiskIntelligenceReport | null;
  tasks: WhipTask[];
  loading: boolean;
  error: string | null;
  filters: WhipFilters;
  setFilters: (filters: Partial<WhipFilters>) => void;
  refreshRisk: () => void;
  updateTask: (taskId: string, patch: Record<string, unknown>) => Promise<boolean>;
  retry: () => void;
  clearError: () => void;
}

export function useWhipData(): WhipData {
  const [sprints, setSprints] = useState<SprintOption[]>([]);
  const [sprintData, setSprintData] = useState<PlannedVsUnplannedResult | null>(null);
  const [riskReport, setRiskReport] = useState<FlowRiskIntelligenceReport | null>(null);
  const [tasks, setTasks] = useState<WhipTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFiltersState] = useState<WhipFilters>({
    sprintId: null,
    priority: null,
    ownerId: null,
  });
  const [retryKey, setRetryKey] = useState(0);

  const setFilters = useCallback((partial: Partial<WhipFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...partial }));
  }, []);

  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setRetryKey((k) => k + 1);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Fetch sprints on mount
  useEffect(() => {
    async function fetchSprints() {
      try {
        const res = await fetch("/api/sprints");
        if (!res.ok) throw new Error("Failed to fetch sprints");
        const data = await res.json();
        setSprints(data);
        // Auto-select active sprint
        const active = data.find((s: SprintOption) => s.isActive);
        if (active) {
          setFiltersState((prev) => ({ ...prev, sprintId: active.id }));
        } else if (data.length > 0) {
          setFiltersState((prev) => ({ ...prev, sprintId: data[0].id }));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    }
    fetchSprints();
  }, [retryKey]);

  // Fetch planned vs unplanned when sprint changes
  useEffect(() => {
    if (!filters.sprintId) return;
    let cancelled = false;

    async function fetchSprintData() {
      try {
        const res = await fetch(`/api/sprints/${filters.sprintId}/planned-vs-unplanned`);
        if (!res.ok) throw new Error("Failed to fetch sprint data");
        const data = await res.json();
        if (!cancelled) setSprintData(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      }
    }
    fetchSprintData();

    return () => { cancelled = true; };
  }, [filters.sprintId]);

  // Fetch tasks for the selected sprint
  useEffect(() => {
    if (!filters.sprintId) return;
    let cancelled = false;

    async function fetchTasks() {
      try {
        const params = new URLSearchParams({ sprint: filters.sprintId! });
        if (filters.priority) params.set("priority", filters.priority);
        if (filters.ownerId) params.set("assignee", filters.ownerId);

        const res = await fetch(`/api/tasks?${params}`);
        if (!res.ok) throw new Error("Failed to fetch tasks");
        const data = await res.json();
        if (!cancelled) setTasks(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      }
    }
    fetchTasks();

    return () => { cancelled = true; };
  }, [filters.sprintId, filters.priority, filters.ownerId]);

  // Fetch risk intelligence
  const fetchRisk = useCallback(async () => {
    try {
      const res = await fetch("/api/flow/risk");
      if (!res.ok) throw new Error("Failed to fetch risk data");
      const data = await res.json();
      setRiskReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, []);

  useEffect(() => {
    fetchRisk();
  }, [fetchRisk]);

  // Mark loading complete when all initial data arrives
  useEffect(() => {
    if (sprints.length > 0) {
      setLoading(false);
    }
  }, [sprints]);

  // Quick-action: update a task via PATCH
  const updateTask = useCallback(async (taskId: string, patch: Record<string, unknown>): Promise<boolean> => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return false;
      // Refresh tasks list
      if (filters.sprintId) {
        const params = new URLSearchParams({ sprint: filters.sprintId });
        if (filters.priority) params.set("priority", filters.priority);
        if (filters.ownerId) params.set("assignee", filters.ownerId);
        const taskRes = await fetch(`/api/tasks?${params}`);
        if (taskRes.ok) setTasks(await taskRes.json());
      }
      return true;
    } catch {
      return false;
    }
  }, [filters]);

  return {
    sprints,
    sprintData,
    riskReport,
    tasks,
    loading,
    error,
    filters,
    setFilters,
    refreshRisk: fetchRisk,
    updateTask,
    retry,
    clearError,
  };
}
