import type { IntegrationDefinition, OAuthIntegrationDefinition } from "@/lib/integrations/catalog";
import { isOAuthIntegration } from "@/lib/integrations/catalog";

export interface ScopeValidationResult {
  valid: boolean;
  missing: string[];
}

/**
 * Returns the full list of required scopes for a provider.
 *
 * For providers that send additional scopes via `extraAuthParams.optional_scope`
 * (e.g. HubSpot), those are merged in so callers can validate the complete set.
 */
export function getRequiredScopes(definition: IntegrationDefinition): string[] {
  if (!isOAuthIntegration(definition)) {
    return [];
  }

  const base = [...definition.oauth.scopes];

  const optionalScopeRaw = definition.oauth.extraAuthParams?.optional_scope;
  if (optionalScopeRaw) {
    const extra = optionalScopeRaw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const scope of extra) {
      if (!base.includes(scope)) {
        base.push(scope);
      }
    }
  }

  return base;
}

/**
 * Compares granted scopes against required scopes.
 *
 * The comparison is case-sensitive because OAuth scope strings are typically
 * case-sensitive (e.g. Google URL-based scopes, Meta permission names).
 */
export function validateGrantedScopes(
  required: string[],
  granted: string[]
): ScopeValidationResult {
  if (required.length === 0) {
    return { valid: true, missing: [] };
  }

  const grantedSet = new Set(granted);
  const missing = required.filter((scope) => !grantedSet.has(scope));

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Convenience wrapper: validates granted scopes against a full integration
 * definition. Returns `null` for non-OAuth integrations (always valid).
 */
export function validateIntegrationScopes(
  definition: IntegrationDefinition,
  grantedScopes: string[]
): ScopeValidationResult | null {
  if (!isOAuthIntegration(definition)) {
    return null;
  }

  const required = getRequiredScopes(definition);
  return validateGrantedScopes(required, grantedScopes);
}
