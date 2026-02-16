import { IntegrationProvider } from "@/generated/prisma/client";

export type IntegrationSlug =
  | "google-workspace"
  | "hubspot"
  | "slack"
  | "stripe"
  | "mercury"
  | "coda"
  | "reddit";
export type IntegrationAuthType = "oauth" | "token";

interface OAuthSettings {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scopes: string[];
  scopeSeparator?: " " | ",";
  pkce?: boolean;
  authorizationRedirectParamName?: string;
  tokenRedirectParamName?: string;
  tokenClientAuthMethod?: "body" | "basic";
  extraAuthParams?: Record<string, string>;
  clientIdEnv: string;
  clientSecretEnv: string;
}

export interface IntegrationDefinition {
  slug: IntegrationSlug;
  provider: IntegrationProvider;
  name: string;
  description: string;
  capabilities: string[];
  authType: IntegrationAuthType;
  oauth?: OAuthSettings;
}

export interface OAuthIntegrationDefinition extends IntegrationDefinition {
  authType: "oauth";
  oauth: OAuthSettings;
}

function getScopesFromEnv(key: string, fallback: string[]): string[] {
  const raw = process.env[key];
  if (!raw) return fallback;

  const scopes = raw
    .split(/[,\s]+/g)
    .map((scope) => scope.trim())
    .filter(Boolean);

  return scopes.length > 0 ? scopes : fallback;
}

function joinScopes(scopes: string[]): string {
  return scopes.join(" ");
}

const INTEGRATION_DEFINITIONS: readonly IntegrationDefinition[] = [
  {
    slug: "google-workspace",
    provider: IntegrationProvider.GOOGLE_WORKSPACE,
    name: "Google Workspace",
    description:
      "Connect Gmail, Google Drive, and Google Calendar context to cards.",
    capabilities: ["Gmail", "Google Drive", "Google Calendar"],
    authType: "oauth",
    oauth: {
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      scopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/calendar.readonly",
      ],
      extraAuthParams: {
        access_type: "offline",
        include_granted_scopes: "true",
        prompt: "consent",
      },
      clientIdEnv: "GOOGLE_CLIENT_ID",
      clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    },
  },
  {
    slug: "hubspot",
    provider: IntegrationProvider.HUBSPOT,
    name: "HubSpot",
    description: "Sync deal stage and lifecycle updates with task transitions.",
    capabilities: ["Deals", "Contacts"],
    authType: "oauth",
    oauth: {
      authorizationEndpoint: "https://app.hubspot.com/oauth/authorize",
      tokenEndpoint: "https://api.hubapi.com/oauth/v1/token",
      pkce: true,
      // HubSpot expects only required scopes in `scope`; request feature scopes
      // via `optional_scope` to avoid install URL / app scope mismatch.
      scopes: ["oauth"],
      extraAuthParams: {
        optional_scope: joinScopes(
          getScopesFromEnv("HUBSPOT_SCOPES", [
            "crm.objects.deals.read",
            "crm.objects.contacts.read",
          ])
        ),
      },
      clientIdEnv: "HUBSPOT_CLIENT_ID",
      clientSecretEnv: "HUBSPOT_CLIENT_SECRET",
    },
  },
  {
    slug: "slack",
    provider: IntegrationProvider.SLACK,
    name: "Slack",
    description:
      "Post flow updates to channels and capture tasks from conversations.",
    capabilities: ["Notifications", "Task capture"],
    authType: "oauth",
    oauth: {
      authorizationEndpoint: "https://slack.com/oauth/v2/authorize",
      tokenEndpoint: "https://slack.com/api/oauth.v2.access",
      scopes: ["chat:write", "channels:read", "channels:history", "users:read"],
      scopeSeparator: ",",
      clientIdEnv: "SLACK_CLIENT_ID",
      clientSecretEnv: "SLACK_CLIENT_SECRET",
    },
  },
  {
    slug: "stripe",
    provider: IntegrationProvider.STRIPE,
    name: "Stripe",
    description: "Connect Stripe account data and payment signals into WIPGuard.",
    capabilities: ["Revenue", "Payments", "Subscriptions"],
    authType: "oauth",
    oauth: {
      authorizationEndpoint: "https://connect.stripe.com/oauth/authorize",
      tokenEndpoint: "https://connect.stripe.com/oauth/token",
      scopes: getScopesFromEnv("STRIPE_SCOPES", ["read_write"]),
      clientIdEnv: "STRIPE_CLIENT_ID",
      clientSecretEnv: "STRIPE_CLIENT_SECRET",
    },
  },
  {
    slug: "mercury",
    provider: IntegrationProvider.MERCURY,
    name: "Mercury",
    description: "Connect Mercury banking activity and cashflow context.",
    capabilities: ["Accounts", "Transactions", "Cashflow"],
    authType: "oauth",
    oauth: {
      authorizationEndpoint: "https://oauth2.mercury.com/oauth2/auth",
      tokenEndpoint: "https://oauth2.mercury.com/oauth2/token",
      scopes: getScopesFromEnv("MERCURY_SCOPES", ["read"]),
      pkce: true,
      authorizationRedirectParamName: "redirect_url",
      tokenRedirectParamName: "redirect_url",
      tokenClientAuthMethod: "basic",
      clientIdEnv: "MERCURY_CLIENT_ID",
      clientSecretEnv: "MERCURY_CLIENT_SECRET",
    },
  },
  {
    slug: "coda",
    provider: IntegrationProvider.CODA,
    name: "Coda",
    description:
      "Attach docs and migrate legacy Coda workflows using a Coda API token.",
    capabilities: ["Docs", "Rows", "Coda migration"],
    authType: "token",
  },
  {
    slug: "reddit",
    provider: IntegrationProvider.REDDIT,
    name: "Reddit",
    description: "Capture Reddit threads and community signals in WIPGuard.",
    capabilities: ["Thread capture", "Community monitoring"],
    authType: "oauth",
    oauth: {
      authorizationEndpoint: "https://www.reddit.com/api/v1/authorize",
      tokenEndpoint: "https://www.reddit.com/api/v1/access_token",
      scopes: ["identity", "read", "history"],
      tokenClientAuthMethod: "basic",
      extraAuthParams: {
        duration: "permanent",
      },
      clientIdEnv: "REDDIT_CLIENT_ID",
      clientSecretEnv: "REDDIT_CLIENT_SECRET",
    },
  },
] as const;

