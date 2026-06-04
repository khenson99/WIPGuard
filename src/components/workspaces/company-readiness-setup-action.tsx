"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function CompanyReadinessSetupAction() {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSetup() {
    setIsRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/imladris/dashboards/company/readiness/setup", {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message =
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : "Readiness setup failed.";
        throw new Error(message);
      }
      router.refresh();
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : "Readiness setup failed.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <button
        type="button"
        onClick={() => void runSetup()}
        disabled={isRunning}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isRunning ? "animate-spin" : ""}`} aria-hidden="true" />
        {isRunning ? "Running setup" : "Run readiness setup"}
      </button>
      {error ? <p className="text-xs leading-5 text-red-600">{error}</p> : null}
    </div>
  );
}
