/**
 * Slack RACI Mention-to-Notification Bridge
 *
 * When a RACI field changes on a task (or a task event occurs), this bridge
 * resolves which users should be notified and routes Slack notifications
 * accordingly.
 *
 * RACI -> Notification mapping:
 *  - Responsible: assignment + status_change + blocked
 *  - Accountable: status_change + blocked
 *  - Consulted:   mention (when added)
 *  - Informed:    status_change (major transitions only)
 *
 * Uses the channel routing service to determine where to send each
 * notification (DM vs. project channel vs. priority channel).
 */

import { prisma } from "@/lib/prisma";
import { IntegrationConnectionStatus, IntegrationProvider } from "@/generated/prisma/client";
import type { RaciUser, ResolvedRaci } from "@/lib/raci-inheritance";
import {
  sendSlackNotification,
  type SlackNotificationPayload,
  type SlackNotificationType,
  type ThrottleConfig,
} from "@/lib/integrations/slack-notifications";
import {
  resolveChannelForNotification,
  type ChannelRoutingContext,
} from "@/lib/integrations/slack-channel-routing";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RaciRole = "responsible" | "accountable" | "consulted" | "informed";

export interface RaciBridgeEvent {
  /** The type of event that occurred */
  eventType: "raci_change" | "status_change" | "blocked" | "unblocked" | "assignment";
  /** The task this event relates to */
  taskId: string;
  taskTitle: string;
  /** Project context for channel routing */
  projectId?: string | null;
  projectName?: string | null;
  /** Priority for channel routing */
  priority?: string | null;
  /** Who caused the event */
  actorId?: string | null;
  actorName?: string | null;
  /** Additional context */
  context?: Record<string, string>;
  /** For raci_change events: which role was changed */
  changedRole?: RaciRole;
  /** For raci_change events: which users were added */
  addedUsers?: RaciUser[];
  /** For raci_change events: which users were removed */
  removedUsers?: RaciUser[];
}

export interface RaciBridgeResult {
  notificationsSent: number;
  notificationsThrottled: number;
  notificationsFailed: number;
  details: Array<{
    userId: string;
    role: RaciRole;
    notificationType: SlackNotificationType;
    sent: boolean;
    throttled: boolean;
    channelId: string | null;
    error?: string;
  }>;
}

// ---------------------------------------------------------------------------
// RACI -> Notification type mapping
// ---------------------------------------------------------------------------

/**
 * Determine which notification types to send for each RACI role
 * given a particular event type.
 */
export function getNotificationTypesForRole(
  role: RaciRole,
  eventType: RaciBridgeEvent["eventType"]
): SlackNotificationType[] {
  const mapping: Record<RaciRole, Record<RaciBridgeEvent["eventType"], SlackNotificationType[]>> = {
    responsible: {
      raci_change: ["assignment"],
      status_change: ["status_change"],
      blocked: ["blocked"],
      unblocked: ["unblocked"],
      assignment: ["assignment"],
    },
    accountable: {
      raci_change: ["mention"],
      status_change: ["status_change"],
      blocked: ["blocked"],
      unblocked: ["unblocked"],
      assignment: [],
    },
    consulted: {
      raci_change: ["mention"],
      status_change: [],
      blocked: [],
      unblocked: [],
      assignment: [],
    },
    informed: {
      raci_change: ["mention"],
      status_change: ["status_change"],
      blocked: [],
      unblocked: [],
      assignment: [],
    },
  };

  return mapping[role]?.[eventType] ?? [];
}

/**
 * Determine which RACI roles should be notified for a given event type.
 */
export function getRolesToNotify(
  eventType: RaciBridgeEvent["eventType"]
): RaciRole[] {
  switch (eventType) {
    case "raci_change":
      // Only notify the users who were specifically added
      return [];
    case "status_change":
      return ["responsible", "accountable", "informed"];
    case "blocked":
      return ["responsible", "accountable"];
    case "unblocked":
      return ["responsible", "accountable"];
    case "assignment":
      return ["responsible"];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// User -> Slack channel resolution
// ---------------------------------------------------------------------------

async function getUserSlackChannelId(userId: string): Promise<string | null> {
  // For DM notifications, we look up the user's Slack connection
  // and use the Slack user ID to open a DM channel
  const connection = await prisma.integrationConnection.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: IntegrationProvider.SLACK,
      },
    },
    select: {
      status: true,
      providerAccountId: true,
      metadata: true,
    },
  });

  if (!connection || connection.status !== IntegrationConnectionStatus.CONNECTED) {
    return null;
  }

  // The providerAccountId typically stores the Slack user ID
  return connection.providerAccountId ?? null;
}

