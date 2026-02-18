import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationsTab } from "@/components/settings/integrations-tab";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

describe("IntegrationsTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders provider cards, rule editors, and diagnostics-only provider state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === "/api/integrations") {
          return {
            ok: true,
            json: async () => [
              {
                slug: "slack",
                provider: "SLACK",
                name: "Slack",
                description: "Slack integration",
                capabilities: ["Notifications"],
                authType: "oauth",
                configured: true,
                missingEnv: [],
                connected: true,
                status: "CONNECTED",
                accountLabel: "Acme",
                connectedAt: "2026-02-10T10:00:00.000Z",
                lastSyncedAt: "2026-02-10T10:05:00.000Z",
                lastError: null,
                credentialSource: "connection",
                syncHealth: "healthy",
                syncHealthReason: null,
                lastSnapshotAt: "2026-02-10T10:05:00.000Z",
                lastSnapshotStatus: "SUCCESS",
              },
              {
                slug: "stripe",
                provider: "STRIPE",
                name: "Stripe",
                description: "Stripe integration",
                capabilities: ["Revenue"],
                authType: "oauth",
                configured: true,
                missingEnv: [],
                connected: false,
                status: "DISCONNECTED",
                accountLabel: null,
                connectedAt: null,
                lastSyncedAt: null,
                lastError: null,
                credentialSource: "none",
                syncHealth: "missing",
                syncHealthReason: "No integration credentials found.",
                lastSnapshotAt: null,
                lastSnapshotStatus: null,
              },
            ],
          } as Response;
        }

        if (
          url.endsWith("/api/integrations/slack/status-sync") ||
          url.endsWith("/api/integrations/slack/unanswered-requests") ||
          url.endsWith("/api/integrations/slack/thread-capture") ||
          url.endsWith("/api/integrations/slack/channel-routing")
        ) {
          return {
            ok: true,
            json: async () => ({
              rule: {
                id: `rule-${url.split("/").pop()}`,
                key: "test_rule",
                enabled: true,
                statusOverride: "QUEUED",
                config:
                  url.endsWith("/api/integrations/slack/channel-routing")
                    ? { defaultChannelId: "C123", fallbackToDm: true, policies: [] }
                    : {},
                checkpoint: {},
                lastObservedAt: null,
                lastRunAt: null,
                lastError: null,
              },
            }),
          } as Response;
        }

        if (init?.method === "POST" && url.endsWith("/api/integrations/slack/channel-routing")) {
          return {
            ok: true,
            json: async () => ({ ok: true, rule: { id: "rule-routing", key: "slack_channel_routing", enabled: true, config: { defaultChannelId: null, fallbackToDm: true, policies: [] }, checkpoint: {}, lastObservedAt: null, lastRunAt: null, lastError: null } }),
          } as Response;
        }

        return {
          ok: true,
          json: async () => ({}),
        } as Response;
      })
    );

    render(<IntegrationsTab />);

    await waitFor(() => {
      expect(screen.getByText("Slack")).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByText("Rule Editors")).toBeTruthy();
    });
    expect(screen.getByText("Slack Status Thread Sync")).toBeTruthy();
    expect(screen.getByText("Stripe")).toBeTruthy();
    expect(screen.getByText("Diagnostics-only provider")).toBeTruthy();
  });
});
