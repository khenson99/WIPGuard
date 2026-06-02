import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationsTab } from "@/components/settings/integrations-tab";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

interface FetchMockOptions {
  items: Array<Record<string, unknown>>;
  slackRuleErrors?: Partial<Record<string, string>>;
}

function mockIntegrationsFetch(options: FetchMockOptions): void {
  const { items, slackRuleErrors = {} } = options;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/integrations") {
        return {
          ok: true,
          json: async () => items,
        } as Response;
      }

      if (url.endsWith("/api/integrations/slack/channel-routing")) {
        const suffix = url.split("/").pop() || "";
        const lastError = slackRuleErrors[suffix] ?? null;

        return {
          ok: true,
          json: async () => ({
            rule: {
              id: `rule-${suffix}`,
              key: `slack_${suffix}`,
              enabled: true,
              config: { defaultChannelId: "C123", fallbackToDm: true, policies: [] },
              checkpoint: {},
              lastObservedAt: null,
              lastRunAt: null,
              lastError,
            },
          }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({}),
      } as Response;
    })
  );
}

describe("IntegrationsTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("auto-expands first needs-attention provider and supports single-open provider and rule accordions", async () => {
    mockIntegrationsFetch({
      items: [
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
          slug: "webflow",
          provider: "WEBFLOW",
          name: "Webflow",
          description: "Webflow integration",
          capabilities: ["CMS"],
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
    });

    render(<IntegrationsTab />);

    await waitFor(() => {
      expect(screen.getByLabelText("Toggle Webflow").getAttribute("aria-expanded")).toBe("true");
    });
    expect(screen.getByLabelText("Toggle Slack").getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Slack Channel Routing")).toBeNull();

    fireEvent.click(screen.getByLabelText("Toggle Slack"));

    await waitFor(() => {
      expect(screen.getByLabelText("Toggle Slack").getAttribute("aria-expanded")).toBe("true");
    });
    expect(screen.getByLabelText("Toggle Webflow").getAttribute("aria-expanded")).toBe("false");

    await waitFor(() => {
      expect(screen.getByText("Slack Channel Routing")).toBeTruthy();
    });
    expect(screen.queryByText("Save")).toBeNull();

    fireEvent.click(screen.getByText("Slack Channel Routing"));

    await waitFor(() => {
      expect(screen.getByText("Default Channel ID")).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText("Toggle Webflow"));

    await waitFor(() => {
      expect(screen.getByLabelText("Toggle Webflow").getAttribute("aria-expanded")).toBe("true");
    });
    expect(screen.getByLabelText("Toggle Slack").getAttribute("aria-expanded")).toBe("false");
    await waitFor(() => {
      expect(screen.getByText("Diagnostics-only provider")).toBeTruthy();
    });
  });

  it("auto-opens the first failing rule when provider is expanded by default", async () => {
    mockIntegrationsFetch({
      items: [
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
      ],
      slackRuleErrors: {
        "channel-routing": "upstream failure",
      },
    });

    render(<IntegrationsTab />);

    await waitFor(() => {
      expect(screen.getByLabelText("Toggle Slack").getAttribute("aria-expanded")).toBe("true");
    });

    await waitFor(() => {
      expect(screen.getByText("upstream failure")).toBeTruthy();
    });
    expect(screen.getByText("Save")).toBeTruthy();
  });

  it("renders env-managed oauth integrations without connect or disconnect actions", async () => {
    mockIntegrationsFetch({
      items: [
        {
          slug: "google-ads",
          provider: "GOOGLE_ADS",
          name: "Google Ads",
          description: "Google Ads integration",
          capabilities: ["Campaigns"],
          authType: "oauth",
          configured: true,
          missingEnv: [],
          connected: true,
          status: "DISCONNECTED",
          accountLabel: null,
          connectedAt: null,
          lastSyncedAt: "2026-02-10T10:05:00.000Z",
          lastError: null,
          credentialSource: "env",
          syncHealth: "healthy",
          syncHealthReason: null,
          lastSnapshotAt: "2026-02-10T10:05:00.000Z",
          lastSnapshotStatus: "SUCCESS",
        },
      ],
    });

    render(<IntegrationsTab />);

    await waitFor(() => {
      expect(screen.getByLabelText("Toggle Google Ads")).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText("Toggle Google Ads"));

    await waitFor(() => {
      expect(screen.getByLabelText("Toggle Google Ads").getAttribute("aria-expanded")).toBe("true");
    });

    expect(screen.getByText("Server-managed")).toBeTruthy();
    expect(screen.queryByText("Connect")).toBeNull();
    expect(screen.queryByText("Disconnect")).toBeNull();
    expect(screen.getByText("Managed by server environment")).toBeTruthy();
  });
});
