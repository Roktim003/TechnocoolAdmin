import { UnauthenticatedError } from "@/shared/errors/app-error";
import { loadPrincipal } from "@/modules/identity/interface/principal-loader";
import type { Principal } from "./principal";
import { verifyAccessToken } from "./tokens";

export interface TokenSource {
  /** Value of the Authorization header, if any. */
  authorization?: string | null;
  /** Value of the access-token cookie, if any. */
  accessCookie?: string | null;
}

export function extractToken(src: TokenSource): { token: string; method: Principal["authMethod"] } | null {
  const auth = src.authorization?.trim();
  if (auth) {
    const [scheme, value] = auth.split(/\s+/, 2);
    if (scheme?.toLowerCase() !== "bearer" || !value) throw new UnauthenticatedError("Authorization header must be 'Bearer <token>'.");
    return { token: value, method: "bearer" };
  }
  if (src.accessCookie) return { token: src.accessCookie, method: "cookie" };
  return null;
}

/**
 * The one auth code path for web (cookie) and mobile (bearer) callers.
 * Returns null when no credentials were presented; throws 401 when they are invalid,
 * expired, or belong to a disabled / revoked session.
 */
export async function resolvePrincipal(src: TokenSource): Promise<Principal | null> {
  const found = extractToken(src);
  if (!found) return null;
  const claims = await verifyAccessToken(found.token);
  return loadPrincipal(claims, found.method);
}
