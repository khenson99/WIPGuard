import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSlackData } from "@/lib/analytics/fetchers-slack";

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("slack analytics fetcher", () => {
  it("follows conversations.history cursors so channel history does not stop at the first page", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const parsed = new URL(url);

      if (parsed.pathname === "/api/team.info") {
        return jsonResponse({ ok: true, team: { id: "T1", name: "Acme", domain: "acme" } });
      }

      if (parsed.pathname === "/api/conversations.list") {
        return jsonResponse({
          ok: true,
          channels: [
            {
              id: "C1",
              name: "customer-success",
              is_channel: true,
              is_private: false,
              is_archived: false,
              num_members: 12,
              updated: 1780240000,
            },
          ],
        });
      }

      if (parsed.pathname === "/api/users.list") {
        return jsonResponse({
          ok: true,
          members: [
            {
              id: "U1",
              name: "ada",
              real_name: "Ada Lovelace",
              deleted: false,
              is_bot: false,
              updated: 1780240000,
            },
          ],
        });
      }

      if (parsed.pathname === "/api/conversations.history") {
        if (parsed.searchParams.get("cursor") === "cursor_2") {
          return jsonResponse({
            ok: true,
            messages: [
              {
                ts: "1780240801.000000",
                user: "U1",
                text: "Second page customer signal",
                reply_count: 0,
              },
            ],
            response_metadata: { next_cursor: "" },
          });
        }

        return jsonResponse({
          ok: true,
          messages: [
            {
              ts: "1780240800.000000",
              user: "U1",
              text: "First page customer signal",
              reply_count: 2,
            },
          ],
          response_metadata: { next_cursor: "cursor_2" },
        });
      }

      throw new Error(`Unexpected Slack API request: ${parsed.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchSlackData({
      accessToken: "xoxb-token",
      fromDate: new Date("2026-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T00:00:00.000Z"),
      channelIds: ["C1"],
      maxMessagesPerChannel: 2,
    });

    const historyRequests = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname === "/api/conversations.history");

    expect(historyRequests).toHaveLength(2);
    expect(historyRequests[1]?.searchParams.get("cursor")).toBe("cursor_2");
    expect(data.messages).toEqual([
      expect.objectContaining({ ts: "1780240800.000000", text: "First page customer signal" }),
      expect.objectContaining({ ts: "1780240801.000000", text: "Second page customer signal" }),
    ]);
    expect(data._meta.messageCount).toBe(2);
  });

  it("marks Slack payloads truncated when message caps stop before Slack cursors are exhausted", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const parsed = new URL(url);

      if (parsed.pathname === "/api/team.info") {
        return jsonResponse({ ok: true, team: { id: "T1", name: "Acme", domain: "acme" } });
      }

      if (parsed.pathname === "/api/conversations.list") {
        return jsonResponse({
          ok: true,
          channels: [
            {
              id: "C1",
              name: "customer-success",
              is_channel: true,
              is_private: false,
              is_archived: false,
              num_members: 12,
              updated: 1780240000,
            },
          ],
        });
      }

      if (parsed.pathname === "/api/users.list") {
        return jsonResponse({ ok: true, members: [] });
      }

      if (parsed.pathname === "/api/conversations.history") {
        return jsonResponse({
          ok: true,
          messages: [
            {
              ts: "1780240800.000000",
              user: "U1",
              text: "First retained customer signal",
              reply_count: 2,
            },
          ],
          response_metadata: { next_cursor: "cursor_2" },
        });
      }

      throw new Error(`Unexpected Slack API request: ${parsed.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchSlackData({
      accessToken: "xoxb-token",
      fromDate: new Date("2026-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T00:00:00.000Z"),
      channelIds: ["C1"],
      maxMessagesPerChannel: 1,
    });

    expect(data.messages).toHaveLength(1);
    expect(data._meta).toEqual(expect.objectContaining({
      messageCount: 1,
      truncated: true,
      truncatedResources: ["messages"],
    }));
  });

  it("scans every loaded active Slack channel when channel IDs are not configured", async () => {
    const channels = Array.from({ length: 26 }, (_, index) => ({
      id: `C${index + 1}`,
      name: `channel-${index + 1}`,
      is_channel: true,
      is_private: false,
      is_archived: false,
      num_members: 3,
      updated: 1780240000 + index,
    }));
    const fetchMock = vi.fn(async (url: string) => {
      const parsed = new URL(url);

      if (parsed.pathname === "/api/team.info") {
        return jsonResponse({ ok: true, team: { id: "T1", name: "Acme", domain: "acme" } });
      }

      if (parsed.pathname === "/api/conversations.list") {
        return jsonResponse({ ok: true, channels });
      }

      if (parsed.pathname === "/api/users.list") {
        return jsonResponse({ ok: true, members: [] });
      }

      if (parsed.pathname === "/api/conversations.history") {
        return jsonResponse({ ok: true, messages: [] });
      }

      throw new Error(`Unexpected Slack API request: ${parsed.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchSlackData({
      accessToken: "xoxb-token",
      fromDate: new Date("2026-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T00:00:00.000Z"),
    });

    const historyRequests = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname === "/api/conversations.history");

    expect(historyRequests).toHaveLength(26);
    expect(data._meta).toEqual(expect.objectContaining({
      selectedChannelIds: [],
      truncated: false,
      truncatedResources: [],
    }));
  });

  it("keeps Slack records when provider timestamps are out of range", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const parsed = new URL(url);

      if (parsed.pathname === "/api/team.info") {
        return jsonResponse({ ok: true, team: { id: "T1", name: "Acme", domain: "acme" } });
      }

      if (parsed.pathname === "/api/conversations.list") {
        return jsonResponse({
          ok: true,
          channels: [
            {
              id: "C1",
              name: "customer-success",
              is_channel: true,
              is_private: false,
              is_archived: false,
              num_members: 12,
              updated: 1e20,
            },
          ],
        });
      }

      if (parsed.pathname === "/api/users.list") {
        return jsonResponse({
          ok: true,
          members: [
            {
              id: "U1",
              name: "ada",
              real_name: "Ada Lovelace",
              deleted: false,
              is_bot: false,
              updated: 1e20,
            },
          ],
        });
      }

      if (parsed.pathname === "/api/conversations.history") {
        return jsonResponse({
          ok: true,
          messages: [
            {
              ts: "100000000000000000000.000000",
              user: "U1",
              text: "Customer signal with malformed timestamp",
              reply_count: 2,
            },
          ],
        });
      }

      throw new Error(`Unexpected Slack API request: ${parsed.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchSlackData({
      accessToken: "xoxb-token",
      fromDate: new Date("2026-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T00:00:00.000Z"),
      channelIds: ["C1"],
      maxMessagesPerChannel: 1,
    });

    expect(data.channels).toEqual([
      expect.objectContaining({ id: "C1", updatedAt: null }),
    ]);
    expect(data.users).toEqual([
      expect.objectContaining({ id: "U1", updatedAt: null }),
    ]);
    expect(data.messages).toEqual([
      expect.objectContaining({
        ts: "100000000000000000000.000000",
        text: "Customer signal with malformed timestamp",
        occurredAt: null,
      }),
    ]);
    expect(data._meta).toEqual(expect.objectContaining({
      channelCount: 1,
      userCount: 1,
      messageCount: 1,
    }));
  });
});
