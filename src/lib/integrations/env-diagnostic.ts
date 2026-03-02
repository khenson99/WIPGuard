/**
 * Integration Environment Diagnostic
 *
 * Logs a one-time summary of which integration providers have their required
 * environment variables set. Runs on the first API request (cold start) so
 * operators can immediately see what's missing in Railway / production logs
 * without visiting the settings UI.
 */

import {
  listIntegrationDefinitions,
  isOAuthIntegration,
  getMissingIntegrationEnv,
} from "@/lib/integrations/catalog";

let logged = false;

export function logIntegrationEnvDiagnostic(): void {
  if (logged) return;
  logged = true;

  const definitions = listIntegrationDefinitions();
  const lines: string[] = [];
  let missingCount = 0;

  for (const def of definitions) {
    if (!isOAuthIntegration(def)) {
      lines.push(`  ${def.slug}: OK (token-based, no OAuth env required)`);
      continue;
    }

    const missing = getMissingIntegrationEnv(def);
    if (missing.length === 0) {
      lines.push(`  ${def.slug}: OK`);
    } else {
      lines.push(`  ${def.slug}: MISSING (${missing.join(", ")})`);
      missingCount += 1;
    }
  }

  const coreVars = [
    "DATABASE_URL",
    "NEXTAUTH_SECRET",
    "NEXTAUTH_URL",
    "INTEGRATION_TOKEN_SECRET",
    "INTEGRATION_OWNER_USER_ID",
  ];

  const coreLines: string[] = [];
  for (const key of coreVars) {
    const set = Boolean(process.env[key]?.trim());
    coreLines.push(`  ${key}: ${set ? "SET" : "NOT SET"}`);
  }

  const level = missingCount > 0 ? "warn" : "info";
  const summary =
    missingCount > 0
      ? `${missingCount} OAuth provider(s) missing env vars`
      : "All OAuth providers configured";

  console[level](
    [
      `[integrations] Environment diagnostic (${summary}):`,
      "",
      "Core variables:",
      ...coreLines,
      "",
      "Provider OAuth credentials:",
      ...lines,
    ].join("\n")
  );
}
