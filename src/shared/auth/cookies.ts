import { env } from "@/shared/config/env";

export const ACCESS_COOKIE = "sb_at";
export const REFRESH_COOKIE = "sb_rt";
/** The refresh cookie is only ever sent to the auth endpoints. */
export const REFRESH_COOKIE_PATH = "/api/v1/auth";

export interface CookieOp {
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax";
    path: string;
    maxAge: number;
    domain?: string;
  };
}

function base(path: string, maxAge: number): CookieOp["options"] {
  const e = env();
  return { httpOnly: true, secure: e.COOKIE_SECURE, sameSite: "lax", path, maxAge, ...(e.COOKIE_DOMAIN ? { domain: e.COOKIE_DOMAIN } : {}) };
}

export function authCookies(tokens: { accessToken: string; refreshToken: string }): CookieOp[] {
  const e = env();
  return [
    { name: ACCESS_COOKIE, value: tokens.accessToken, options: base("/", e.ACCESS_TOKEN_TTL_SECONDS) },
    { name: REFRESH_COOKIE, value: tokens.refreshToken, options: base(REFRESH_COOKIE_PATH, e.REFRESH_TOKEN_TTL_DAYS * 86_400) },
  ];
}

export function clearAuthCookies(): CookieOp[] {
  return [
    { name: ACCESS_COOKIE, value: "", options: base("/", 0) },
    { name: REFRESH_COOKIE, value: "", options: base(REFRESH_COOKIE_PATH, 0) },
  ];
}
