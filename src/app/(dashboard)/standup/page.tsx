"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { Loader2, Monitor, MonitorOff, RefreshCw } from "lucide-react";

import { StandupTimer } from "@/components/standup/standup-timer";
import { FlowCoachingPromptPanel } from "@/components/standup/flow-coaching-prompt";
import { StandupMemberCard } from "@/components/standup/standup-member-card";
import { StandupSummary } from "@/components/standup/standup-summary";
import {
  groupTasksByOwner,
  generateCoachingPrompts,
  calculateStandupMetrics,
  formatStandupForSlack,
  DEFAULT_COACHING_CONFIG,
} from "@/lib/standup-engine";
import type {
  StandupAction,
  StandupMetrics,
  OwnerGroup,
  TeamMember,
  TaskSummary,
  TaskPriority,
  SuggestedAction,
  CoachingPrompt,
} from "@/lib/standup-engine";

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

interface ApiTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  updatedAt: string;
  responsible: Array<{ id: string; name: string | null; email: string; image: string | null }>;
  dependsOn: Array<{ id: string; title: string; status: string }>;
}

interface ApiOwner {
  userId: string;
  userName: string | null;
  userEmail: string;
  tasks: ApiTask[];
  wipCount: number;
  blockedCount: number;
  staleCount: number;
}

