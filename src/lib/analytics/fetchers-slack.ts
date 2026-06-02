import { fetchJsonWithResilience } from "@/lib/integrations/http-client";

const SLACK_API_BASE_URL = "https://slack.com/api";
const DEFAULT_MAX_CHANNELS = 200;
const DEFAULT_MAX_USERS = 500;
const DEFAULT_MAX_MESSAGES_PER_CHANNEL = 100;

type SlackApiResponse<T extends Record<string, unknown>> = T & {
  ok?: boolean;
  error?: string;
  response_metadata?: {
    next_cursor?: string;
  };
};

export interface SlackChannelRecord {
  id: string;
  name: string;
  isChannel: boolean;
  isPrivate: boolean;
  isArchived: boolean;
  numMembers: number | null;
  updatedAt: string | null;
}

export interface SlackUserRecord {
  id: string;
  name: string;
  realName: string | null;
  deleted: boolean;
  isBot: boolean;
  updatedAt: string | null;
}

export interface SlackMessageRecord {
  channelId: string;
  channelName: string | null;
  ts: string;
  userId: string | null;
  text: string;
  replyCount: number;
  occurredAt: string | null;
}

export interface SlackData {
  team: {
    id: string | null;
    name: string | null;
    domain: string | null;
  };
  channels: SlackChannelRecord[];
  users: SlackUserRecord[];
  messages: SlackMessageRecord[];
  _meta: {
    fetchedAt: string;
    channelCount: number;
    userCount: number;
    messageCount: number;
    selectedChannelIds: string[];
    truncated: boolean;
    truncatedResources: string[];
    source: "live";
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function slackSecondsToIsoOrNull(value: unknown): string | null {
  const seconds =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  if (!Number.isFinite(seconds)) return null;
  const date = new Date(Math.round(seconds * 1000));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateToSlackSeconds(value: Date): string {
  return Math.floor(value.getTime() / 1000).toString();
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

async function fetchSlackJson<T extends Record<string, unknown>>(
  accessToken: string,
  path: string,
  params: Record<string, string>,
): Promise<SlackApiResponse<T>> {
  const url = new URL(`${SLACK_API_BASE_URL}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const payload = await fetchJsonWithResilience<SlackApiResponse<T>>({
    url: url.toString(),
    init: {
      method: "GET",
      headers: authHeaders(accessToken),
      cache: "no-store",
    },
    timeoutMs: 12_000,
    maxAttempts: 3,
  });

  if (payload.ok === false) {
    throw new Error(`Slack API error: ${payload.error || path}`);
  }

  return payload;
}

async function fetchTeam(accessToken: string): Promise<SlackData["team"]> {
  const payload = await fetchSlackJson<{ team?: unknown }>(accessToken, "team.info", {});
  const team = asRecord(payload.team);
  return {
    id: asString(team.id),
    name: asString(team.name),
    domain: asString(team.domain),
  };
}

async function fetchChannels(accessToken: string, maxChannels: number): Promise<{
  channels: SlackChannelRecord[];
  truncated: boolean;
}> {
  const channels: SlackChannelRecord[] = [];
  let cursor = "";
  let truncated = false;

  while (channels.length < maxChannels) {
    const payload = await fetchSlackJson<{ channels?: unknown }>(accessToken, "conversations.list", {
      limit: String(Math.min(200, maxChannels - channels.length)),
      exclude_archived: "false",
      types: "public_channel,private_channel",
      cursor,
    });
    const rows = Array.isArray(payload.channels) ? payload.channels : [];

    for (const row of rows) {
      const channel = asRecord(row);
      const id = asString(channel.id);
      if (!id) continue;
      channels.push({
        id,
        name: asString(channel.name) ?? id,
        isChannel: asBoolean(channel.is_channel),
        isPrivate: asBoolean(channel.is_private),
        isArchived: asBoolean(channel.is_archived),
        numMembers: asNumber(channel.num_members),
        updatedAt: slackSecondsToIsoOrNull(channel.updated),
      });
    }

    cursor = payload.response_metadata?.next_cursor?.trim() ?? "";
    if (!cursor) break;
  }

  if (cursor) truncated = true;

  return { channels, truncated };
}

async function fetchUsers(accessToken: string, maxUsers: number): Promise<{
  users: SlackUserRecord[];
  truncated: boolean;
}> {
  const users: SlackUserRecord[] = [];
  let cursor = "";
  let truncated = false;

  while (users.length < maxUsers) {
    const payload = await fetchSlackJson<{ members?: unknown }>(accessToken, "users.list", {
      limit: String(Math.min(200, maxUsers - users.length)),
      cursor,
    });
    const rows = Array.isArray(payload.members) ? payload.members : [];

    for (const row of rows) {
      const user = asRecord(row);
      const id = asString(user.id);
      if (!id) continue;
      const profile = asRecord(user.profile);
      users.push({
        id,
        name: asString(user.name) ?? id,
        realName: asString(user.real_name) ?? asString(profile.real_name),
        deleted: asBoolean(user.deleted),
        isBot: asBoolean(user.is_bot),
        updatedAt: slackSecondsToIsoOrNull(user.updated),
      });
    }

    cursor = payload.response_metadata?.next_cursor?.trim() ?? "";
    if (!cursor) break;
  }

  if (cursor) truncated = true;

  return { users, truncated };
}

async function fetchMessages(input: {
  accessToken: string;
  channels: SlackChannelRecord[];
  selectedChannelIds: string[];
  fromDate: Date;
  toDate: Date;
  maxMessagesPerChannel: number;
}): Promise<{
  messages: SlackMessageRecord[];
  truncated: boolean;
}> {
  const channelById = new Map(input.channels.map((channel) => [channel.id, channel]));
  const activeChannels = input.channels.filter((channel) => !channel.isArchived);
  const selected =
    input.selectedChannelIds.length > 0
      ? input.selectedChannelIds
      : activeChannels
          .map((channel) => channel.id);
  const messages: SlackMessageRecord[] = [];
  let truncated = false;

  for (const channelId of selected) {
    const channel = channelById.get(channelId);
    let cursor = "";
    let channelMessageCount = 0;

    while (channelMessageCount < input.maxMessagesPerChannel) {
      const remaining = input.maxMessagesPerChannel - channelMessageCount;
      const payload = await fetchSlackJson<{ messages?: unknown }>(
        input.accessToken,
        "conversations.history",
        {
          channel: channelId,
          limit: String(Math.min(200, remaining)),
          oldest: dateToSlackSeconds(input.fromDate),
          latest: dateToSlackSeconds(input.toDate),
          inclusive: "true",
          cursor,
        },
      );
      const rows = Array.isArray(payload.messages) ? payload.messages : [];

      for (const row of rows) {
        if (channelMessageCount >= input.maxMessagesPerChannel) {
          truncated = true;
          break;
        }
        const message = asRecord(row);
        const ts = asString(message.ts);
        if (!ts) continue;
        messages.push({
          channelId,
          channelName: channel?.name ?? null,
          ts,
          userId: asString(message.user),
          text: asString(message.text) ?? "",
          replyCount: asNumber(message.reply_count) ?? 0,
          occurredAt: slackSecondsToIsoOrNull(ts),
        });
        channelMessageCount += 1;
      }

      cursor = payload.response_metadata?.next_cursor?.trim() ?? "";
      if (!cursor || rows.length === 0) break;
    }

    if (cursor) truncated = true;
  }

  return { messages, truncated };
}

export async function fetchSlackData(input: {
  accessToken: string;
  fromDate: Date;
  toDate: Date;
  channelIds?: string[];
  maxChannels?: number;
  maxUsers?: number;
  maxMessagesPerChannel?: number;
}): Promise<SlackData> {
  const accessToken = input.accessToken.trim();
  if (!accessToken) {
    throw new Error("Missing Slack access token");
  }

  const maxChannels = Math.max(1, input.maxChannels ?? DEFAULT_MAX_CHANNELS);
  const maxUsers = Math.max(1, input.maxUsers ?? DEFAULT_MAX_USERS);
  const maxMessagesPerChannel = Math.max(
    1,
    input.maxMessagesPerChannel ?? DEFAULT_MAX_MESSAGES_PER_CHANNEL,
  );

  const [team, channelResult, userResult] = await Promise.all([
    fetchTeam(accessToken),
    fetchChannels(accessToken, maxChannels),
    fetchUsers(accessToken, maxUsers),
  ]);
  const channels = channelResult.channels;
  const users = userResult.users;
  const selectedChannelIds = (input.channelIds ?? [])
    .map((channelId) => channelId.trim())
    .filter(Boolean);
  const messageResult = await fetchMessages({
    accessToken,
    channels,
    selectedChannelIds,
    fromDate: input.fromDate,
    toDate: input.toDate,
    maxMessagesPerChannel,
  });
  const messages = messageResult.messages;
  const truncatedResources = [
    ...(channelResult.truncated ? ["channels"] : []),
    ...(userResult.truncated ? ["users"] : []),
    ...(messageResult.truncated ? ["messages"] : []),
  ];

  return {
    team,
    channels,
    users,
    messages,
    _meta: {
      fetchedAt: new Date().toISOString(),
      channelCount: channels.length,
      userCount: users.length,
      messageCount: messages.length,
      selectedChannelIds,
      truncated: truncatedResources.length > 0,
      truncatedResources,
      source: "live",
    },
  };
}
