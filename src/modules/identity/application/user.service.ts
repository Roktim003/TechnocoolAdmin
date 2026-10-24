import type { ActorContext } from "@/modules/audit/application/audit.service";
import { NotFoundError } from "@/shared/errors/app-error";
import type { ListQuery } from "@/shared/pagination/list-query";
import { IdentityErrors } from "../domain/errors";
import { assertCanChangeRole, assertCanDisable, assertNotLastAdmin } from "../domain/rules";
import type { UserDetail } from "../domain/types";
import type { CreateUserInput, UpdateUserInput, UserListFilters } from "./dto";
import type { IdentityRepos, LoginFailureCounter, PasswordHasher, PrincipalCache, UnitOfWork } from "./ports";

export interface UserServiceDeps {
  uow: UnitOfWork;
  hasher: PasswordHasher;
  failures: LoginFailureCounter;
  cache: PrincipalCache;
}

/** What the audit trail stores for a user (never the password hash). */
export function userSnapshot(u: UserDetail) {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    phone: u.phone,
    email: u.email,
    roleId: u.roleId,
    roleName: u.role.name,
    status: u.status,
    lockedAt: u.lockedAt,
    warehouses: u.warehouses.map((w) => w.code).sort(),
  };
}

export class UserService {
  constructor(private readonly d: UserServiceDeps) {}

  private get repos() {
    return this.d.uow.repos;
  }

  list(query: ListQuery<UserListFilters>) {
    return this.repos.users.list(query);
  }

  async get(id: string): Promise<UserDetail> {
    const user = await this.repos.users.findById(id);
    if (!user) throw new NotFoundError("User");
    return user;
  }

  async create(actor: ActorContext, input: CreateUserInput): Promise<UserDetail> {
    if (await this.repos.users.usernameExists(input.username)) throw IdentityErrors.usernameTaken(input.username);
    await this.assertRoleExists(this.repos, input.roleId);
    await this.assertWarehousesExist(this.repos, input.warehouseIds);
    const passwordHash = await this.d.hasher.hash(input.password);

    return this.d.uow.transaction(async (r) => {
      const user = await r.users.create({
        username: input.username,
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        roleId: input.roleId,
        passwordHash,
        warehouseIds: input.warehouseIds,
      });
      await r.audit.record(actor, { action: "user.create", entityType: "User", entityId: user.id, after: userSnapshot(user) });
      return user;
    });
  }

  async update(actor: ActorContext, id: string, input: UpdateUserInput): Promise<UserDetail> {
    const target = await this.get(id);
    assertCanChangeRole(actor.actorId ?? "", target, input.roleId);

    if (input.username && input.username !== target.username && (await this.repos.users.usernameExists(input.username, id))) {
      throw IdentityErrors.usernameTaken(input.username);
    }
    if (input.roleId && input.roleId !== target.roleId) {
      const newRole = await this.assertRoleExists(this.repos, input.roleId);
      if (target.role.isLocked && !newRole.isLocked && target.status === "ACTIVE") {
        assertNotLastAdmin(true, await this.repos.users.countActiveAdmins(target.id));
      }
    }
    if (input.warehouseIds) await this.assertWarehousesExist(this.repos, input.warehouseIds);

    const updated = await this.d.uow.transaction(async (r) => {
      const user = await r.users.update(id, input);
      await r.audit.record(actor, { action: "user.update", entityType: "User", entityId: id, before: userSnapshot(target), after: userSnapshot(user) });
      return user;
    });
    await this.d.cache.invalidateUser(id);
    return updated;
  }

  /** Disables the account and kills every session immediately. */
  async disable(actor: ActorContext, id: string): Promise<UserDetail> {
    const target = await this.get(id);
    assertCanDisable(actor.actorId ?? "", target);
    if (target.status === "DISABLED") return target;
    if (target.role.isLocked) assertNotLastAdmin(true, await this.repos.users.countActiveAdmins(target.id));

    const updated = await this.d.uow.transaction(async (r) => {
      const user = await r.users.setStatus(id, "DISABLED");
      await r.refreshTokens.revokeAllForUser(id, "user_disabled");
      await r.audit.record(actor, { action: "user.disable", entityType: "User", entityId: id, before: userSnapshot(target), after: userSnapshot(user) });
      return user;
    });
    await this.d.cache.invalidateUser(id);
    return updated;
  }

  async enable(actor: ActorContext, id: string): Promise<UserDetail> {
    const target = await this.get(id);
    if (target.status === "ACTIVE") return target;

    const updated = await this.d.uow.transaction(async (r) => {
      const user = await r.users.setStatus(id, "ACTIVE");
      await r.audit.record(actor, { action: "user.enable", entityType: "User", entityId: id, before: userSnapshot(target), after: userSnapshot(user) });
      return user;
    });
    await this.d.cache.invalidateUser(id);
    return updated;
  }

  /** Admin-only password reset. Unlocks the account and revokes all of the user's sessions. */
  async setPassword(actor: ActorContext, id: string, password: string): Promise<UserDetail> {
    const target = await this.get(id);
    const passwordHash = await this.d.hasher.hash(password);

    const updated = await this.d.uow.transaction(async (r) => {
      const user = await r.users.setPassword(id, passwordHash);
      const revoked = await r.refreshTokens.revokeAllForUser(id, "password_set");
      await r.audit.record(actor, {
        action: "user.password_set",
        entityType: "User",
        entityId: id,
        before: { lockedAt: target.lockedAt, passwordChangedAt: target.passwordChangedAt },
        after: { lockedAt: null, passwordChangedAt: user.passwordChangedAt, sessionsRevoked: revoked },
      });
      return user;
    });
    await this.d.failures.reset(target.username);
    await this.d.cache.invalidateUser(id);
    return updated;
  }

  private async assertRoleExists(repos: IdentityRepos, roleId: string) {
    const role = await repos.roles.findById(roleId);
    if (!role) throw IdentityErrors.unknownRole();
    return role;
  }

  private async assertWarehousesExist(repos: IdentityRepos, ids: string[]) {
    const found = await repos.warehouses.list({ ids, activeOnly: true });
    if (found.length !== ids.length) throw IdentityErrors.unknownWarehouse();
  }
}
