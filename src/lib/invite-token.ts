import { createHmac, timingSafeEqual } from "node:crypto";

interface InviteTokenPayload {
  email: string;
  inviterId: string;
  iat: number;
  exp: number;
}

interface InviteTokenClaims {
  email: string;
  inviterId: string;
  issuedAt: string;
  expiresAt: string;
}

function encodeBase64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function decodeBase64Url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function getInviteSigningSecret(): string {
  const secret =
    process.env.INVITE_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || "";
  if (!secret) {
    throw new Error("INVITE_TOKEN_SECRET (or NEXTAUTH_SECRET) is required");
  }
  return secret;
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function createInviteToken(params: {
  email: string;
  inviterId: string;
  ttlSeconds?: number;
}): { token: string; expiresAt: string } {
  const ttlSeconds = params.ttlSeconds ?? 60 * 60 * 72;
  const nowSeconds = Math.floor(Date.now() / 1000);

  const payload: InviteTokenPayload = {
    email: params.email,
    inviterId: params.inviterId,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
  };

  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, getInviteSigningSecret());
  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

export function verifyInviteToken(token: string): {
  valid: boolean;
  claims?: InviteTokenClaims;
  error?: string;
} {
  if (!token || typeof token !== "string") {
    return { valid: false, error: "Missing invite token" };
  }

  const [encodedPayload, providedSignature] = token.split(".");
  if (!encodedPayload || !providedSignature) {
    return { valid: false, error: "Malformed invite token" };
  }

  let expectedSignature: string;
  try {
    expectedSignature = signPayload(encodedPayload, getInviteSigningSecret());
  } catch {
    return { valid: false, error: "Invite token signing secret is not configured" };
  }
  const expectedBuffer = Buffer.from(expectedSignature);
  const providedBuffer = Buffer.from(providedSignature);
  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return { valid: false, error: "Invalid invite token signature" };
  }

  let payload: InviteTokenPayload;
  try {
    payload = JSON.parse(decodeBase64Url(encodedPayload)) as InviteTokenPayload;
  } catch {
    return { valid: false, error: "Invalid invite token payload" };
  }

  if (!payload.email || !payload.inviterId || !payload.exp || !payload.iat) {
    return { valid: false, error: "Invite token payload incomplete" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp <= nowSeconds) {
    return { valid: false, error: "Invite token has expired" };
  }

  return {
    valid: true,
    claims: {
      email: payload.email,
      inviterId: payload.inviterId,
      issuedAt: new Date(payload.iat * 1000).toISOString(),
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    },
  };
}
