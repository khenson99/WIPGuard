const INTEGRATION_ENV_ALIASES: Partial<Record<string, string[]>> = {
  META_APP_ID: ["META_CLIENT_ID"],
  META_APP_SECRET: ["META_CLIENT_SECRET"],
  SEMRUSH_API_TOKEN: ["SEMRUSH_API_KEY"],
  POSTHOG_API_KEY: ["POSTHOG_PERSONAL_API_KEY"],
  LINEAR_API_KEY: ["LINEAR_TOKEN"],
  GITHUB_TOKEN: ["GITHUB_ACCESS_TOKEN"],
  UNIFY_DATA_API_KEY: ["UNIFY_API_KEY"],
  GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN: ["GSC_ACCESS_TOKEN"],
  GOOGLE_SEARCH_CONSOLE_SITE_URL: ["GSC_SITE_URL"],
};

export function integrationEnvCandidates(key: string): string[] {
  return [key, ...(INTEGRATION_ENV_ALIASES[key] ?? [])];
}

export function getIntegrationEnvValue(key: string): string | undefined {
  for (const candidate of integrationEnvCandidates(key)) {
    const value = process.env[candidate]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}
