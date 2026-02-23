import type { PylonData } from "@/lib/analytics/types";

function nowMeta(source: "live" | "cached"): PylonData["_meta"] {
  const fetchedAt = new Date().toISOString();
  return {
    fetchedAt,
    nextRefresh: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    source,
  };
}

function parseTickets(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.data)) return record.data.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
  if (Array.isArray(record.items)) return record.items.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
  if (Array.isArray(record.conversations)) {
    return record.conversations.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
  }
  return [];
}

function isUrgent(ticket: Record<string, unknown>): boolean {
  const priority = typeof ticket.priority === "string" ? ticket.priority.toLowerCase() : "";
  const tags = Array.isArray(ticket.tags) ? ticket.tags.map((tag) => String(tag).toLowerCase()) : [];
  return priority === "urgent" || priority === "high" || tags.includes("urgent");
}

function isWaitingOnTeam(ticket: Record<string, unknown>): boolean {
  const status = typeof ticket.status === "string" ? ticket.status.toLowerCase() : "";
  return status.includes("waiting_on_team") || status.includes("pending_internal") || status.includes("open");
}

function isResolved(ticket: Record<string, unknown>): boolean {
  const status = typeof ticket.status === "string" ? ticket.status.toLowerCase() : "";
  return status.includes("resolved") || status.includes("closed");
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export async function fetchPylonData(input: {
  apiKey: string;
  from: string;
  to: string;
  baseUrl?: string;
}): Promise<PylonData> {
  const baseUrl = input.baseUrl || process.env.PYLON_API_BASE_URL || "https://api.usepylon.com/v1";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const query = new URLSearchParams({
      limit: "200",
      from: input.from,
      to: input.to,
    });

    const response = await fetch(`${baseUrl}/issues?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Pylon request failed (${response.status})`);
    }

    const payload = (await response.json()) as unknown;
    const tickets = parseTickets(payload);

    const openConversations = tickets.filter((ticket) => !isResolved(ticket)).length;
    const urgentConversations = tickets.filter((ticket) => isUrgent(ticket) && !isResolved(ticket)).length;
    const waitingOnTeam = tickets.filter((ticket) => isWaitingOnTeam(ticket) && !isResolved(ticket)).length;
    const resolvedInRange = tickets.filter(isResolved).length;

    const firstResponseSamples = tickets
      .map((ticket) => parseNumber(ticket.firstResponseMinutes ?? ticket.first_response_minutes))
      .filter((value): value is number => value !== null);

    const csatSamples = tickets
      .map((ticket) => parseNumber(ticket.csat ?? ticket.customerSatisfaction))
      .filter((value): value is number => value !== null);

    return {
      openConversations,
      urgentConversations,
      waitingOnTeam,
      resolvedInRange,
      avgFirstResponseMinutes:
        firstResponseSamples.length > 0
          ? Math.round(
              (firstResponseSamples.reduce((sum, value) => sum + value, 0) / firstResponseSamples.length) *
                100
            ) / 100
          : null,
      csat:
        csatSamples.length > 0
          ? Math.round((csatSamples.reduce((sum, value) => sum + value, 0) / csatSamples.length) * 100) / 100
          : null,
      _meta: nowMeta("live"),
    };
  } finally {
    clearTimeout(timeout);
  }
}

