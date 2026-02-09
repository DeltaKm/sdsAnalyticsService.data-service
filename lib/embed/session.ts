import { jwtVerify, SignJWT } from 'jose';
import { EMBED_JWT_SECRET, EMBED_JWT_ALGORITHM } from './constants';

const encoder = new TextEncoder();

function getSecretKey(): Uint8Array {
  const secret = EMBED_JWT_SECRET;
  if (!secret) {
    throw new Error("EMBED_JWT_SECRET env var is not defined");
  }
  return encoder.encode(secret);
}

export interface EmbedTokenClaims {
  uniqueKey: string;
  userId?: string;
  permissions: string[];
  iat: number;
  exp: number;
}

export async function signEmbedToken({
  uniqueKey,
  userId,
  permissions,
  expiresInSeconds = 30 * 24 * 60 * 60, // 30 days
}: {
  uniqueKey: string;
  userId?: string;
  permissions: string[];
  expiresInSeconds?: number;
}): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expirationTime = issuedAt + expiresInSeconds;
  const resolvedUser = userId ?? "embed-user";

  return await new SignJWT({ uniqueKey, userId: resolvedUser, permissions })
    .setProtectedHeader({ alg: EMBED_JWT_ALGORITHM, typ: "JWT" })
    .setIssuedAt(issuedAt)
    .setExpirationTime(expirationTime)
    .sign(getSecretKey());
}

export async function verifyEmbedToken(authHeader?: string): Promise<EmbedTokenClaims | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: [EMBED_JWT_ALGORITHM] });
    return payload as unknown as EmbedTokenClaims;
  } catch {
    return null;
  }
}