interface StandupApiResponse {
  owners: ApiOwner[];
  unassigned: ApiTask[];
  blocked: ApiTask[];
  stale: ApiTask[];
  wipState: Array<{ column: string; count: number; limit: number; exceeded: boolean }>;
  coachingPrompts: Array<{
    type: string;
    severity: string;
    message: string;
    targetUserId?: string;
    targetTaskId?: string;
  }>;
  totalActive: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

const STATUS_MAP: Record<string, TaskSummary["status"]> = {
  QUEUED: "todo",
  WORKING_ON_TODAY: "in_progress",
  ACTIVE: "in_progress",
  NOT_DONE: "deferred",
  DONE: "done",
  BACKLOG: "todo",
};

const PRIORITY_MAP: Record<string, TaskPriority> = {
  P0: "urgent",
  P1: "high",
  P2: "medium",
  P3: "low",
};

function mapApiTaskToSummary(
  task: ApiTask,
  ownerId: string,
  blockedTaskIds: Set<string>,
): TaskSummary {
  const now = new Date();
  const updatedAt = new Date(task.updatedAt);
  const ageDays = Math.max(0, Math.floor((now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24)));

  const isBlocked = blockedTaskIds.has(task.id);
  const status: TaskSummary["status"] = isBlocked ? "blocked" : (STATUS_MAP[task.status] ?? "todo");

  const blockedDeps = task.dependsOn?.filter((dep) => dep.status !== "DONE") ?? [];
  const blockedReason =
    isBlocked && blockedDeps.length > 0
      ? `Waiting on: ${blockedDeps.map((d) => d.title).join(", ")}`
      : undefined;

  return {
    id: task.id,
    title: task.title,
    status,
    ownerId,
    priority: PRIORITY_MAP[task.priority] ?? "medium",
    blockedReason,
    statusChangedAt: task.updatedAt,
    ageDays,
  };
}

// ---------------------------------------------------------------------------
// Data fetching hook
// ---------------------------------------------------------------------------

function useStandupData() {
  const [data, setData] = useState<StandupApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/standup", { signal });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as StandupApiResponse;
      setData(json);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load standup data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  return { data, error, isLoading, retry: fetchData };
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function StandupPage() {
  const { data, error, isLoading, retry } = useStandupData();

  const [facilitatorMode, setFacilitatorMode] = useState(false);
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<StandupMetrics | null>(null);
  const [slackMessage, setSlackMessage] = useState<string>("");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const startTimeRef = useRef<Date | null>(null);

  // Mutable group actions tracked via state
  const [groupActions, setGroupActions] = useState<Record<string, StandupAction>>({});

  // Derive members and tasks from API data
  const { members, tasks } = useMemo(() => {
    if (!data) return { members: [] as TeamMember[], tasks: [] as TaskSummary[] };

    const blockedTaskIds = new Set(data.blocked.map((t) => t.id));

    const memberList: TeamMember[] = data.owners.map((owner) => ({
      id: owner.userId,
      name: owner.userName ?? owner.userEmail,
    }));

    const taskList: TaskSummary[] = [];
    const seen = new Set<string>();

    for (const owner of data.owners) {
      for (const task of owner.tasks) {
        // Avoid duplicate tasks (a task can appear under multiple owners).
        // Multi-owner tasks are assigned to the first responsible user
        // encountered because the standup-engine uses a single-owner model.
        if (seen.has(task.id)) continue;
        seen.add(task.id);
        taskList.push(mapApiTaskToSummary(task, owner.userId, blockedTaskIds));
      }
    }

    // Include unassigned tasks under a synthetic owner
    for (const task of data.unassigned) {
      if (seen.has(task.id)) continue;
      seen.add(task.id);
      taskList.push(mapApiTaskToSummary(task, "__unassigned__", blockedTaskIds));
    }

    return { members: memberList, tasks: taskList };
  }, [data]);

  const groups: OwnerGroup[] = useMemo(() => {
    const base = groupTasksByOwner(tasks, members);
    return base.map((g) => ({
      ...g,
      action: groupActions[g.member.id] ?? g.action,
    }));
  }, [tasks, members, groupActions]);

  const prompts: CoachingPrompt[] = useMemo(
    () => generateCoachingPrompts(tasks, members, DEFAULT_COACHING_CONFIG),
    [tasks, members],
  );

  // --- Handlers ---

  const handleTimerStart = useCallback(() => {
    startTimeRef.current = new Date();
    if (groups.length > 0) setActiveMemberId(groups[0].member.id);
  }, [groups]);

  const handleTimerStop = useCallback(
    (elapsedSeconds: number) => {
      const endTime = new Date();
      const startTime = startTimeRef.current ?? new Date(endTime.getTime() - elapsedSeconds * 1000);
      const m = calculateStandupMetrics({
        startTime,
        endTime,
        groups,
        coachingPromptsShown: prompts.length,
      });
      setMetrics(m);
      setSlackMessage(formatStandupForSlack(groups, m, prompts));
      setActiveMemberId(null);
    },
    [groups, prompts],
  );

  const handleMemberAction = useCallback(
    (memberId: string, action: StandupAction) => {
      setGroupActions((prev) => ({ ...prev, [memberId]: action }));

      // Advance to next member
      const idx = groups.findIndex((g) => g.member.id === memberId);
      if (idx >= 0 && idx < groups.length - 1) {
        setActiveMemberId(groups[idx + 1].member.id);
      } else {
        setActiveMemberId(null);
      }
    },
    [groups],
  );

  const handleCoachingAction = useCallback(
    // TODO: POST /api/standup/actions once the endpoint is implemented
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_action: SuggestedAction) => {},
    [],
  );

  const handleCopySlack = useCallback(async () => {
    try {
      if (!navigator.clipboard) {
        setCopyStatus("error");
        return;
      }
      await navigator.clipboard.writeText(slackMessage);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 2000);
    } catch {
      setCopyStatus("error");
      setTimeout(() => setCopyStatus("idle"), 3000);
    }
  }, [slackMessage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case " ": {
          e.preventDefault();
          // Toggle timer - need to check if timer is running
          // This depends on how the timer state is exposed
          break;
        }
        case "n":
        case "ArrowRight": {
          e.preventDefault();
          if (!groups.length) return;
          const currentIdxN = groups.findIndex((g) => g.member.id === activeMemberId);
          const nextIdx = (currentIdxN + 1) % groups.length;
          setActiveMemberId(groups[nextIdx].member.id);
          break;
        }
        case "p":
        case "ArrowLeft": {
          e.preventDefault();
          if (!groups.length) return;
          const currentIdxP = groups.findIndex((g) => g.member.id === activeMemberId);
          const prevIdx = (currentIdxP - 1 + groups.length) % groups.length;
          setActiveMemberId(groups[prevIdx].member.id);
          break;
        }
        case "d": {
          if (activeMemberId) {
            handleMemberAction(activeMemberId, "completed");
          }
          break;
        }
        case "s": {
          if (activeMemberId) {
            handleMemberAction(activeMemberId, "skipped");
          }
          break;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeMemberId, groups, handleMemberAction]);

  // --- Render ---

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading standup data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <button
            onClick={() => void retry()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Standup Cockpit
          </h1>
          <p className="text-sm text-muted-foreground">
            Run your daily standup with flow coaching and automatic metrics
          </p>
        </div>
        <button
          onClick={() => setFacilitatorMode((v) => !v)}
          className={clsx(
            "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            facilitatorMode
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
          aria-pressed={facilitatorMode}
        >
          {facilitatorMode ? (
            <MonitorOff className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {facilitatorMode ? "Exit Facilitator" : "Facilitator Mode"}
        </button>
      </div>

      {/* Keyboard shortcut legend */}
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span><kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px]">N</kbd> Next</span>
        <span><kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px]">P</kbd> Prev</span>
        <span><kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px]">D</kbd> Done</span>
        <span><kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px]">S</kbd> Skip</span>
      </div>

      {/* Timer */}
      <StandupTimer
        onStart={handleTimerStart}
        onStop={handleTimerStop}
        facilitatorMode={facilitatorMode}
      />

      {/* Coaching prompts */}
      <FlowCoachingPromptPanel
        prompts={prompts}
        onAction={handleCoachingAction}
        facilitatorMode={facilitatorMode}
      />

      {/* Member cards */}
      <section aria-label="Team members" className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Team ({groups.length} members)
        </h2>
        <div className={clsx("space-y-3", facilitatorMode && "space-y-4")}>
          {groups.map((group) => (
            <StandupMemberCard
              key={group.member.id}
              group={group}
              isActive={group.member.id === activeMemberId}
              facilitatorMode={facilitatorMode}
              onActionChange={handleMemberAction}
            />
          ))}
        </div>
      </section>

      {/* Summary (visible after standup ends) */}
      <StandupSummary
        metrics={metrics}
        slackMessage={slackMessage}
        facilitatorMode={facilitatorMode}
        onCopyToClipboard={handleCopySlack}
      />
      {copyStatus === "copied" && (
        <p className="text-xs text-emerald-600">Copied to clipboard!</p>
      )}
      {copyStatus === "error" && (
        <p className="text-xs text-red-500">Failed to copy — try selecting and copying manually</p>
      )}
    </div>
  );
}
