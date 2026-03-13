"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import {
  CheckCircle2,
  ClipboardCopy,
  Download,
  FileText,
  MessageSquareQuote,
  Mic,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  buildDesignInterviewPrompt,
  DEFAULT_DESIGN_INTERVIEW_DRAFT,
  DESIGN_INTERVIEW_CONTEXT,
  DESIGN_INTERVIEW_PROMPTS,
  DESIGN_INTERVIEW_STORAGE_KEY,
  personalizeDesignInterviewTemplate,
  type DesignInterviewDraft,
} from "@/lib/design-interview";

type WorkspaceTab = "run" | "capture";

function readDraft(): DesignInterviewDraft {
  if (typeof window === "undefined") return DEFAULT_DESIGN_INTERVIEW_DRAFT;

  try {
    const raw = window.localStorage.getItem(DESIGN_INTERVIEW_STORAGE_KEY);
    if (!raw) return DEFAULT_DESIGN_INTERVIEW_DRAFT;

    const parsed = JSON.parse(raw) as Partial<DesignInterviewDraft>;
    return {
      ...DEFAULT_DESIGN_INTERVIEW_DRAFT,
      ...parsed,
      structuredOutput:
        typeof parsed.structuredOutput === "string" && parsed.structuredOutput.trim().length > 0
          ? parsed.structuredOutput
          : DEFAULT_DESIGN_INTERVIEW_DRAFT.structuredOutput,
      promptNotes:
        parsed.promptNotes && typeof parsed.promptNotes === "object"
          ? parsed.promptNotes
          : {},
      completedPromptIds: Array.isArray(parsed.completedPromptIds)
        ? parsed.completedPromptIds.filter((value): value is string => typeof value === "string")
        : [],
    };
  } catch {
    return DEFAULT_DESIGN_INTERVIEW_DRAFT;
  }
}

