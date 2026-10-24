import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { ACCESS_COOKIE } from "@/shared/auth/cookies";
import { resolvePrincipal } from "@/shared/auth/resolver";
import type { Principal } from "@/shared/auth/principal";

/**
 * Principal for server components, read from the access cookie through the same resolver
 * the API uses (memoised per request). Returns null when the cookie is missing, expired or revoked.
 */
export const getWebPrincipal = cache(async (): Promise<Principal | null> => {
  const jar = await cookies();
  try {
    return await resolvePrincipal({ accessCookie: jar.get(ACCESS_COOKIE)?.value });
  } catch {
    return null;
  }
});
