import { createHmac, randomBytes } from "node:crypto";
import { hash as bcryptHash, verify as bcryptVerify } from "@node-rs/bcrypt";
import type { PrismaClient } from "@prisma/client";
import { env } from "@/shared/config/env";
import { signAccessToken } from "@/shared/auth/tokens";
import { redis } from "@/shared/redis/redis";
import type {
  AccessTokenIssuer,
  LoginFailureCounter,
  PasswordHasher,
  RefreshTokenCodec,
  SessionActivity,
  UnitOfWork,
} from "../application/ports";
import { createIdentityRepos } from "./prisma-identity.repositories";

export function prismaUnitOfWork(client: PrismaClient): UnitOfWork {
  return {
    repos: createIdentityRepos(client),
    transaction: (fn) => client.$transaction((tx) => fn(createIdentityRepos(tx))),
  };
}

/**
 * Native bcrypt ($2b$, same hashes as before): runs on libuv's thread pool, so a burst of logins
 * doesn't stall every other request the way pure-JS hashing on the main thread does.
 */
export function bcryptHasher(rounds: number): PasswordHasher {
  // Pre-computed so unknown-username logins cost as much as real ones.
  let dummy: string | undefined;
  return {
    hash: (plain) => bcryptHash(plain, rounds),
    verify: (plain, hash) => bcryptVerify(plain, hash),
    async dummyVerify(plain) {
      dummy ??= await bcryptHash("dummy-password-for-timing", rounds);
      await bcryptVerify(plain, dummy);
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
/** Web idle timeout: one key per session that expires after the idle period; every request extends it. */
export function redisSessionActivity(): SessionActivity {
  const key = (sid: string) => `session:idle:${sid}`;
  return {
    async start(sid, ttl) {
      await redis().set(key(sid), "1", "EX", ttl);
    },
    async touch(sid, ttl) {
      return (await redis().expire(key(sid), ttl)) === 1;
    },
    async end(sid) {
      await redis().del(key(sid));
    },
  };
}

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
