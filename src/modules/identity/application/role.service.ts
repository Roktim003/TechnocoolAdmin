import type { ActorContext } from "@/modules/audit/application/audit.service";
import { NotFoundError } from "@/shared/errors/app-error";
import type { PermissionMap } from "@/shared/rbac/levels";
import { IdentityErrors } from "../domain/errors";
import { assertRoleDeletable, assertRoleEditable, initialPermissions, roleNameKey } from "../domain/rules";
import type { Role } from "../domain/types";
import type { CreateRoleInput, UpdateRoleInput } from "./dto";
import type { PrincipalCache, UnitOfWork } from "./ports";

function roleSnapshot(r: Role) {
  return { id: r.id, name: r.name, description: r.description, permissions: r.permissions, flags: r.flags, permissionVersion: r.permissionVersion };
}

export class RoleService {
  constructor(private readonly d: { uow: UnitOfWork; cache: PrincipalCache }) {}

  private get repos() {
    return this.d.uow.repos;
  }

  list(): Promise<Role[]> {
    return this.repos.roles.list();
  }

  async get(id: string): Promise<Role> {
    const role = await this.repos.roles.findById(id);
    if (!role) throw new NotFoundError("Role");
    return role;
  }

  /** Creates a blank role (all NONE) or a copy of `copyFromRoleId`'s permissions and flags. */
  async create(actor: ActorContext, input: CreateRoleInput): Promise<Role> {
    const nameKey = roleNameKey(input.name);
    if (await this.repos.roles.nameExists(nameKey)) throw IdentityErrors.roleNameTaken(input.name);

    let template: Role | undefined;
    if (input.copyFromRoleId) {
      template = (await this.repos.roles.findById(input.copyFromRoleId)) ?? undefined;
      if (!template) throw IdentityErrors.unknownRole();
    }
    const { permissions, flags } = initialPermissions(template);

    return this.d.uow.transaction(async (r) => {
      const role = await r.roles.create({ name: input.name.trim(), nameKey, description: input.description ?? null, permissions, flags });
      await r.audit.record(actor, {
        action: "role.create",
        entityType: "Role",
        entityId: role.id,
        after: { ...roleSnapshot(role), copiedFrom: template ? { id: template.id, name: template.name } : null },
      });
      return role;
    });
  }

  async update(actor: ActorContext, id: string, input: UpdateRoleInput): Promise<Role> {
    const before = await this.get(id);
    assertRoleEditable(before);

    let nameKey: string | undefined;
    if (input.name !== undefined) {
      nameKey = roleNameKey(input.name);
      if (await this.repos.roles.nameExists(nameKey, id)) throw IdentityErrors.roleNameTaken(input.name);
    }

    const updated = await this.d.uow.transaction(async (r) => {
      const role = await r.roles.update(id, {
        ...(input.name !== undefined ? { name: input.name.trim(), nameKey } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        permissions: input.permissions as Partial<PermissionMap> | undefined,
        flags: input.flags,
      });
      await r.audit.record(actor, { action: "role.update", entityType: "Role", entityId: id, before: roleSnapshot(before), after: roleSnapshot(role) });
      return role;
    });
    await this.d.cache.invalidateRole(id);
    return updated;
  }

  /** Deletes a custom role. Blocked (422) for the Admin role and for roles with users. */
  async delete(actor: ActorContext, id: string): Promise<void> {
    await this.d.uow.transaction(async (r) => {
      const role = await r.roles.findById(id);
      if (!role) throw new NotFoundError("Role");
      assertRoleDeletable(role);
      await r.roles.delete(id);
      await r.audit.record(actor, { action: "role.delete", entityType: "Role", entityId: id, before: roleSnapshot(role) });
    });
    await this.d.cache.invalidateRole(id);
  }
}
