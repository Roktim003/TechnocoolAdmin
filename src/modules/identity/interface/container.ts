import { prisma } from "@/shared/db/prisma";
import { env } from "@/shared/config/env";
import { AuthService } from "../application/auth.service";
import { DirectoryService } from "../application/directory.service";
import { RoleService } from "../application/role.service";
import { UserService } from "../application/user.service";
import { bcryptHasher, hmacRefreshCodec, jwtAccessTokenIssuer, prismaUnitOfWork, redisLoginFailureCounter } from "../infrastructure/adapters";
import { PrincipalStore } from "../infrastructure/principal-store";

/** Composition root of the identity module: wires services to their infrastructure. */
function build() {
  const e = env();
  const uow = prismaUnitOfWork(prisma);
  const hasher = bcryptHasher(e.BCRYPT_ROUNDS);
  const failures = redisLoginFailureCounter();
  const principalStore = new PrincipalStore(prisma);

  return {
    principalStore,
    hasher,
    auth: new AuthService({
      uow,
      hasher,
      refreshCodec: hmacRefreshCodec(),
      accessTokens: jwtAccessTokenIssuer,
      failures,
      cache: principalStore,
      config: { maxLoginFailures: e.LOGIN_MAX_FAILURES, refreshTokenTtlDays: e.REFRESH_TOKEN_TTL_DAYS },
    }),
    users: new UserService({ uow, hasher, failures, cache: principalStore }),
    roles: new RoleService({ uow, cache: principalStore }),
    directory: new DirectoryService({ uow }),
  };
}

let instance: ReturnType<typeof build> | undefined;

export function identity() {
  return (instance ??= build());
}