// ---------------------------------------------------------------------------
// Bridge main function
// ---------------------------------------------------------------------------

/**
 * Process a RACI-related event and send appropriate Slack notifications
 * to all affected users based on their RACI roles.
 */
export async function processRaciBridgeEvent(input: {
  event: RaciBridgeEvent;
  raci: ResolvedRaci;
  throttleConfig?: ThrottleConfig;
  dryRun?: boolean;
}): Promise<RaciBridgeResult> {
  const { event, raci } = input;
  const result: RaciBridgeResult = {
    notificationsSent: 0,
    notificationsThrottled: 0,
    notificationsFailed: 0,
    details: [],
  };

  // Build routing context
  const routingContext: ChannelRoutingContext = {
    projectId: event.projectId ?? undefined,
    priority: event.priority ?? undefined,
    notificationType: event.eventType === "blocked" ? "blocked" : "status_change",
  };

  // For raci_change events, only notify the newly added users
  if (event.eventType === "raci_change" && event.addedUsers && event.changedRole) {
    for (const user of event.addedUsers) {
      const notificationTypes = getNotificationTypesForRole(event.changedRole, event.eventType);
      for (const notificationType of notificationTypes) {
        await sendNotificationForUser({
          userId: user.id,
          role: event.changedRole,
          notificationType,
          event,
          routingContext,
          throttleConfig: input.throttleConfig,
          dryRun: input.dryRun,
          result,
        });
      }
    }
    return result;
  }

  // For other events, notify all relevant RACI roles
  const rolesToNotify = getRolesToNotify(event.eventType);

  for (const role of rolesToNotify) {
    const users = raci.effective[role];
    for (const user of users) {
      // Skip the actor (don't notify yourself)
      if (event.actorId && user.id === event.actorId) {
        continue;
      }

      const notificationTypes = getNotificationTypesForRole(role, event.eventType);
      for (const notificationType of notificationTypes) {
        await sendNotificationForUser({
          userId: user.id,
          role,
          notificationType,
          event,
          routingContext,
          throttleConfig: input.throttleConfig,
          dryRun: input.dryRun,
          result,
        });
      }
    }
  }

  return result;
}

async function sendNotificationForUser(input: {
  userId: string;
  role: RaciRole;
  notificationType: SlackNotificationType;
  event: RaciBridgeEvent;
  routingContext: ChannelRoutingContext;
  throttleConfig?: ThrottleConfig;
  dryRun?: boolean;
  result: RaciBridgeResult;
}): Promise<void> {
  const { userId, role, notificationType, event, result } = input;

  // Resolve which channel to send to
  let channelId: string | null = null;

  try {
    // First try channel routing (project/priority channel)
    const routed = resolveChannelForNotification(input.routingContext);
    channelId = routed?.channelId ?? null;

    // Fall back to user DM if no channel routing match
    if (!channelId) {
      channelId = await getUserSlackChannelId(userId);
    }

    if (!channelId) {
      result.details.push({
        userId,
        role,
        notificationType,
        sent: false,
        throttled: false,
        channelId: null,
        error: "No Slack channel or DM available",
      });
      return;
    }

    const payload: SlackNotificationPayload = {
      type: notificationType,
      taskId: event.taskId,
      taskTitle: event.taskTitle,
      projectId: event.projectId,
      projectName: event.projectName,
      priority: event.priority,
      channelId,
      actorId: event.actorId,
      actorName: event.actorName,
      context: {
        ...event.context,
        role,
      },
    };

    const notifResult = await sendSlackNotification({
      userId,
      payload,
      throttleConfig: input.throttleConfig,
      dryRun: input.dryRun,
    });

    if (notifResult.throttled) {
      result.notificationsThrottled += 1;
    } else if (notifResult.sent) {
      result.notificationsSent += 1;
    }

    result.details.push({
      userId,
      role,
      notificationType,
      sent: notifResult.sent,
      throttled: notifResult.throttled,
      channelId,
    });
  } catch (error) {
    result.notificationsFailed += 1;
    result.details.push({
      userId,
      role,
      notificationType,
      sent: false,
      throttled: false,
      channelId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
