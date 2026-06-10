import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ENCRYPTED_PREFIX = "encv1";
const PLAINTEXT_PREFIX = "plainv1";

/**
 * Placeholder stored in IntegrationConnection.accessToken for rows that only
 * track the health of env-managed credentials. It is never a real secret:
 * credential resolution must treat it as "no token stored", otherwise the
 * placeholder row shadows the env credential it was created to monitor.
 *
 * New health-check rows persist NULL instead, but rows written before that
 * change still hold this literal, so readers must keep recognizing it.
 */
export const ENV_MANAGED_TOKEN_PLACEHOLDER = "env-managed";

export function isEnvManagedTokenPlaceholder(
  value: string | null | undefined
): boolean {
  return value === ENV_MANAGED_TOKEN_PLACEHOLDER;
}

function getSecret(): string {
  return (
    process.env.INTEGRATION_TOKEN_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    ""
  );
}

function requireSecret(): string {
  const secret = getSecret();
  if (!secret) {
    throw new Error(
      "INTEGRATION_TOKEN_SECRET or NEXTAUTH_SECRET must be set. " +
        "Refusing to store integration tokens as plaintext."
    );
  }
  return secret;
}

function getKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function protectIntegrationSecret(
  value: string | null | undefined
): string | null {
  if (!value) return null;

  const secret = requireSecret();

  const key = getKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTED_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function unprotectIntegrationSecret(
  value: string | null | undefined
): string | null {
  if (!value) return null;

  // Support reading legacy plaintext tokens for migration
  if (value.startsWith(`${PLAINTEXT_PREFIX}.`)) {
    console.warn(
      "token-crypto: Reading legacy plaintext token. " +
        "Re-encrypt by updating the integration connection."
    );
    return value.slice(PLAINTEXT_PREFIX.length + 1);
  }
  if (!value.startsWith(`${ENCRYPTED_PREFIX}.`)) {
    return value;
  }

  const parts = value.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const secret = getSecret();
  if (!secret) {
    throw new Error(
      "INTEGRATION_TOKEN_SECRET or NEXTAUTH_SECRET must be set to decrypt tokens."
    );
  }

  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const ciphertext = Buffer.from(parts[3], "base64url");
    const key = getKey(secret);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    return null;
  }
}
