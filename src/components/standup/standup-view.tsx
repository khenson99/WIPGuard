"use client";

import { useState, useEffect, useCallback } from "react";
import { clsx } from "clsx";
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  Expand,
  Minimize2,
  RefreshCw,
  Pause,
  Play,
  User,
  XCircle,
  Zap,
  CalendarClock,
  ArrowRightLeft,
  Scissors,
} from "lucide-react";
import {
  STATUS_COLORS,
  COLUMN_LABELS,
  DIFFICULTY_LABELS,
} from "@/types";
import type { TaskStatus } from "@/types";

/* ─── Types ─── */

interface StandupUser {
  userId: string;
  userName: string | null;
  userEmail: string;
  tasks: StandupTask[];
  wipCount: number;
  blockedCount: number;
  staleCount: number;
}

interface StandupTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: string;
  degreeOfDifficulty: string;
  updatedAt: string;
  dueDate: string | null;
  unplanned: boolean;
  project?: { id: string; name: string } | null;
  dependsOn?: { id: string; title: string; status: string }[];
  dependedBy?: { id: string; title: string; status: string }[];
}

interface WipState {
  column: TaskStatus;
  count: number;
  limit: number;
  exceeded: boolean;
}

interface CoachingPrompt {
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  targetUserId?: string;
  targetTaskId?: string;
}

interface StandupData {
  owners: StandupUser[];
  unassigned: StandupTask[];
  blocked: StandupTask[];
  stale: StandupTask[];
  wipState: WipState[];
  coachingPrompts: CoachingPrompt[];
  totalActive: number;
  timestamp: string;
}

/* ─── Action handlers ─── */

