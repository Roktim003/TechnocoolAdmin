import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { env } from "@/shared/config/env";
import { UnauthenticatedError } from "@/shared/errors/app-error";

export interface AccessTokenClaims {
  /** User id. */
  sub: string;
  /** Role id at issue time. */
  rid: string;
  /** Role permission version at issue time. */
  pv: number;
  /** User token version; a mismatch means the session was revoked. */
  tv: number;
  /** Session id (the refresh-token family): web idle timeout is tracked per session. */
  sid?: string;
}

const ALG = "HS256";
const AUDIENCE = "stockbook-api";

function secret(): Uint8Array {
  return new TextEncoder().encode(env().JWT_ACCESS_SECRET);
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<{ token: string; expiresIn: number }> {
  const e = env();
  const token = await new SignJWT({ rid: claims.rid, pv: claims.pv, tv: claims.tv, ...(claims.sid ? { sid: claims.sid } : {}) })
    .setProtectedHeader({ alg: ALG, typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuer(e.JWT_ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${e.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret());
  return { token, expiresIn: e.ACCESS_TOKEN_TTL_SECONDS };
}

/** Verifies signature, issuer, audience and expiry. Throws 401 on any failure. */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: env().JWT_ISSUER, audience: AUDIENCE, algorithms: [ALG] });
    if (typeof payload.sub !== "string" || typeof payload.rid !== "string" || typeof payload.pv !== "number" || typeof payload.tv !== "number") {
      throw new UnauthenticatedError("Malformed access token.");
    }
    return { sub: payload.sub, rid: payload.rid, pv: payload.pv, tv: payload.tv, ...(typeof payload.sid === "string" ? { sid: payload.sid } : {}) };
  } catch (err) {
    if (err instanceof UnauthenticatedError) throw err;
    if (err instanceof joseErrors.JWTExpired) throw new UnauthenticatedError("Access token has expired.", "TOKEN_EXPIRED");
    throw new UnauthenticatedError("Invalid access token.");
  }
}
