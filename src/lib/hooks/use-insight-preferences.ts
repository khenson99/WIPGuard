"use client";

import { useState, useCallback, useEffect } from "react";
import type { AiInsight } from "@/lib/analytics/types";

export type InsightStatus = "pinned" | "dismissed" | "default";

interface InsightPreference {
  insightId: string;
  status: InsightStatus;
}

interface UseInsightPreferencesReturn {
  pinnedIds: Set<string>;
  dismissedIds: Set<string>;
  isPinned: (id: string) => boolean;
  isDismissed: (id: string) => boolean;
  togglePin: (id: string) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  undoDismiss: (id: string) => Promise<void>;
  createTaskFromInsight: (insight: AiInsight) => Promise<void>;
  creatingTaskForId: string | null;
  sortAndFilter: (insights: AiInsight[], showDismissed?: boolean) => AiInsight[];
  loading: boolean;
}

async function setPreference(insightId: string, status: InsightStatus): Promise<void> {
  const res = await fetch("/api/insights/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ insightId, status }),
  });
  if (!res.ok) {
    throw new Error(`Failed to save preference: ${res.status}`);
  }
}

function buildTaskDescription(insight: AiInsight): string {
  const lines: string[] = [
    insight.why,
    "",
    insight.expectedImpact ? `**Expected impact:** ${insight.expectedImpact}` : "",
    "",
    "---",
    `*Auto-created from AI insight: ${insight.id}*`,
    `*Section: ${insight.section}*`,
    `*Severity: ${insight.severity}*`,
  ].filter((line, idx, arr) => {
    // Remove consecutive empty lines
    if (line === "" && arr[idx - 1] === "") return false;
    return true;
  });
  return lines.join("\n").trim();
}

export function useInsightPreferences(): UseInsightPreferencesReturn {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creatingTaskForId, setCreatingTaskForId] = useState<string | null>(null);

  // Load preferences from API on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/insights/preferences");
        if (!res.ok) return;
        const data = (await res.json()) as { preferences: InsightPreference[] };
        if (cancelled) return;
        const pinned = new Set<string>();
        const dismissed = new Set<string>();
        for (const pref of data.preferences) {
          if (pref.status === "pinned") pinned.add(pref.insightId);
          else if (pref.status === "dismissed") dismissed.add(pref.insightId);
        }
        setPinnedIds(pinned);
        setDismissedIds(dismissed);
      } catch {
        // Silently fail — preferences are non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const isPinned = useCallback((id: string) => pinnedIds.has(id), [pinnedIds]);
  const isDismissed = useCallback((id: string) => dismissedIds.has(id), [dismissedIds]);

  const togglePin = useCallback(async (id: string) => {
    const wasPin = pinnedIds.has(id);
    const newStatus: InsightStatus = wasPin ? "default" : "pinned";

    // Optimistic update
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (wasPin) next.delete(id);
      else next.add(id);
      return next;
    });

    try {
      await setPreference(id, newStatus);
    } catch {
      // Rollback on failure
      setPinnedIds((prev) => {
        const next = new Set(prev);
        if (wasPin) next.add(id);
        else next.delete(id);
        return next;
      });
    }
  }, [pinnedIds]);

  const dismiss = useCallback(async (id: string) => {
    // Optimistic update
    setDismissedIds((prev) => new Set([...prev, id]));

    try {
      await setPreference(id, "dismissed");
    } catch {
      // Rollback
      setDismissedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const undoDismiss = useCallback(async (id: string) => {
    // Optimistic update
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    try {
      await setPreference(id, "default");
    } catch {
      // Rollback
      setDismissedIds((prev) => new Set([...prev, id]));
    }
  }, []);

  const createTaskFromInsight = useCallback(async (insight: AiInsight): Promise<void> => {
    setCreatingTaskForId(insight.id);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `[Insight] ${insight.title}`,
          notes: buildTaskDescription(insight),
          status: "BACKLOG",
          priority: insight.severity === "critical" ? "P1" : insight.severity === "warning" ? "P2" : "P3",
        }),
      });
      if (!res.ok) {
        throw new Error(`Failed to create task: ${res.status}`);
      }
    } finally {
      setCreatingTaskForId(null);
    }
  }, []);

  const sortAndFilter = useCallback(
    (insights: AiInsight[], showDismissed = false): AiInsight[] => {
      const filtered = showDismissed
        ? insights
        : insights.filter((i) => !dismissedIds.has(i.id));

      const pinned = filtered.filter((i) => pinnedIds.has(i.id));
      const unpinned = filtered.filter((i) => !pinnedIds.has(i.id));
      return [...pinned, ...unpinned];
    },
    [pinnedIds, dismissedIds]
  );

  return {
    pinnedIds,
    dismissedIds,
    isPinned,
    isDismissed,
    togglePin,
    dismiss,
    undoDismiss,
    createTaskFromInsight,
    creatingTaskForId,
    sortAndFilter,
    loading,
  };
}
