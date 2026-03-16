const EXECUTABLE_RECOMMENDATION_ACTION_TYPES = new Set([
  "create_gmail_draft",
  "send_gmail_message",
  "create_calendar_draft",
  "update_hubspot",
  "create_hubspot_task",
  "create_github_issue",
  "post_slack_digest",
]);

export const MANUAL_EXECUTION_REQUIRED_MESSAGE =
  "Recommendation requires manual execution";

export function canExecuteRecommendationAction(actionType: string): boolean {
  return EXECUTABLE_RECOMMENDATION_ACTION_TYPES.has(actionType);
}
