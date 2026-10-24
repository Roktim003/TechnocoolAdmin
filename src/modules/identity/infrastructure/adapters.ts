import { createHmac, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { env } from "@/shared/config/env";
import { signAccessToken } from "@/shared/auth/tokens";
import { redis } from "@/shared/redis/redis";
import type {
  AccessTokenIssuer,
  LoginFailureCounter,
  PasswordHasher,
  RefreshTokenCodec,
  UnitOfWork,
} from "../application/ports";
import { createIdentityRepos } from "./prisma-identity.repositories";

export function prismaUnitOfWork(client: PrismaClient): UnitOfWork {
  return {
    repos: createIdentityRepos(client),
    transaction: (fn) => client.$transaction((tx) => fn(createIdentityRepos(tx))),
  };
}

export function bcryptHasher(rounds: number): PasswordHasher {
  // Pre-computed so unknown-username logins cost as much as real ones.
  let dummy: string | undefined;
  return {
    hash: (plain) => bcrypt.hash(plain, rounds),
    verify: (plain, hash) => bcrypt.compare(plain, hash),
    async dummyVerify(plain) {
      dummy ??= await bcrypt.hash("dummy-password-for-timing", rounds);
      await bcrypt.compare(plain, dummy);
    },
  };
}

/** Opaque 256-bit refresh tokens; only an HMAC of the token is stored. */
export function hmacRefreshCodec(): RefreshTokenCodec {
  return {
    generate: () => randomBytes(32).toString("base64url"),
    hash: (token) => createHmac("sha256", env().REFRESH_TOKEN_SECRET).update(token).digest("hex"),
  };
}

export const jwtAccessTokenIssuer: AccessTokenIssuer = { issue: signAccessToken };

/** INCR + set the window TTL on the first failure, atomically (works on any Redis version). */
const INCR_WITH_WINDOW = `local c = redis.call('INCR', KEYS[1]) if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end return c`;

/** Fixed-window counter per username in Redis (window = LOGIN_FAILURE_WINDOW_SECONDS). */
export function redisLoginFailureCounter(): LoginFailureCounter {
  const key = (username: string) => `login:fail:${username}`;
  return {
    async increment(username) {
      return (await redis().eval(INCR_WITH_WINDOW, 1, key(username), env().LOGIN_FAILURE_WINDOW_SECONDS)) as number;
    },
    async reset(username) {
      await redis().del(key(username));
    },
  };
}
