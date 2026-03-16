"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, Play, RotateCcw, Save } from "lucide-react";
import type {
  RuleDescriptor,
  RuleFieldDefinition,
  RuleLoadState,
} from "@/components/settings/integrations/types";

const WORKFLOW_STATUSES = ["BACKLOG", "QUEUED", "WORKING_ON_TODAY", "ACTIVE", "NOT_DONE", "DONE"] as const;
const SUPPORTED_AUTOMATION_STATUSES = ["QUEUED", "ACTIVE", "NOT_DONE"] as const;

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringifyStringList(value: unknown): string {
  return asStringArray(value).join("\n");
}

function parseStringList(raw: string): string[] {
  return raw
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function stringifyStringStatusMap(value: unknown): string {
  const record = asRecord(value);
  return Object.entries(record)
    .filter(([, mapped]) => typeof mapped === "string" && mapped.length > 0)
    .map(([key, mapped]) => `${key}=${mapped as string}`)
    .join("\n");
}

function parseStringStatusMap(raw: string): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [index, lineRaw] of raw.split("\n").entries()) {
    const line = lineRaw.trim();
    if (!line) continue;
    const splitIndex = line.indexOf("=");
    if (splitIndex < 1) {
      throw new Error(`Line ${index + 1} must use dealStage=STATUS`);
    }
    const key = line.slice(0, splitIndex).trim();
    const status = line.slice(splitIndex + 1).trim();
    if (!key) {
      throw new Error(`Line ${index + 1} is missing deal stage key`);
    }
    if (!WORKFLOW_STATUSES.includes(status as (typeof WORKFLOW_STATUSES)[number])) {
      throw new Error(`Line ${index + 1} has invalid status: ${status}`);
    }
    output[key] = status;
  }
  return output;
}

function stringifySignalTemplateMap(value: unknown): string {
  const record = asRecord(value);
  return Object.entries(record)
    .map(([signalKey, template]) => {
      const parsed = asRecord(template);
      const label = typeof parsed.label === "string" ? parsed.label : "";
      const dueInDays = typeof parsed.dueInDays === "number" ? parsed.dueInDays : 1;
      const priority = typeof parsed.priority === "string" ? parsed.priority : "P2";
      const actions =
        asStringArray(parsed.recommendedActions).length > 0
          ? asStringArray(parsed.recommendedActions)
          : asStringArray(parsed.rescueSteps);

      return `${signalKey}|${label}|${dueInDays}|${priority}|${actions.join(";")}`;
    })
    .join("\n");
}

function parseSignalTemplateMap(raw: string): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [index, lineRaw] of raw.split("\n").entries()) {
    const line = lineRaw.trim();
    if (!line) continue;
    const [signalKey, label, dueInDaysRaw, priorityRaw = "P2", actionsRaw = ""] = line.split("|");
    if (!signalKey?.trim() || !label?.trim() || !dueInDaysRaw?.trim()) {
      throw new Error(`Line ${index + 1} must use signalKey|Label|dueInDays|P0-P3|action1;action2`);
    }
    const dueInDays = Number(dueInDaysRaw.trim());
    if (!Number.isFinite(dueInDays)) {
      throw new Error(`Line ${index + 1} has invalid dueInDays`);
    }
    const priority = priorityRaw.trim().toUpperCase();
    if (!["P0", "P1", "P2", "P3"].includes(priority)) {
      throw new Error(`Line ${index + 1} has invalid priority: ${priorityRaw}`);
    }

    output[signalKey.trim()] = {
      label: label.trim(),
      dueInDays: Math.floor(dueInDays),
      priority,
      recommendedActions: actionsRaw
        .split(";")
        .map((entry) => entry.trim())
        .filter(Boolean),
    };
  }
  return output;
}

function stringifyStatusMessageMap(value: unknown): Record<string, string> {
  const record = asRecord(value);
  return {
    ACTIVE: typeof record.ACTIVE === "string" ? record.ACTIVE : "",
    NOT_DONE: typeof record.NOT_DONE === "string" ? record.NOT_DONE : "",
    DONE: typeof record.DONE === "string" ? record.DONE : "",
  };
}

