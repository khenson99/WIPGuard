import { IntegrationProvider } from "@/generated/prisma/client";

export function parseIntegrationProvider(value: string): IntegrationProvider | null {
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "google_workspace":
    case "google-workspace":
    case "google":
      return IntegrationProvider.GOOGLE_WORKSPACE;
    case "hubspot":
      return IntegrationProvider.HUBSPOT;
    case "slack":
      return IntegrationProvider.SLACK;
    case "coda":
      return IntegrationProvider.CODA;
    case "reddit":
      return IntegrationProvider.REDDIT;
    case "stripe":
      return IntegrationProvider.STRIPE;
    case "mercury":
      return IntegrationProvider.MERCURY;
    case "webflow":
      return IntegrationProvider.WEBFLOW;
    default:
      return null;
  }
}
