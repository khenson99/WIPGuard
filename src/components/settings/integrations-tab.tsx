"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  Link2Off,
  Loader2,
  ShieldAlert,
} from "lucide-react";

type IntegrationStatus = "CONNECTED" | "DISCONNECTED" | "ERROR";

interface IntegrationItem {
  slug: string;
  name: string;
  description: string;
  capabilities: string[];
  authType: "oauth" | "token";
  configured: boolean;
  missingEnv: string[];
  connected: boolean;
  status: IntegrationStatus;
  accountLabel: string | null;
  connectedAt: string | null;
  lastError: string | null;
}

const STATUS_MESSAGE: Record<string, string> = {
  connected: "Integration connected successfully.",
  oauth_failed: "OAuth handshake failed. Try connecting again.",
  oauth_denied: "Provider authorization was denied.",
  invalid_state: "OAuth state validation failed. Please retry.",
  missing_config: "Provider credentials are missing on the server.",
};

function formatConnectedAt(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function IntegrationsTab() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<IntegrationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codaToken, setCodaToken] = useState("");

  const fetchIntegrations = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/integrations", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Could not load integrations");
      }
      setItems((await response.json()) as IntegrationItem[]);
    } catch {
      setError("Could not load integrations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  const banner = useMemo(() => {
    const status = searchParams?.get("status");
    if (!status || !STATUS_MESSAGE[status]) {
      return null;
    }
    const integration = searchParams?.get("integration");
    return integration
      ? `${STATUS_MESSAGE[status]} (${integration})`
      : STATUS_MESSAGE[status];
  }, [searchParams]);

  const startOAuthConnect = (slug: string) => {
    window.location.href = `/api/integrations/connect/${slug}`;
  };

  const disconnect = async (slug: string) => {
    setWorking(slug);
    setError(null);
    try {
      const response = await fetch(`/api/integrations/${slug}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Disconnect failed");
      }
      await fetchIntegrations();
    } catch {
      setError(`Failed to disconnect ${slug}.`);
    } finally {
      setWorking(null);
    }
  };

  const connectCoda = async () => {
    if (!codaToken.trim()) {
      setError("Coda API token is required.");
      return;
    }

    setWorking("coda");
    setError(null);
    try {
      const response = await fetch("/api/integrations/coda/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: codaToken.trim() }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || "Coda connect failed");
      }

      setCodaToken("");
      await fetchIntegrations();
    } catch (connectError) {
      const message =
        connectError instanceof Error
          ? connectError.message
          : "Failed to connect Coda.";
      setError(message);
    } finally {
      setWorking(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Integrations</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Connect WIPGuard to your GTM tools. Google includes Gmail, Drive, and
          Calendar scopes.
        </p>
      </div>

      {banner && (
        <div className="rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 px-3 py-2 text-sm text-foreground">
          {banner}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 text-[var(--danger)]" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <section
            key={item.slug}
            className="rounded-lg border border-border bg-card p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{item.name}</h3>
                  {item.connected ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--success)]/10 px-2 py-0.5 text-xs text-[var(--success)]">
                      <CheckCircle2 className="h-3 w-3" />
                      Connected
                    </span>
                  ) : item.status === "ERROR" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--danger)]/10 px-2 py-0.5 text-xs text-[var(--danger)]">
                      <AlertTriangle className="h-3 w-3" />
                      Error
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                      <Link2Off className="h-3 w-3" />
                      Not connected
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{item.description}</p>
                <div className="flex flex-wrap gap-1">
                  {item.capabilities.map((capability) => (
                    <span
                      key={capability}
                      className="rounded-md bg-secondary px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {capability}
                    </span>
                  ))}
                </div>
                {item.connected && (
                  <p className="text-xs text-muted-foreground">
                    Connected as {item.accountLabel || "unknown account"} on{" "}
                    {formatConnectedAt(item.connectedAt)}.
                  </p>
                )}
                {!item.configured && item.authType === "oauth" && (
                  <p className="text-xs text-[var(--warning)]">
                    Missing env: {item.missingEnv.join(", ")}
                  </p>
                )}
                {item.lastError && (
                  <p className="text-xs text-[var(--danger)]">
                    Last error: {item.lastError}
                  </p>
                )}
              </div>

              <div className="flex min-w-[210px] flex-col items-stretch gap-2">
                {item.authType === "oauth" ? (
                  item.connected ? (
                    <button
                      onClick={() => disconnect(item.slug)}
                      disabled={working === item.slug}
                      className="btn-ghost-muted rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-60"
                    >
                      {working === item.slug ? (
                        <span className="inline-flex items-center gap-1">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Disconnecting...
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Link2Off className="h-3.5 w-3.5" />
                          Disconnect
                        </span>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => startOAuthConnect(item.slug)}
                      disabled={!item.configured || working === item.slug}
                      className="btn-primary-theme rounded-lg px-3 py-2 text-sm disabled:opacity-60"
                    >
                      <span className="inline-flex items-center gap-1">
                        <Link2 className="h-3.5 w-3.5" />
                        Connect
                      </span>
                    </button>
                  )
                ) : (
                  <>
                    {!item.connected && (
                      <input
                        type="password"
                        value={codaToken}
                        onChange={(event) => setCodaToken(event.target.value)}
                        placeholder="Paste Coda API token"
                        className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none"
                      />
                    )}
                    {!item.connected ? (
                      <button
                        onClick={connectCoda}
                        disabled={working === "coda"}
                        className="btn-primary-theme rounded-lg px-3 py-2 text-sm disabled:opacity-60"
                      >
                        {working === "coda" ? (
                          <span className="inline-flex items-center gap-1">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Connecting...
                          </span>
                        ) : (
                          "Connect with token"
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => disconnect(item.slug)}
                        disabled={working === item.slug}
                        className="btn-ghost-muted rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-60"
                      >
                        Disconnect
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
