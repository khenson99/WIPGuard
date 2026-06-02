import { WorkspaceHome } from "./workspace-home";
import type { WorkspacePageModel } from "./workspace-model";

const MODEL: WorkspacePageModel = {
  eyebrow: "Sources",
  title: "Source Control Room",
  summary:
    "Connect providers, monitor sync health, and preserve raw source records before any metric is promoted into the trusted layer.",
  primaryAction: { href: "/settings", label: "Manage connections" },
  secondaryAction: { href: "/api/integrations", label: "Integration API" },
  stats: [
    { label: "Source state", value: "Health first", detail: "Provider freshness and failures stay visible before reporting." },
    { label: "Raw lineage", value: "Preserved", detail: "Incoming provider payloads remain attached to metric evidence." },
    { label: "Connection model", value: "OAuth + tokens", detail: "Existing provider connection plumbing is retained." },
  ],
  records: [
    {
      title: "Integration connections",
      description: "Provider status, scopes, token metadata, health checks, retries, and reconnect paths.",
      href: "/api/integrations",
      label: "Open endpoint",
    },
    {
      title: "Imladris source sync runs",
      description: "Sync windows, accepted counts, error counts, checkpoints, and raw record capture.",
      href: "/api/imladris/sources",
      label: "Open endpoint",
    },
    {
      title: "Provider-specific sync APIs",
      description: "Google Ads, Meta, Reddit, Stripe, Mercury, Pylon, Slack, SEMrush, Coda, and Webflow routes remain available.",
    },
  ],
  preservedSystems: [
    "NextAuth and team access",
    "OAuth callbacks and token refresh",
    "Integration health checks and retry routes",
    "Provider clients and fetcher utilities",
    "Raw source record persistence",
  ],
};

export function SourcesWorkspace() {
  return <WorkspaceHome model={MODEL} />;
}
