const INTEGRATION_ENV_ALIASES: Partial<Record<string, string[]>> = {
  META_APP_ID: ["META_CLIENT_ID"],
  META_APP_SECRET: ["META_CLIENT_SECRET"],
  SEMRUSH_API_TOKEN: ["SEMRUSH_API_KEY"],
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
