"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Play, RotateCcw, Save } from "lucide-react";
import type {
  RuleDescriptor,
  RuleFieldDefinition,
  RuleLoadState,
} from "@/components/settings/integrations/types";

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
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseStringList(raw: string): string[] {
  return raw
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function serializeStringList(value: unknown): string {
  return asStringArray(value).join("\n");
}

function parseBoolean(value: unknown): boolean {
  return value === true;
}

function initializeDraftState(descriptor: RuleDescriptor, state: RuleLoadState) {
  const draftValues: Record<string, unknown> = {};
  const rawTextValues: Record<string, string> = {};

  for (const field of descriptor.fields) {
    const currentValue = state.rule?.config[field.key];
    if (field.type === "string-list") {
      rawTextValues[field.key] = serializeStringList(currentValue);
    } else if (field.type === "number") {
      draftValues[field.key] =
        typeof currentValue === "number" && Number.isFinite(currentValue)
          ? String(currentValue)
          : "";
    } else if (field.type === "boolean") {
      draftValues[field.key] = parseBoolean(currentValue);
    } else if (field.type === "enum-list") {
      draftValues[field.key] = asStringArray(currentValue);
    } else {
      draftValues[field.key] =
        typeof currentValue === "string" || typeof currentValue === "number"
          ? String(currentValue)
          : "";
    }
  }

  return {
    enabled: state.rule?.enabled ?? true,
    draftValues,
    rawTextValues,
  };
}

interface RuleEditorProps {
  descriptor: RuleDescriptor;
  state: RuleLoadState;
  highlighted: boolean;
  onReload: () => void;
  onSave: (payload: { enabled?: boolean; config: Record<string, unknown> }) => Promise<void>;
  onRun: (payload?: { dryRun?: boolean }) => Promise<void>;
  onChannelRoutingAddPolicy: (policy: Record<string, unknown>) => Promise<void>;
  onChannelRoutingRemovePolicy: (policyIndex: number) => Promise<void>;
}

function FieldControl({
  field,
  value,
  rawValue,
  onValueChange,
  onRawValueChange,
}: {
  field: RuleFieldDefinition;
  value: unknown;
  rawValue: string;
  onValueChange: (value: unknown) => void;
  onRawValueChange: (value: string) => void;
}) {
  if (field.type === "boolean") {
    return (
      <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">
        <input type="checkbox" checked={value === true} onChange={(event) => onValueChange(event.target.checked)} />
        {field.label}
      </label>
    );
  }

  if (field.type === "string-list") {
    return (
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {field.label}
        {field.description ? <span>{field.description}</span> : null}
        <textarea
          value={rawValue}
          onChange={(event) => onRawValueChange(event.target.value)}
          className="min-h-24 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
        />
      </label>
    );
  }

  if (field.type === "enum" && field.options) {
    return (
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {field.label}
        <select
          value={String(value ?? "")}
          onChange={(event) => onValueChange(event.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
        >
          <option value="">Select...</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "enum-list" && field.options) {
    const selected = asStringArray(value);
    return (
      <div className="rounded-md border border-border bg-background p-3">
        <p className="text-sm font-medium text-foreground">{field.label}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {field.options.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={(event) => {
                  onValueChange(
                    event.target.checked
                      ? [...selected, option.value]
                      : selected.filter((entry) => entry !== option.value)
                  );
                }}
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {field.label}
      <input
        type={field.type === "number" ? "number" : "text"}
        min={field.min}
        max={field.max}
        value={String(value ?? "")}
        onChange={(event) => onValueChange(event.target.value)}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
      />
    </label>
  );
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
  const [draftValues, setDraftValues] = useState<Record<string, unknown>>(initialDraft.draftValues);
  const [rawTextValues, setRawTextValues] = useState<Record<string, string>>(initialDraft.rawTextValues);
  const [parseError, setParseError] = useState<string | null>(null);
  const [newPolicy, setNewPolicy] = useState({
    label: "",
    metricKey: "",
    severity: "",
    notificationType: "",
    channelId: "",
    threadTs: "",
    enabled: true,
  });

  const channelRoutingPolicies =
    descriptor.editorType === "channel-routing" && Array.isArray(state.rule?.config?.policies)
      ? (state.rule.config.policies as Array<Record<string, unknown>>)
      : [];

  const buildConfigPayload = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = {};

    for (const field of descriptor.fields) {
      if (field.type === "string-list") {
        payload[field.key] = parseStringList(rawTextValues[field.key] ?? "");
        continue;
      }

      const value = draftValues[field.key];
      if (field.type === "number") {
        const parsed = Number(String(value ?? "").trim());
        if (!Number.isFinite(parsed)) throw new Error(`${field.label} must be a number`);
        payload[field.key] = Math.floor(parsed);
      } else if (field.type === "boolean") {
        payload[field.key] = value === true;
      } else if (field.type === "enum-list") {
        payload[field.key] = asStringArray(value);
      } else {
        payload[field.key] = String(value ?? "");
      }
    }

    return payload;
  };

  const submitSave = async () => {
    setParseError(null);
    try {
      await onSave({ enabled, config: buildConfigPayload() });
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
        <button type="button" onClick={onReload} className="mt-2 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
          Retry
        </button>
      </div>
    );
  }

  if (!state.rule) return null;

  return (
    <section className={`rounded-lg border p-3 ${highlighted ? "border-[var(--danger)]/50 bg-[var(--danger)]/5" : "border-border/80 bg-secondary/20"}`}>
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

      <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        Enabled
      </label>

      <div className="mt-3 grid gap-3">
        {descriptor.fields.map((field) => (
          <FieldControl
            key={field.key}
            field={field}
            value={draftValues[field.key]}
            rawValue={rawTextValues[field.key] ?? ""}
            onValueChange={(value) => setDraftValues((prev) => ({ ...prev, [field.key]: value }))}
            onRawValueChange={(value) => setRawTextValues((prev) => ({ ...prev, [field.key]: value }))}
          />
        ))}
      </div>

      {descriptor.editorType === "channel-routing" ? (
        <div className="mt-3 rounded-md border border-border bg-background p-3">
          <p className="text-sm font-medium text-foreground">Channel Routing Policies</p>
          <p className="text-xs text-muted-foreground">First match wins. Add policies for alert type, severity, or metric key.</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {[
              ["label", "Label"],
              ["channelId", "Channel ID"],
              ["metricKey", "Match Metric Key"],
              ["severity", "Match Severity"],
              ["notificationType", "Match Notification Type"],
              ["threadTs", "Thread TS"],
            ].map(([key, label]) => (
              <label key={key} className="flex flex-col gap-1 text-xs text-muted-foreground">
                {label}
                <input
                  type="text"
                  value={String(newPolicy[key as keyof typeof newPolicy] ?? "")}
                  onChange={(event) => setNewPolicy((prev) => ({ ...prev, [key]: event.target.value }))}
                  className="rounded-md border border-border bg-secondary px-2 py-1.5 text-sm text-foreground"
                />
              </label>
            ))}
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={newPolicy.enabled} onChange={(event) => setNewPolicy((prev) => ({ ...prev, enabled: event.target.checked }))} />
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
                  metricKey: newPolicy.metricKey || undefined,
                  severity: newPolicy.severity || undefined,
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
                      Match: metric={String(match.metricKey ?? "*")} · severity={String(match.severity ?? "*")} ·
                      type={String(match.notificationType ?? "*")}
                    </p>
                    <button type="button" onClick={() => onChannelRoutingRemovePolicy(index)} className="mt-1 rounded-md border border-border px-2 py-0.5 text-[11px] hover:text-foreground">
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

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void submitSave()} disabled={state.saving} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-secondary disabled:opacity-60">
          {state.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </button>
        {descriptor.runAction ? (
          <>
            <button type="button" onClick={() => onRun({ dryRun: false })} disabled={state.running} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {state.running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Run
            </button>
            {descriptor.supportsDryRun ? (
              <button type="button" onClick={() => onRun({ dryRun: true })} disabled={state.running} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-secondary disabled:opacity-60">
                <RotateCcw className="h-3.5 w-3.5" />
                Dry run
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
