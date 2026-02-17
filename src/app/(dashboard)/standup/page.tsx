"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { Monitor, MonitorOff } from "lucide-react";

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
  SuggestedAction,
  CoachingPrompt,
} from "@/lib/standup-engine";

// ---------------------------------------------------------------------------
// Demo data  (replace with real API / SWR hook once backend is wired)
// ---------------------------------------------------------------------------

const DEMO_MEMBERS: TeamMember[] = [
  { id: "u1", name: "Alice Chen" },
  { id: "u2", name: "Bob Park" },
  { id: "u3", name: "Carol Rivera" },
  { id: "u4", name: "Dan Kim" },
];

const DEMO_TASKS: TaskSummary[] = [
  { id: "t1", title: "Migrate auth to NextAuth v5", status: "in_progress", ownerId: "u1", priority: "high", ageDays: 3 },
  { id: "t2", title: "Fix Safari layout bug", status: "in_progress", ownerId: "u1", priority: "medium", ageDays: 1 },
  { id: "t3", title: "Write integration tests for billing", status: "in_progress", ownerId: "u1", priority: "medium", ageDays: 6 },
  { id: "t4", title: "Design onboarding flow v2", status: "in_progress", ownerId: "u1", priority: "low" },
  { id: "t5", title: "API rate-limiter middleware", status: "blocked", ownerId: "u2", priority: "high", blockedReason: "Waiting on infra team", ageDays: 4 },
  { id: "t6", title: "Dashboard performance audit", status: "in_progress", ownerId: "u2", priority: "medium" },
  { id: "t7", title: "Update Stripe webhook handler", status: "done", ownerId: "u3", priority: "high" },
  { id: "t8", title: "Customer export CSV feature", status: "in_progress", ownerId: "u3", priority: "medium" },
  { id: "t9", title: "Docs: API authentication guide", status: "todo", ownerId: "u4", priority: "low" },
  { id: "t10", title: "Set up staging environment", status: "in_progress", ownerId: "u4", priority: "high", ageDays: 8 },
];

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function StandupPage() {
  const [facilitatorMode, setFacilitatorMode] = useState(false);
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<StandupMetrics | null>(null);
  const [slackMessage, setSlackMessage] = useState<string>("");
  const startTimeRef = useRef<Date | null>(null);

  // Mutable group actions tracked via state
  const [groupActions, setGroupActions] = useState<Record<string, StandupAction>>({});

  const groups: OwnerGroup[] = useMemo(() => {
    const base = groupTasksByOwner(DEMO_TASKS, DEMO_MEMBERS);
    return base.map((g) => ({
      ...g,
      action: groupActions[g.member.id] ?? g.action,
    }));
  }, [groupActions]);

  const prompts: CoachingPrompt[] = useMemo(
    () => generateCoachingPrompts(DEMO_TASKS, DEMO_MEMBERS, DEFAULT_COACHING_CONFIG),
    [],
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

  const handleCoachingAction = useCallback((action: SuggestedAction) => {
    // In a real app this would dispatch to the backend
    // eslint-disable-next-line no-console
    console.log("Coaching action:", action);
  }, []);

  const handleCopySlack = useCallback(() => {
    void navigator.clipboard.writeText(slackMessage);
  }, [slackMessage]);

  // --- Render ---

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
    </div>
  );
}