async function copyToClipboard(value: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function DesignInterviewTab() {
  const [draft, setDraft] = useState<DesignInterviewDraft>(() => readDraft());
  const [activePromptId, setActivePromptId] = useState(DESIGN_INTERVIEW_PROMPTS[0]?.id ?? "");
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>("run");
  const [copyState, setCopyState] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(DESIGN_INTERVIEW_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // Ignore storage failures.
    }
  }, [draft]);

  const activePrompt =
    DESIGN_INTERVIEW_PROMPTS.find((prompt) => prompt.id === activePromptId) ??
    DESIGN_INTERVIEW_PROMPTS[0];

  const completedPromptIds = new Set(draft.completedPromptIds);
  const progressPercent = Math.round(
    (completedPromptIds.size / DESIGN_INTERVIEW_PROMPTS.length) * 100,
  );

  const outputTemplate = useMemo(
    () =>
      personalizeDesignInterviewTemplate(draft.intervieweeName, draft.intervieweeRole),
    [draft.intervieweeName, draft.intervieweeRole],
  );
  const generatedPrompt = useMemo(
    () =>
      buildDesignInterviewPrompt({
        intervieweeName: draft.intervieweeName,
        intervieweeRole: draft.intervieweeRole,
      }),
    [draft.intervieweeName, draft.intervieweeRole],
  );
  const previousTemplateRef = useRef(outputTemplate);

  useEffect(() => {
    const previousTemplate = previousTemplateRef.current;

    setDraft((current) => {
      if (current.structuredOutput !== previousTemplate) {
        return current;
      }

      if (current.structuredOutput === outputTemplate) {
        return current;
      }

      return {
        ...current,
        structuredOutput: outputTemplate,
      };
    });

    previousTemplateRef.current = outputTemplate;
  }, [outputTemplate]);

  async function handleCopy(label: string, value: string) {
    const copied = await copyToClipboard(value);
    setCopyState(copied ? label : `${label}-failed`);
    window.setTimeout(() => setCopyState(null), 1600);
  }

  function updateDraft(patch: Partial<DesignInterviewDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function updatePromptNote(promptId: string, value: string) {
    setDraft((current) => ({
      ...current,
      promptNotes: {
        ...current.promptNotes,
        [promptId]: value,
      },
    }));
  }

  function togglePromptComplete(promptId: string) {
    setDraft((current) => {
      const next = new Set(current.completedPromptIds);
      if (next.has(promptId)) next.delete(promptId);
      else next.add(promptId);

      return {
        ...current,
        completedPromptIds: Array.from(next),
      };
    });
  }

  function resetWorkspace() {
    setDraft(DEFAULT_DESIGN_INTERVIEW_DRAFT);
    setActivePromptId(DESIGN_INTERVIEW_PROMPTS[0]?.id ?? "");
    setActiveWorkspaceTab("run");
    try {
      window.localStorage.removeItem(DESIGN_INTERVIEW_STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="bg-[linear-gradient(125deg,#0a0a0a_0%,#151515_45%,rgba(252,90,41,0.96)_140%)] px-5 py-5 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl space-y-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
                <MessageSquareQuote className="h-3.5 w-3.5" />
                Design Research Ops
              </span>
              <div>
                <h2 className="text-xl font-semibold">Arda Design Interview</h2>
                <p className="mt-1 text-sm text-white/75">
                  Run the self-interview as a repeatable workflow: prep the interviewer,
                  copy the AI prompt, collect the raw transcript, and turn it into the
                  structured markdown artifact used for design guidance.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void handleCopy("prompt", generatedPrompt)}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90"
              >
                <ClipboardCopy className="h-4 w-4" />
                Copy Full AI Prompt
              </button>
              <button
                onClick={() => void handleCopy("template", outputTemplate)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
              >
                <Download className="h-4 w-4" />
                Copy Output Template
              </button>
              {copyState && (
                <span
                  className={clsx(
                    "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium",
                    copyState.endsWith("failed")
                      ? "bg-white/10 text-white"
                      : "bg-emerald-500/20 text-emerald-100",
                  )}
                >
                  {copyState.endsWith("failed") ? "Clipboard copy failed" : "Copied"}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Interview Progress</h3>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {completedPromptIds.size}/{DESIGN_INTERVIEW_PROMPTS.length}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Work prompt by prompt, then compile the final markdown artifact.
            </p>

            <div className="mt-4">
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-[#FC5A29] transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{progressPercent}% complete</p>
            </div>

            <div className="mt-4 space-y-2">
              {DESIGN_INTERVIEW_PROMPTS.map((prompt, index) => {
                const isDone = completedPromptIds.has(prompt.id);
                const isActive = activePromptId === prompt.id;

                return (
                  <button
                    key={prompt.id}
                    type="button"
                    onClick={() => setActivePromptId(prompt.id)}
                    className={clsx(
                      "flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors",
                      isActive
                        ? "border-[#FC5A29]/40 bg-[#FC5A29]/5"
                        : "border-border bg-card hover:bg-secondary/60",
                    )}
                  >
                    <span
                      className={clsx(
                        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                        isDone
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">
                        {prompt.title}
                      </span>
                      <span className="mt-1 line-clamp-3 block text-xs text-muted-foreground">
                        {prompt.prompt}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-lg border border-border bg-secondary/40 px-3 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Mic className="h-4 w-4 text-[#FC5A29]" />
                Voice-first reminder
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Use dictation. The goal is to get a messy, high-volume transcript and
                structure it later.
              </p>
            </div>
          </section>
        </aside>

        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Session Setup</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Set the interviewee once so the output template stays anchored to the
                right person.
              </p>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Interviewee name</span>
                <input
                  type="text"
                  value={draft.intervieweeName}
                  onChange={(event) => updateDraft({ intervieweeName: event.target.value })}
                  placeholder="Kyle Henson"
                  className="rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Role</span>
                <input
                  type="text"
                  value={draft.intervieweeRole}
                  onChange={(event) => updateDraft({ intervieweeRole: event.target.value })}
                  placeholder="Founder"
                  className="rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
                />
              </label>
            </div>
          </section>

          <div className="flex border-b border-border">
            {[
              { id: "run", label: "Run Interview" },
              { id: "capture", label: "Capture Output" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveWorkspaceTab(tab.id as WorkspaceTab)}
                className={clsx(
                  "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                  activeWorkspaceTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeWorkspaceTab === "run" && (
            <div className="space-y-4">
              <section className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Existing Context</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Preload this context so the conversation stays on design intent, not implementation basics.
                    </p>
                  </div>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Pre-filled
                  </span>
                </div>

                <div className="mt-4 space-y-2">
                  {DESIGN_INTERVIEW_CONTEXT.map((line) => (
                    <div
                      key={line}
                      className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground"
                    >
                      {line}
                    </div>
                  ))}
                </div>
              </section>

              {activePrompt && (
                <section className="rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{activePrompt.title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Use this as the live interviewer brief for the current stage.
                      </p>
                    </div>
                    <button
                      onClick={() => togglePromptComplete(activePrompt.id)}
                      className={clsx(
                        "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                        completedPromptIds.has(activePrompt.id)
                          ? "bg-emerald-500 text-white"
                          : "btn-ghost-muted border border-border",
                      )}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {completedPromptIds.has(activePrompt.id) ? "Completed" : "Mark Complete"}
                    </button>
                  </div>

                  <div className="mt-5 space-y-5">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Ask
                      </p>
                      <div className="mt-2 rounded-lg border border-[#FC5A29]/25 bg-[#FC5A29]/5 px-4 py-3 text-sm leading-6 text-foreground">
                        {activePrompt.prompt}
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Calibration Example
                      </p>
                      <div className="mt-2 rounded-lg border border-border bg-secondary/30 px-4 py-3 text-sm leading-6 text-muted-foreground">
                        {activePrompt.example}
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Follow-up Probes
                      </p>
                      <div className="mt-2 grid gap-2">
                        {activePrompt.probes.map((probe) => (
                          <div
                            key={probe}
                            className="rounded-lg border border-border px-3 py-2 text-sm text-foreground"
                          >
                            {probe}
                          </div>
                        ))}
                      </div>
                    </div>

                    {activePrompt.followupPrompt && (
                      <div className="space-y-5">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            {activePrompt.followupTitle ?? "Follow-up"}
                          </p>
                          <div className="mt-2 rounded-lg border border-border bg-secondary/30 px-4 py-3 text-sm leading-6 text-foreground">
                            {activePrompt.followupPrompt}
                          </div>
                        </div>

                        {(activePrompt.followupProbes ?? []).length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Additional Probes
                            </p>
                            <div className="mt-2 grid gap-2">
                              {(activePrompt.followupProbes ?? []).map((probe) => (
                                <div
                                  key={probe}
                                  className="rounded-lg border border-border px-3 py-2 text-sm text-foreground"
                                >
                                  {probe}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <label className="block">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Operator Notes
                      </span>
                      <textarea
                        value={draft.promptNotes[activePrompt.id] ?? ""}
                        onChange={(event) =>
                          updatePromptNote(activePrompt.id, event.target.value)
                        }
                        placeholder="Capture contradictions, strong phrasing, follow-up angles, or anything worth carrying into the final write-up."
                        rows={6}
                        className="mt-2 w-full rounded-lg border border-border bg-secondary px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
                      />
                    </label>
                  </div>
                </section>
              )}

              <section className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Sparkles className="h-4 w-4 text-[#FC5A29]" />
                  Prompt Launch Pad
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Keep the AI conversation outside WIPGuard, but use this as the source of truth
                  for the prompt and workflow.
                </p>

                <textarea
                  readOnly
                  value={generatedPrompt}
                  rows={14}
                  className="mt-4 w-full rounded-lg border border-border bg-secondary px-3 py-3 font-mono text-xs leading-5 text-foreground focus:outline-none"
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => void handleCopy("prompt", generatedPrompt)}
                    className="btn-primary-theme inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
                  >
                    <ClipboardCopy className="h-4 w-4" />
                    Copy Full Prompt
                  </button>
                  <button
                    onClick={resetWorkspace}
                    className="btn-ghost-muted inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset Local Draft
                  </button>
                </div>
              </section>
            </div>
          )}

          {activeWorkspaceTab === "capture" && (
            <div className="space-y-4">
              <section className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground">Transcript and Raw Notes</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Paste the full AI conversation, dictation transcript, or rough notes here before you compress them into the structured artifact.
                </p>

                <textarea
                  value={draft.transcript}
                  onChange={(event) => updateDraft({ transcript: event.target.value })}
                  placeholder="Paste the interview transcript, raw notes, or highlights here..."
                  rows={12}
                  className="mt-4 w-full rounded-lg border border-border bg-secondary px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
                />
              </section>

              <section className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Structured Output</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Use the template below as the final handoff format for design-skill generation and review.
                    </p>
                  </div>
                  <button
                    onClick={() => void handleCopy("template", outputTemplate)}
                    className="btn-ghost-muted inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <FileText className="h-4 w-4" />
                    Copy Template
                  </button>
                </div>

                <textarea
                  value={draft.structuredOutput}
                  onChange={(event) => updateDraft({ structuredOutput: event.target.value })}
                  rows={24}
                  className="mt-4 w-full rounded-lg border border-border bg-secondary px-3 py-3 font-mono text-xs leading-5 text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => updateDraft({ structuredOutput: outputTemplate })}
                    className="btn-ghost-muted inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <Download className="h-4 w-4" />
                    Reload Template
                  </button>
                </div>

                <p className="mt-3 text-xs text-muted-foreground">
                  Final QA question: &ldquo;Does this capture what you said? Anything I got wrong or missed?&rdquo;
                </p>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