function parseBoolean(value: unknown): boolean {
  return value === true;
}

function isTextField(type: RuleFieldDefinition["type"]): boolean {
  return (
    type === "string-list" ||
    type === "string-status-map" ||
    type === "signal-template-map"
  );
}

function isEnumListField(type: RuleFieldDefinition["type"]): boolean {
  return type === "enum-list";
}

function parseComplexField(type: RuleFieldDefinition["type"], raw: string): unknown {
  if (type === "string-list") return parseStringList(raw);
  if (type === "string-status-map") return parseStringStatusMap(raw);
  if (type === "signal-template-map") return parseSignalTemplateMap(raw);
  return raw;
}

function serializeComplexField(type: RuleFieldDefinition["type"], value: unknown): string {
  if (type === "string-list") return stringifyStringList(value);
  if (type === "string-status-map") return stringifyStringStatusMap(value);
  if (type === "signal-template-map") return stringifySignalTemplateMap(value);
  return "";
}

interface RuleEditorProps {
  descriptor: RuleDescriptor;
  state: RuleLoadState;
  highlighted: boolean;
  onReload: () => void;
  onSave: (payload: {
    enabled?: boolean;
    statusOverride?: "QUEUED" | "ACTIVE" | "NOT_DONE" | null;
    config: Record<string, unknown>;
  }) => Promise<void>;
  onRun: (payload?: { dryRun?: boolean; payload?: Record<string, unknown> }) => Promise<void>;
  onChannelRoutingAddPolicy: (policy: Record<string, unknown>) => Promise<void>;
  onChannelRoutingRemovePolicy: (policyIndex: number) => Promise<void>;
}

function initializeDraftState(
  descriptor: RuleDescriptor,
  state: RuleLoadState
): {
  enabled: boolean;
  statusOverride: "QUEUED" | "ACTIVE" | "NOT_DONE" | null;
  draftValues: Record<string, unknown>;
  rawTextValues: Record<string, string>;
} {
  if (!state.rule) {
    return {
      enabled: true,
      statusOverride: null,
      draftValues: {},
      rawTextValues: {},
    };
  }

  const nextDraftValues: Record<string, unknown> = {};
  const nextRawText: Record<string, string> = {};

  for (const field of descriptor.fields) {
    const currentValue = state.rule.config[field.key];
    if (isTextField(field.type)) {
      nextRawText[field.key] = serializeComplexField(field.type, currentValue);
    } else if (field.type === "status-message-map") {
      nextDraftValues[field.key] = stringifyStatusMessageMap(currentValue);
    } else if (field.type === "number") {
      nextDraftValues[field.key] =
        typeof currentValue === "number" && Number.isFinite(currentValue)
          ? String(currentValue)
          : "";
    } else if (field.type === "boolean") {
      nextDraftValues[field.key] = parseBoolean(currentValue);
    } else if (isEnumListField(field.type)) {
      nextDraftValues[field.key] = asStringArray(currentValue);
    } else {
      nextDraftValues[field.key] =
        typeof currentValue === "string" || typeof currentValue === "number"
          ? String(currentValue)
          : "";
    }
  }

  return {
    enabled: state.rule.enabled,
    statusOverride: state.rule.statusOverride ?? null,
    draftValues: nextDraftValues,
    rawTextValues: nextRawText,
  };
}

