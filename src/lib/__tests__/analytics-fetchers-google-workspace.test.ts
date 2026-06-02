import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGoogleWorkspaceData } from "@/lib/analytics/fetchers-google-workspace";

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonStatusResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("google workspace analytics fetcher", () => {
  it("follows Calendar, Gmail, and Drive page tokens across the requested sync window", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const parsed = new URL(url);

      if (parsed.pathname === "/gmail/v1/users/me/profile") {
        return jsonResponse({
          emailAddress: "founder@example.com",
          messagesTotal: 1000,
          threadsTotal: 500,
        });
      }

      if (parsed.pathname === "/calendar/v3/calendars/primary/events") {
        if (parsed.searchParams.get("pageToken") === "calendar_page_2") {
          return jsonResponse({
            items: [
              {
                id: "event_2",
                summary: "Customer renewal",
                status: "confirmed",
                start: { dateTime: "2026-05-31T18:00:00.000Z" },
                end: { dateTime: "2026-05-31T18:30:00.000Z" },
                updated: "2026-05-31T18:15:00.000Z",
              },
            ],
          });
        }

        return jsonResponse({
          items: [
            {
              id: "event_1",
              summary: "Pipeline review",
              status: "confirmed",
              start: { dateTime: "2026-05-30T18:00:00.000Z" },
              end: { dateTime: "2026-05-30T18:30:00.000Z" },
              updated: "2026-05-30T18:15:00.000Z",
            },
          ],
          nextPageToken: "calendar_page_2",
        });
      }

      if (parsed.pathname === "/gmail/v1/users/me/messages") {
        if (parsed.searchParams.get("pageToken") === "gmail_page_2") {
          return jsonResponse({
            messages: [{ id: "message_2", threadId: "thread_2" }],
          });
        }

        return jsonResponse({
          messages: [{ id: "message_1", threadId: "thread_1" }],
          nextPageToken: "gmail_page_2",
        });
      }

      if (parsed.pathname === "/gmail/v1/users/me/messages/message_1") {
        return jsonResponse({
          id: "message_1",
          threadId: "thread_1",
          internalDate: "1780240800000",
          snippet: "First email signal",
          labelIds: ["INBOX"],
          payload: {
            headers: [
              { name: "Subject", value: "First signal" },
              { name: "From", value: "buyer@example.com" },
              { name: "To", value: "founder@example.com" },
            ],
          },
        });
      }

      if (parsed.pathname === "/gmail/v1/users/me/messages/message_2") {
        return jsonResponse({
          id: "message_2",
          threadId: "thread_2",
          internalDate: "1780240860000",
          snippet: "Second email signal",
          labelIds: ["INBOX"],
          payload: {
            headers: [
              { name: "Subject", value: "Second signal" },
              { name: "From", value: "champion@example.com" },
              { name: "To", value: "founder@example.com" },
            ],
          },
        });
      }

      if (parsed.pathname === "/drive/v3/files") {
        if (parsed.searchParams.get("pageToken") === "drive_page_2") {
          return jsonResponse({
            files: [
              {
                id: "file_2",
                name: "Renewal notes",
                mimeType: "application/vnd.google-apps.document",
                webViewLink: "https://docs.google.com/document/d/file_2",
                modifiedTime: "2026-05-31T12:00:00.000Z",
                owners: [{ emailAddress: "founder@example.com" }],
              },
            ],
          });
        }

        return jsonResponse({
          files: [
            {
              id: "file_1",
              name: "Pipeline notes",
              mimeType: "application/vnd.google-apps.document",
              webViewLink: "https://docs.google.com/document/d/file_1",
              modifiedTime: "2026-05-30T12:00:00.000Z",
              owners: [{ emailAddress: "founder@example.com" }],
            },
          ],
          nextPageToken: "drive_page_2",
        });
      }

      throw new Error(`Unexpected Google Workspace request: ${parsed.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchGoogleWorkspaceData({
      accessToken: "google-token",
      fromDate: new Date("2026-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T00:00:00.000Z"),
      maxCalendarEvents: 2,
      maxEmailThreads: 2,
      maxDocuments: 2,
    });

    const urls = fetchMock.mock.calls.map(([url]) => new URL(String(url)));
    const calendarRequests = urls.filter((url) => url.pathname === "/calendar/v3/calendars/primary/events");
    const gmailListRequests = urls.filter((url) => url.pathname === "/gmail/v1/users/me/messages");
    const driveRequests = urls.filter((url) => url.pathname === "/drive/v3/files");

    expect(calendarRequests).toHaveLength(2);
    expect(calendarRequests[1]?.searchParams.get("pageToken")).toBe("calendar_page_2");
    expect(gmailListRequests).toHaveLength(2);
    expect(gmailListRequests[1]?.searchParams.get("pageToken")).toBe("gmail_page_2");
    expect(gmailListRequests[0]?.searchParams.get("q")).toBe("after:2026/05/01 before:2026/06/02");
    expect(driveRequests).toHaveLength(2);
    expect(driveRequests[1]?.searchParams.get("pageToken")).toBe("drive_page_2");
    expect(String(driveRequests[0]?.searchParams.get("q"))).toContain(
      "modifiedTime <= '2026-06-01T00:00:00.000Z'",
    );

    expect(data.calendarEvents.map((event) => event.eventId)).toEqual(["event_1", "event_2"]);
    expect(data.emailThreads.map((thread) => thread.threadId)).toEqual(["thread_1", "thread_2"]);
    expect(data.documents.map((document) => document.fileId)).toEqual(["file_1", "file_2"]);
    expect(data._meta).toEqual(expect.objectContaining({
      calendarEventCount: 2,
      emailThreadCount: 2,
      documentCount: 2,
    }));
  });

  it("marks Google Workspace payloads truncated when Gmail caps stop before page tokens are exhausted", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const parsed = new URL(url);

      if (parsed.pathname === "/gmail/v1/users/me/profile") {
        return jsonResponse({
          emailAddress: "founder@example.com",
          messagesTotal: 1000,
          threadsTotal: 500,
        });
      }

      if (parsed.pathname === "/calendar/v3/calendars/primary/events") {
        return jsonResponse({ items: [] });
      }

      if (parsed.pathname === "/gmail/v1/users/me/messages") {
        return jsonResponse({
          messages: [{ id: "message_1", threadId: "thread_1" }],
          nextPageToken: "gmail_page_2",
        });
      }

      if (parsed.pathname === "/gmail/v1/users/me/messages/message_1") {
        return jsonResponse({
          id: "message_1",
          threadId: "thread_1",
          internalDate: "1780240800000",
          snippet: "First email signal",
          labelIds: ["INBOX"],
          payload: {
            headers: [
              { name: "Subject", value: "First signal" },
              { name: "From", value: "buyer@example.com" },
              { name: "To", value: "founder@example.com" },
            ],
          },
        });
      }

      if (parsed.pathname === "/drive/v3/files") {
        return jsonResponse({ files: [] });
      }

      throw new Error(`Unexpected Google Workspace request: ${parsed.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchGoogleWorkspaceData({
      accessToken: "google-token",
      fromDate: new Date("2026-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T00:00:00.000Z"),
      maxEmailThreads: 1,
    });

    expect(data.emailThreads).toHaveLength(1);
    expect(data._meta).toEqual(expect.objectContaining({
      emailThreadCount: 1,
      truncated: true,
      truncatedResources: ["emailThreads"],
    }));
  });

  it("keeps Gmail threads when a message has a malformed internalDate", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const parsed = new URL(url);

      if (parsed.pathname === "/gmail/v1/users/me/profile") {
        return jsonResponse({
          emailAddress: "founder@example.com",
          messagesTotal: 1000,
          threadsTotal: 500,
        });
      }

      if (parsed.pathname === "/calendar/v3/calendars/primary/events") {
        return jsonResponse({ items: [] });
      }

      if (parsed.pathname === "/gmail/v1/users/me/messages") {
        return jsonResponse({
          messages: [{ id: "message_bad_date", threadId: "thread_bad_date" }],
        });
      }

      if (parsed.pathname === "/gmail/v1/users/me/messages/message_bad_date") {
        return jsonResponse({
          id: "message_bad_date",
          threadId: "thread_bad_date",
          internalDate: "not-a-timestamp",
          snippet: "Useful customer signal with malformed provider metadata",
          labelIds: ["INBOX"],
          payload: {
            headers: [
              { name: "Subject", value: "Malformed timestamp signal" },
              { name: "From", value: "buyer@example.com" },
              { name: "To", value: "founder@example.com" },
            ],
          },
        });
      }

      if (parsed.pathname === "/drive/v3/files") {
        return jsonResponse({ files: [] });
      }

      throw new Error(`Unexpected Google Workspace request: ${parsed.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchGoogleWorkspaceData({
      accessToken: "google-token",
      fromDate: new Date("2026-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T00:00:00.000Z"),
      maxEmailThreads: 1,
    });

    expect(data.emailThreads).toEqual([
      expect.objectContaining({
        threadId: "thread_bad_date",
        messageId: "message_bad_date",
        subject: "Malformed timestamp signal",
        occurredAt: null,
      }),
    ]);
    expect(data._meta.emailThreadCount).toBe(1);
  });

  it("keeps later Gmail threads when one listed message detail is missing", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const parsed = new URL(url);

      if (parsed.pathname === "/gmail/v1/users/me/profile") {
        return jsonResponse({
          emailAddress: "founder@example.com",
          messagesTotal: 1000,
          threadsTotal: 500,
        });
      }

      if (parsed.pathname === "/calendar/v3/calendars/primary/events") {
        return jsonResponse({ items: [] });
      }

      if (parsed.pathname === "/gmail/v1/users/me/messages") {
        return jsonResponse({
          messages: [
            { id: "message_missing", threadId: "thread_missing" },
            { id: "message_present", threadId: "thread_present" },
          ],
        });
      }

      if (parsed.pathname === "/gmail/v1/users/me/messages/message_missing") {
        return jsonStatusResponse({ error: { message: "Message not found" } }, 404);
      }

      if (parsed.pathname === "/gmail/v1/users/me/messages/message_present") {
        return jsonResponse({
          id: "message_present",
          threadId: "thread_present",
          internalDate: "1780240800000",
          snippet: "Retained customer signal",
          labelIds: ["INBOX"],
          payload: {
            headers: [
              { name: "Subject", value: "Retained signal" },
              { name: "From", value: "buyer@example.com" },
              { name: "To", value: "founder@example.com" },
            ],
          },
        });
      }

      if (parsed.pathname === "/drive/v3/files") {
        return jsonResponse({ files: [] });
      }

      throw new Error(`Unexpected Google Workspace request: ${parsed.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const data = await fetchGoogleWorkspaceData({
      accessToken: "google-token",
      fromDate: new Date("2026-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T00:00:00.000Z"),
      maxEmailThreads: 2,
    });

    expect(data.emailThreads.map((thread) => thread.threadId)).toEqual(["thread_present"]);
    expect(data._meta).toEqual(expect.objectContaining({
      emailThreadCount: 1,
      skippedEmailMessageDetails: 1,
      skippedResources: ["emailMessageDetails"],
    }));
  });
});
