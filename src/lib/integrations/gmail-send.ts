/**
 * Send an email as a user's connected Google Workspace (Gmail) account.
 *
 * Thin wrapper over the Gmail `messages/send` API used by both the automation
 * `send_gmail_message` action and customer-success outreach delivery, so the
 * raw-MIME construction and auth live in one place.
 */
import { IntegrationProvider } from "@/generated/prisma/client";
import { getValidIntegrationAccessToken } from "@/lib/integrations/token-refresh";
import { fetchJsonWithResilience } from "@/lib/integrations/http-client";

export interface GmailMessageInput {
  /** App user whose connected Google Workspace account sends the message. */
  userId: string;
  to: string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildRawMessage(input: Omit<GmailMessageInput, "userId">): string {
  const lines = [
    `To: ${input.to.join(", ")}`,
    ...(input.cc && input.cc.length > 0 ? [`Cc: ${input.cc.join(", ")}`] : []),
    ...(input.bcc && input.bcc.length > 0 ? [`Bcc: ${input.bcc.join(", ")}`] : []),
    `Subject: ${input.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    input.body,
  ];
  return base64UrlEncode(lines.join("\r\n"));
}

/**
 * Send an email and return the Gmail message id. Throws if the user has no
 * connected Google Workspace account or the API call fails.
 */
export async function sendGmailMessage(
  input: GmailMessageInput
): Promise<{ id: string | null }> {
  if (input.to.length === 0) {
    throw new Error("sendGmailMessage: at least one recipient is required");
  }

  const token = await getValidIntegrationAccessToken({
    userId: input.userId,
    provider: IntegrationProvider.GOOGLE_WORKSPACE,
  });

  const response = await fetchJsonWithResilience<{ id?: string }>({
    url: "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: buildRawMessage(input) }),
    },
    timeoutMs: 12_000,
    maxAttempts: 3,
  });

  return { id: response.id ?? null };
}
