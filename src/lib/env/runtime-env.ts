const REQUIRED_INTEGRATION_RUNTIME_ENV_KEYS = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
] as const;

const RECOMMENDED_INTEGRATION_RUNTIME_ENV_KEYS = [
  "INTEGRATION_TOKEN_SECRET",
] as const;

export type IntegrationRuntimeEnvKey =
  (typeof REQUIRED_INTEGRATION_RUNTIME_ENV_KEYS)[number];
export type RecommendedIntegrationRuntimeEnvKey =
  (typeof RECOMMENDED_INTEGRATION_RUNTIME_ENV_KEYS)[number];

export interface IntegrationRuntimeEnvStatus {
  missingRequired: IntegrationRuntimeEnvKey[];
  missingRecommended: RecommendedIntegrationRuntimeEnvKey[];
}

function isUnset(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}

export function getIntegrationRuntimeEnvStatus(): IntegrationRuntimeEnvStatus {
  const missingRequired = REQUIRED_INTEGRATION_RUNTIME_ENV_KEYS.filter((key) =>
    isUnset(process.env[key])
  );
  const missingRecommended = RECOMMENDED_INTEGRATION_RUNTIME_ENV_KEYS.filter(
    (key) => isUnset(process.env[key])
  );

  return {
    missingRequired,
    missingRecommended,
  };
}

export function formatRuntimeEnvMissingKeysMessage(keys: string[]): string {
  if (keys.length === 0) {
    return "Runtime env configuration is missing.";
  }
  return `Missing runtime env keys: ${keys.join(", ")}`;
}