export function RuleEditor({
  descriptor,
  state,
  highlighted,
  onReload,
  onSave,
  onRun,
  onChannelRoutingAddPolicy,
  onChannelRoutingRemovePolicy,
}: RuleEditorProps) {
  const initialDraft = initializeDraftState(descriptor, state);
  const [enabled, setEnabled] = useState(initialDraft.enabled);
  const [statusOverride, setStatusOverride] = useState<"QUEUED" | "ACTIVE" | "NOT_DONE" | null>(
    initialDraft.statusOverride
  );
  const [draftValues, setDraftValues] = useState<Record<string, unknown>>(
    initialDraft.draftValues
  );
  const [rawTextValues, setRawTextValues] = useState<Record<string, string>>(
    initialDraft.rawTextValues
  );
  const [parseError, setParseError] = useState<string | null>(null);

  const [newPolicy, setNewPolicy] = useState({
    label: "",
    projectId: "",
    priority: "",
    notificationType: "",
    channelId: "",
    threadTs: "",
    enabled: true,
  });

  const channelRoutingPolicies = useMemo(() => {
    if (descriptor.editorType !== "channel-routing") return [];
    return Array.isArray(state.rule?.config?.policies) ? (state.rule?.config?.policies as Array<Record<string, unknown>>) : [];
  }, [descriptor.editorType, state.rule?.config?.policies]);

  const buildConfigPayload = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = {};

    for (const field of descriptor.fields) {
      if (isTextField(field.type)) {
        payload[field.key] = parseComplexField(field.type, rawTextValues[field.key] ?? "");
        continue;
      }

      const value = draftValues[field.key];
      if (field.type === "number") {
        const parsed = Number(String(value ?? "").trim());
        if (!Number.isFinite(parsed)) {
          throw new Error(`${field.label} must be a number`);
        }
        payload[field.key] = Math.floor(parsed);
        continue;
      }

      if (field.type === "boolean") {
        payload[field.key] = value === true;
        continue;
      }

      if (field.type === "enum-list") {
        payload[field.key] = Array.isArray(value)
          ? value.filter((entry): entry is string => typeof entry === "string")
          : [];
        continue;
      }

      if (field.type === "status-message-map") {
        payload[field.key] = value;
        continue;
      }

      payload[field.key] = String(value ?? "");
    }

    return payload;
  };

  const submitSave = async () => {
    setParseError(null);
    try {
      const config = buildConfigPayload();
      await onSave({
        enabled,
        statusOverride: descriptor.supportsStatusOverride ? statusOverride : undefined,
        config,
      });
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Could not parse form values");
    }
  };

  if (state.loading) {
    return (
      <div className="rounded-lg border border-border/80 bg-secondary/30 p-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading {descriptor.title}...
        </span>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-3 text-sm text-foreground">
        <p className="font-medium">Failed to load {descriptor.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{state.error}</p>
        <button
          type="button"
          onClick={onReload}
          className="mt-2 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!state.rule) {
    return null;
  }

  return (
    <section
      className={`rounded-lg border p-3 ${
        highlighted
          ? "border-[var(--danger)]/50 bg-[var(--danger)]/5"
          : "border-border/80 bg-secondary/20"
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-foreground">{descriptor.title}</h4>
          <p className="text-xs text-muted-foreground">
            Key: <code>{state.rule.key}</code> · Last run: {formatDate(state.rule.lastRunAt)}
          </p>
        </div>
        {state.rule.lastError ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--danger)]/10 px-2 py-0.5 text-[11px] text-[var(--danger)]">
            <AlertTriangle className="h-3 w-3" />
            Rule error
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Enabled
        </label>

        {descriptor.supportsStatusOverride ? (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Status Override
            <select
              value={statusOverride ?? ""}
              onChange={(event) =>
                setStatusOverride(
                  event.target.value
                    ? (event.target.value as "QUEUED" | "ACTIVE" | "NOT_DONE")
                    : null
                )
              }
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            >
              <option value="">No override</option>
              {SUPPORTED_AUTOMATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3">
        {descriptor.fields.map((field) => {
          if (field.type === "boolean") {
            return (
              <label key={field.key} className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={draftValues[field.key] === true}
                  onChange={(event) =>
                    setDraftValues((prev) => ({ ...prev, [field.key]: event.target.checked }))
                  }
                />
                {field.label}
              </label>
            );
          }

          if (field.type === "status-message-map") {
            const map = asRecord(draftValues[field.key]);
            return (
              <div key={field.key} className="rounded-md border border-border bg-background p-3">
                <p className="text-sm font-medium text-foreground">{field.label}</p>
                <div className="mt-2 grid gap-2">
                  {(["ACTIVE", "NOT_DONE", "DONE"] as const).map((statusKey) => (
                    <label key={statusKey} className="flex flex-col gap-1 text-xs text-muted-foreground">
                      {statusKey}
                      <textarea
                        value={typeof map[statusKey] === "string" ? (map[statusKey] as string) : ""}
                        onChange={(event) =>
                          setDraftValues((prev) => ({
                            ...prev,
                            [field.key]: {
                              ...asRecord(prev[field.key]),
                              [statusKey]: event.target.value,
                            },
                          }))
                        }
                        className="min-h-[68px] rounded-md border border-border bg-secondary px-2 py-1.5 text-xs text-foreground"
                      />
                    </label>
                  ))}
                </div>
              </div>
            );
          }

          if (isTextField(field.type)) {
            return (
              <label key={field.key} className="flex flex-col gap-1 text-xs text-muted-foreground">
                {field.label}
                {field.description ? <span className="text-[11px] text-muted-foreground">{field.description}</span> : null}
                <textarea
                  value={rawTextValues[field.key] ?? ""}
                  onChange={(event) =>
                    setRawTextValues((prev) => ({ ...prev, [field.key]: event.target.value }))
                  }
                  className="min-h-[72px] rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                />
              </label>
            );
          }

          if (field.type === "enum-list") {
            const selected = Array.isArray(draftValues[field.key])
              ? (draftValues[field.key] as string[])
              : [];
            return (
              <div key={field.key} className="rounded-md border border-border bg-background p-3">
                <p className="text-sm font-medium text-foreground">{field.label}</p>
                <div className="mt-2 grid gap-1">
                  {(field.options ?? []).map((option) => (
                    <label key={option.value} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={selected.includes(option.value)}
                        onChange={(event) => {
                          setDraftValues((prev) => {
                            const prior = Array.isArray(prev[field.key])
                              ? (prev[field.key] as unknown[]).filter(
                                  (entry): entry is string => typeof entry === "string"
                                )
                              : [];
                            if (event.target.checked) {
                              return {
                                ...prev,
                                [field.key]: Array.from(new Set([...prior, option.value])),
                              };
                            }
                            return {
                              ...prev,
                              [field.key]: prior.filter((entry) => entry !== option.value),
                            };
                          });
                        }}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>
            );
          }

          if (field.type === "enum") {
            return (
              <label key={field.key} className="flex flex-col gap-1 text-xs text-muted-foreground">
                {field.label}
                <select
                  value={String(draftValues[field.key] ?? "")}
                  onChange={(event) =>
                    setDraftValues((prev) => ({ ...prev, [field.key]: event.target.value }))
                  }
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                >
                  {(field.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          }

          return (
            <label key={field.key} className="flex flex-col gap-1 text-xs text-muted-foreground">
              {field.label}
              {field.description ? <span className="text-[11px] text-muted-foreground">{field.description}</span> : null}
              {field.type === "number" ? (
                <input
                  type="number"
                  min={field.min}
                  max={field.max}
                  value={String(draftValues[field.key] ?? "")}
                  onChange={(event) =>
                    setDraftValues((prev) => ({ ...prev, [field.key]: event.target.value }))
                  }
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                />
              ) : (
                <input
                  type="text"
                  value={String(draftValues[field.key] ?? "")}
                  onChange={(event) =>
                    setDraftValues((prev) => ({ ...prev, [field.key]: event.target.value }))
                  }
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                />
              )}
            </label>
          );
        })}
      </div>

      {descriptor.editorType === "channel-routing" ? (
        <div className="mt-3 rounded-md border border-border bg-background p-3">
          <p className="text-sm font-medium text-foreground">Channel Routing Policies</p>
          <p className="text-xs text-muted-foreground">First match wins. Add policies with project, priority, or notification type match.</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Label
              <input
                type="text"
                value={newPolicy.label}
                onChange={(event) => setNewPolicy((prev) => ({ ...prev, label: event.target.value }))}
                className="rounded-md border border-border bg-secondary px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Channel ID
              <input
                type="text"
                value={newPolicy.channelId}
                onChange={(event) => setNewPolicy((prev) => ({ ...prev, channelId: event.target.value }))}
                className="rounded-md border border-border bg-secondary px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Match Project ID (optional)
              <input
                type="text"
                value={newPolicy.projectId}
                onChange={(event) => setNewPolicy((prev) => ({ ...prev, projectId: event.target.value }))}
                className="rounded-md border border-border bg-secondary px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Match Priority (optional)
              <input
                type="text"
                value={newPolicy.priority}
                onChange={(event) => setNewPolicy((prev) => ({ ...prev, priority: event.target.value }))}
                className="rounded-md border border-border bg-secondary px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Match Notification Type (optional)
              <input
                type="text"
                value={newPolicy.notificationType}
                onChange={(event) =>
                  setNewPolicy((prev) => ({ ...prev, notificationType: event.target.value }))
                }
                className="rounded-md border border-border bg-secondary px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Thread TS (optional)
              <input
                type="text"
                value={newPolicy.threadTs}
                onChange={(event) => setNewPolicy((prev) => ({ ...prev, threadTs: event.target.value }))}
                className="rounded-md border border-border bg-secondary px-2 py-1.5 text-sm text-foreground"
              />
            </label>
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={newPolicy.enabled}
              onChange={(event) => setNewPolicy((prev) => ({ ...prev, enabled: event.target.checked }))}
            />
            Policy enabled
          </label>
          <button
            type="button"
            onClick={() =>
              onChannelRoutingAddPolicy({
                label: newPolicy.label || "Routing policy",
                channelId: newPolicy.channelId,
                threadTs: newPolicy.threadTs || undefined,
                enabled: newPolicy.enabled,
                match: {
                  projectId: newPolicy.projectId || undefined,
                  priority: newPolicy.priority || undefined,
                  notificationType: newPolicy.notificationType || undefined,
                },
              })
            }
            disabled={state.saving || !newPolicy.channelId}
            className="mt-2 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Add Policy
          </button>

          <div className="mt-3 space-y-2">
            {channelRoutingPolicies.length === 0 ? (
              <p className="text-xs text-muted-foreground">No routing policies configured.</p>
            ) : (
              channelRoutingPolicies.map((policy, index) => {
                const match = asRecord(policy.match);
                return (
                  <div key={`${String(policy.label)}-${index}`} className="rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">{String(policy.label ?? "Routing policy")}</p>
                    <p>Channel: {String(policy.channelId ?? "")}</p>
                    <p>
                      Match: project={String(match.projectId ?? "*")} · priority={String(match.priority ?? "*")} ·
                      type={String(match.notificationType ?? "*")}
                    </p>
                    <button
                      type="button"
                      onClick={() => onChannelRoutingRemovePolicy(index)}
                      className="mt-1 rounded-md border border-border px-2 py-0.5 text-[11px] hover:text-foreground"
                    >
                      Remove
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      {(parseError || state.rule.lastError) && (
        <div className="mt-3 rounded-md border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]">
          {parseError || state.rule.lastError}
        </div>
      )}

      {state.message ? (
        <div className="mt-3 rounded-md border border-[var(--success)]/30 bg-[var(--success)]/10 px-3 py-2 text-xs text-foreground">
          {state.message}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={submitSave}
          disabled={state.saving}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {state.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save Config
        </button>

        {descriptor.runAction === "sync" ? (
          <>
            <button
              type="button"
              onClick={() => onRun({ dryRun: true })}
              disabled={state.running}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {state.running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Run Dry Run
            </button>
            <button
              type="button"
              onClick={() => onRun()}
              disabled={state.running}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              Run Now
            </button>
          </>
        ) : null}

        <button
          type="button"
          onClick={onReload}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reload
        </button>
      </div>
    </section>
  );
}