async function deferTask(taskId: string) {
  const response = await fetch(`/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "BACKLOG" }),
  });
  return response.ok;
}

async function advanceTask(taskId: string) {
  const response = await fetch(`/api/tasks/${taskId}/advance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return response.ok;
}

/* ─── Component ─── */

export function StandupView() {
  const [data, setData] = useState<StandupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [facilitatorMode, setFacilitatorMode] = useState(false);
  const [activeOwnerId, setActiveOwnerId] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [staleThreshold] = useState(() => new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));
  const [error, setError] = useState<string | null>(null);

  const fetchStandup = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/standup");
      if (!res.ok) throw new Error("Failed to fetch standup data");
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError("Failed to load standup data. Please check your connection.");
      console.error("Standup fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStandup();
  }, [fetchStandup]);

  // Timer interval
  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => {
      setTimer((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleAction = async (
    action: "defer" | "advance" | "split",
    taskId: string
  ) => {
    if (action === "defer") {
      const ok = await deferTask(taskId);
      if (!ok) window.alert("Failed to defer task.");
    } else if (action === "advance") {
      const ok = await advanceTask(taskId);
      if (!ok) window.alert("Failed to advance task.");
    } else if (action === "split") {
      // Open task modal for splitting — for now just alert
      window.alert("Split action: open the task to create subtasks.");
    }
    fetchStandup();
  };

  const toggleTaskExpanded = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  if (loading && !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (!data) {
    if (error) {
      return (
        <div className="flex h-64 flex-col items-center justify-center gap-4 p-6 text-center">
          <AlertTriangle className="h-10 w-10 text-yellow-500" />
          <p className="text-sm font-medium text-foreground">{error}</p>
          <button
            onClick={fetchStandup}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      );
    }
    return (
      <div className="p-6 text-center text-muted-foreground">
        Failed to load standup data.
        <button onClick={fetchStandup} className="ml-2 text-primary underline">
          Retry
        </button>
      </div>
    );
  }

  const filteredOwners = facilitatorMode && activeOwnerId
    ? data.owners.filter((o) => o.userId === activeOwnerId)
    : data.owners;

  return (
    <div className={clsx("flex h-full flex-col", facilitatorMode && "bg-background")}>
      {/* Top bar: timer + controls */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-3">
          <h2 className={clsx("font-semibold text-foreground", facilitatorMode ? "text-xl" : "text-base")}>
            Daily Standup
          </h2>
          <span className="text-xs text-muted-foreground">
            {data.totalActive} active tasks &middot; {data.owners.length} team members
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Timer */}
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className={clsx(
              "font-mono text-sm",
              timer > 900 ? "text-red-500" : "text-foreground"
            )}>
              {formatTime(timer)}
            </span>
            <button
              onClick={() => setTimerRunning(!timerRunning)}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              title={timerRunning ? "Pause timer" : "Start timer"}
            >
              {timerRunning ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            </button>
          </div>

          {/* Facilitator mode */}
          <button
            onClick={() => {
              setFacilitatorMode(!facilitatorMode);
              if (!facilitatorMode && data.owners.length > 0) {
                setActiveOwnerId(data.owners[0].userId);
              }
            }}
            className={clsx(
              "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium",
              facilitatorMode
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
            title="Facilitator mode for screen-share"
          >
            {facilitatorMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Expand className="h-3.5 w-3.5" />}
            {facilitatorMode ? "Exit Facilitator" : "Facilitator Mode"}
          </button>

          {/* Refresh */}
          <button
            onClick={fetchStandup}
            className="rounded-md border border-border bg-card p-1.5 text-muted-foreground hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw className={clsx("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Coaching prompts banner */}
      {data.coachingPrompts.length > 0 && (
        <div className="border-b border-border bg-card px-4 py-2">
          <div className="flex flex-wrap gap-2">
            {data.coachingPrompts.map((prompt, i) => (
              <div
                key={i}
                className={clsx(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium",
                  prompt.severity === "critical"
                    ? "bg-red-500/10 text-red-600 dark:text-red-400"
                    : prompt.severity === "warning"
                      ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                      : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                )}
              >
                {prompt.type === "finish_before_start" && <Zap className="h-3 w-3" />}
                {prompt.type === "blocked_alert" && <XCircle className="h-3 w-3" />}
                {prompt.type === "wip_exceeded" && <AlertTriangle className="h-3 w-3" />}
                {prompt.type === "stale_warning" && <CalendarClock className="h-3 w-3" />}
                {prompt.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Facilitator mode: owner selector strip */}
      {facilitatorMode && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-card px-4 py-2">
          {data.owners.map((owner) => (
            <button
              key={owner.userId}
              onClick={() => setActiveOwnerId(owner.userId)}
              className={clsx(
                "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors",
                activeOwnerId === owner.userId
                  ? "bg-primary text-primary-foreground"
                  : "bg-tag-bg text-muted-foreground hover:text-foreground"
              )}
            >
              <User className="h-3 w-3" />
              {owner.userName || owner.userEmail.split("@")[0]}
              {owner.blockedCount > 0 && (
                <span className="rounded-full bg-red-500/20 px-1 text-[10px] text-red-600">
                  {owner.blockedCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Main content: owner groups */}
      <div className={clsx(
        "flex-1 overflow-y-auto",
        facilitatorMode ? "px-6 py-4" : "px-4 py-3"
      )}>
        <div className={clsx(
          "grid gap-4",
          facilitatorMode ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3"
        )}>
          {filteredOwners.map((owner) => (
            <OwnerCard
              key={owner.userId}
              owner={owner}
              facilitatorMode={facilitatorMode}
              expandedTasks={expandedTasks}
              onToggleTask={toggleTaskExpanded}
              onAction={handleAction}
              staleThreshold={staleThreshold}
            />
          ))}

          {/* Unassigned tasks */}
          {data.unassigned.length > 0 && !facilitatorMode && (
            <div className="rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <span className="text-sm font-semibold text-muted-foreground">
                  Unassigned
                </span>
                <span className="rounded-full bg-tag-bg px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {data.unassigned.length}
                </span>
              </div>
              <div className="space-y-1 p-2">
                {data.unassigned.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    expanded={expandedTasks.has(task.id)}
                    onToggle={() => toggleTaskExpanded(task.id)}
                    onAction={handleAction}
                    facilitatorMode={false}
                    staleThreshold={staleThreshold}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* WIP status bar */}
      <div className="flex items-center gap-3 border-t border-border bg-card px-4 py-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          WIP
        </span>
        {data.wipState.filter((w) => w.limit > 0).map((wip) => (
          <div
            key={wip.column}
            className={clsx(
              "flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium",
              wip.exceeded
                ? "bg-red-500/10 text-red-600 dark:text-red-400"
                : "bg-tag-bg text-muted-foreground"
            )}
          >
            <span>{COLUMN_LABELS[wip.column]}</span>
            <span className="font-mono">
              {wip.count}/{wip.limit}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Owner Card ─── */

function OwnerCard({
  owner,
  facilitatorMode,
  expandedTasks,
  onToggleTask,
  onAction,
  staleThreshold,
}: {
  owner: StandupUser;
  facilitatorMode: boolean;
  expandedTasks: Set<string>;
  onToggleTask: (taskId: string) => void;
  onAction: (action: "defer" | "advance" | "split", taskId: string) => void;
  staleThreshold: Date;
}) {
  const hasIssues = owner.blockedCount > 0 || owner.staleCount > 0;

  return (
    <div
      className={clsx(
        "rounded-lg border bg-card",
        hasIssues ? "border-yellow-500/40" : "border-border"
      )}
    >
      {/* Owner header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-avatar-bg text-xs font-semibold text-avatar-text">
            {(owner.userName || owner.userEmail)[0].toUpperCase()}
          </div>
          <span className={clsx("font-semibold text-foreground", facilitatorMode ? "text-lg" : "text-sm")}>
            {owner.userName || owner.userEmail.split("@")[0]}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-tag-bg px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {owner.tasks.length} tasks
          </span>
          {owner.wipCount > 2 && (
            <span className="rounded bg-yellow-500/10 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700 dark:text-yellow-400">
              WIP: {owner.wipCount}
            </span>
          )}
          {owner.blockedCount > 0 && (
            <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
              {owner.blockedCount} blocked
            </span>
          )}
        </div>
      </div>

      {/* Task list */}
      <div className={clsx("space-y-1", facilitatorMode ? "p-3" : "p-2")}>
        {owner.tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            expanded={expandedTasks.has(task.id)}
            onToggle={() => onToggleTask(task.id)}
            onAction={onAction}
            facilitatorMode={facilitatorMode}
            staleThreshold={staleThreshold}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Task Row ─── */

function TaskRow({
  task,
  expanded,
  onToggle,
  onAction,
  facilitatorMode,
  staleThreshold,
}: {
  task: StandupTask;
  expanded: boolean;
  onToggle: () => void;
  onAction: (action: "defer" | "advance" | "split", taskId: string) => void;
  facilitatorMode: boolean;
  staleThreshold: Date;
}) {
  const isBlocked =
    task.dependsOn &&
    task.dependsOn.length > 0 &&
    task.dependsOn.some((d) => d.status !== "DONE");
  const isStale = new Date(task.updatedAt) < staleThreshold;

  return (
    <div
      className={clsx(
        "rounded-md border transition-colors",
        isBlocked
          ? "border-red-500/30 bg-red-500/5"
          : isStale
            ? "border-yellow-500/30 bg-yellow-500/5"
            : "border-transparent bg-card-bg hover:bg-tag-bg/50"
      )}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
      >
        <div
          className="h-2 w-2 flex-shrink-0 rounded-full"
          style={{ backgroundColor: STATUS_COLORS[task.status] }}
        />
        <span className={clsx(
          "flex-1 font-medium text-foreground",
          facilitatorMode ? "text-base" : "text-xs"
        )}>
          {task.title}
        </span>
        <div className="flex items-center gap-1">
          {isBlocked && (
            <span title="Blocked"><XCircle className="h-3 w-3 text-red-500" /></span>
          )}
          {isStale && !isBlocked && (
            <span title="Stale — not updated in 3+ days"><CalendarClock className="h-3 w-3 text-yellow-600" /></span>
          )}
          {task.unplanned && (
            <span title="Unplanned"><AlertTriangle className="h-3 w-3 text-primary" /></span>
          )}
          <span className="text-[10px] text-muted-foreground">
            {COLUMN_LABELS[task.status]}
          </span>
          <ChevronRight
            className={clsx(
              "h-3 w-3 text-muted-foreground transition-transform",
              expanded && "rotate-90"
            )}
          />
        </div>
      </button>

      {/* Expanded details + actions */}
      {expanded && (
        <div className="border-t border-border/50 px-2.5 py-2">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            {task.project && (
              <span className="rounded bg-tag-bg px-1.5 py-0.5">{task.project.name}</span>
            )}
            <span className="rounded bg-tag-bg px-1.5 py-0.5">
              {DIFFICULTY_LABELS[task.degreeOfDifficulty as keyof typeof DIFFICULTY_LABELS]}
            </span>
            <span className="rounded bg-tag-bg px-1.5 py-0.5">{task.priority}</span>
            {task.dueDate && (
              <span className="rounded bg-tag-bg px-1.5 py-0.5">
                Due {new Date(task.dueDate).toLocaleDateString()}
              </span>
            )}
            <span className="text-[9px]">
              Updated {new Date(task.updatedAt).toLocaleDateString()}
            </span>
          </div>

          {/* Blocking dependencies */}
          {isBlocked && task.dependsOn && (
            <div className="mt-1.5 text-[10px] text-red-600 dark:text-red-400">
              Blocked by:{" "}
              {task.dependsOn
                .filter((d) => d.status !== "DONE")
                .map((d) => d.title)
                .join(", ")}
            </div>
          )}

          {/* One-click action suggestions */}
          <div className="mt-2 flex items-center gap-1.5">
            {task.status !== "DONE" && (
              <button
                onClick={() => onAction("advance", task.id)}
                className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/20"
              >
                <ChevronRight className="h-3 w-3" />
                Advance
              </button>
            )}
            <button
              onClick={() => onAction("defer", task.id)}
              className="flex items-center gap-1 rounded-md bg-tag-bg px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowRightLeft className="h-3 w-3" />
              Defer
            </button>
            <button
              onClick={() => onAction("split", task.id)}
              className="flex items-center gap-1 rounded-md bg-tag-bg px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground"
            >
              <Scissors className="h-3 w-3" />
              Split
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