const SLUG_LOOKUP = new Map(
  INTEGRATION_DEFINITIONS.map((definition) => [definition.slug, definition])
);

const PROVIDER_LOOKUP = new Map(
  INTEGRATION_DEFINITIONS.map((definition) => [definition.provider, definition])
);

export function listIntegrationDefinitions(): readonly IntegrationDefinition[] {
  return INTEGRATION_DEFINITIONS;
}

export function getIntegrationBySlug(
  slug: string
): IntegrationDefinition | null {
  return SLUG_LOOKUP.get(slug as IntegrationSlug) ?? null;
}

export function getIntegrationByProvider(
  provider: IntegrationProvider
): IntegrationDefinition | null {
  return PROVIDER_LOOKUP.get(provider) ?? null;
}

export function isOAuthIntegration(
  definition: IntegrationDefinition
): definition is OAuthIntegrationDefinition {
  return definition.authType === "oauth" && Boolean(definition.oauth);
}

export function getIntegrationOAuthCredentials(
  definition: OAuthIntegrationDefinition
): { clientId: string; clientSecret: string } | null {
  const clientId = process.env[definition.oauth.clientIdEnv];
  const clientSecret = process.env[definition.oauth.clientSecretEnv];
  if (!clientId || !clientSecret) {
    return null;
  }
  return { clientId, clientSecret };
}

export function isIntegrationConfigured(definition: IntegrationDefinition): boolean {
  if (!isOAuthIntegration(definition)) {
    return true;
  }
  return Boolean(getIntegrationOAuthCredentials(definition));
}

export function getMissingIntegrationEnv(definition: IntegrationDefinition): string[] {
  if (!isOAuthIntegration(definition)) {
    return [];
  }

  const required = [
    definition.oauth.clientIdEnv,
    definition.oauth.clientSecretEnv,
  ];
  return required.filter((key) => !process.env[key]);
}
