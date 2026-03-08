import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ENCRYPTED_PREFIX = "encv1";
const PLAINTEXT_PREFIX = "plainv1";

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
