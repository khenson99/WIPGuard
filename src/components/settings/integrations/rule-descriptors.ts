import type { RuleDescriptor } from "@/components/settings/integrations/types";

export const TASK_STATUS_OPTIONS = [
  { label: "Queued", value: "QUEUED" },
  { label: "Active", value: "ACTIVE" },
  { label: "Not Done", value: "NOT_DONE" },
] as const;

  {
    id: "pylon-conversation-sync",
    provider: "pylon",
    title: "Pylon Conversation Sync",
    ruleKey: "pylon_conversation_sync",
    endpoint: "/api/integrations/pylon/conversation-sync",
    runAction: "sync",
    supportsDryRun: true,
    supportsStatusOverride: true,
    editorType: "generic",
    fields: [
      { key: "rangePreset", label: "Range", type: "enum", options: [...RANGE_PRESET_OPTIONS] },
      { key: "contextKey", label: "Context Key", type: "text" },
    ],
  },
  {
    id: "pylon-issue-task-sync",
    provider: "pylon",
    title: "Pylon Issues → Task Sync",
    ruleKey: "pylon_issue_task_sync",
    endpoint: "/api/integrations/pylon/issue-task-sync",
    runAction: "sync",
    supportsDryRun: true,
    supportsStatusOverride: true,
    editorType: "generic",
    fields: [
      { key: "rangePreset", label: "Range", type: "enum", options: [...RANGE_PRESET_OPTIONS] },
      { key: "onlyUrgent", label: "Only Urgent", type: "boolean" },
      { key: "includeTags", label: "Include Tags", type: "string-list", description: "One tag per line." },
      { key: "excludeTags", label: "Exclude Tags", type: "string-list", description: "One tag per line." },
      { key: "defaultTaskStatus", label: "Default Task Status", type: "enum", options: [...TASK_STATUS_OPTIONS] },
      { key: "pylonStatusToTaskStatus", label: "Pylon Status → Task Status", type: "string-status-map" },
    ],
  },
];

export function descriptorsForProvider(provider: string): RuleDescriptor[] {
  return RULE_DESCRIPTORS.filter((descriptor) => descriptor.provider === provider);
}
