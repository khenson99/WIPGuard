import { IntegrationProvider } from "@/generated/prisma/client";
import { resolveProviderRegistryEntryBySlug } from "@/lib/integrations/provider-registry";

export function parseIntegrationProvider(value: string): IntegrationProvider | null {
  const fromRegistry = resolveProviderRegistryEntryBySlug(value);
  if (fromRegistry) {
    return fromRegistry.provider;
  }

  const enumCandidate = value.trim().toUpperCase();
  if (enumCandidate in IntegrationProvider) {
    return IntegrationProvider[enumCandidate as keyof typeof IntegrationProvider];
  }

  return null;
}
