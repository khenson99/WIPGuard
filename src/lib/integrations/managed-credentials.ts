import { IntegrationProvider } from "@/generated/prisma/client";
import { listProviderRegistryEntries } from "@/lib/integrations/provider-registry";

const ENV_MANAGED_PROVIDERS = new Set<IntegrationProvider>(
  listProviderRegistryEntries()
    .filter((entry) => entry.envManaged)
    .map((entry) => entry.provider)
);

function parseOptionalBoolean(value: string | undefined): boolean | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no") return false;
  return null;
}

export function isEnvManagedProvidersModeEnabled(): boolean {
  const explicit =
    parseOptionalBoolean(process.env.THE_MOTHER_NODE_ENV_MANAGED_PROVIDERS_ONLY) ??
    parseOptionalBoolean(process.env.INTEGRATIONS_ENV_MANAGED_PROVIDERS_ONLY);
  if (explicit !== null) {
    return explicit;
  }
  return process.env.NODE_ENV === "production";
}

export function isProviderEnvManaged(provider: IntegrationProvider): boolean {
  return isEnvManagedProvidersModeEnabled() && ENV_MANAGED_PROVIDERS.has(provider);
}
