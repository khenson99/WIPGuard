import type { RuleDescriptor } from "@/components/settings/integrations/types";

export const RANGE_PRESET_OPTIONS = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
] as const;

export const RULE_DESCRIPTORS: RuleDescriptor[] = [
  {
    id: "slack-channel-routing",
    provider: "slack",
    title: "Slack Channel Routing",
    ruleKey: "slack_channel_routing",
    endpoint: "/api/integrations/slack/channel-routing",
    runAction: null,
    supportsDryRun: false,
    editorType: "channel-routing",
    fields: [
      { key: "defaultChannelId", label: "Default Channel ID", type: "text" },
      { key: "fallbackToDm", label: "Fallback To DM", type: "boolean" },
    ],
  },
  {
    id: "pylon-conversation-sync",
    provider: "pylon",
    title: "Pylon Conversation Sync",
    ruleKey: "pylon_conversation_sync",
    endpoint: "/api/integrations/pylon/conversation-sync",
    runAction: "sync",
    supportsDryRun: true,
    editorType: "generic",
    fields: [
      { key: "rangePreset", label: "Range", type: "enum", options: [...RANGE_PRESET_OPTIONS] },
      { key: "contextKey", label: "Context Key", type: "text" },
    ],
  },
  {
    id: "linear-issue-sync",
    provider: "linear",
    title: "Linear Issue Sync",
    ruleKey: "linear_issues_sync",
    endpoint: "/api/integrations/linear/issue-sync",
    runAction: "sync",
    supportsDryRun: true,
    editorType: "generic",
    fields: [
      { key: "rangePreset", label: "Range", type: "enum", options: [...RANGE_PRESET_OPTIONS] },
      { key: "contextKey", label: "Context Key", type: "text" },
    ],
  },
];

export function descriptorsForProvider(provider: string): RuleDescriptor[] {
  return RULE_DESCRIPTORS.filter((descriptor) => descriptor.provider === provider);
}
