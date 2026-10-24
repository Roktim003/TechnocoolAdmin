import type { AuditService } from "@/modules/audit/application/audit.service";
import type { ListQuery } from "@/shared/pagination/list-query";
import type { PermissionMap, SensitiveFlags } from "@/shared/rbac/levels";
import type {
  ClientType,
  LoginHistoryEntry,
  LoginResult,
  RefreshTokenRecord,
  Role,
  UserDetail,
  UserStatus,
  Warehouse,
} from "../domain/types";
import type { LoginHistoryFilters, UserListFilters } from "./dto";

/* Ports implemented by the infrastructure layer. Application services depend only on these. */

export interface UserRepository {
  findById(id: string): Promise<UserDetail | null>;
  findCredentials(username: string): Promise<{ user: UserDetail; passwordHash: string } | null>;
  usernameExists(username: string, exceptId?: string): Promise<boolean>;
  list(query: ListQuery<UserListFilters>): Promise<{ items: UserDetail[]; total: number }>;
  create(data: { username: string; name: string; phone: string | null; email: string | null; roleId: string; passwordHash: string; warehouseIds: string[] }): Promise<UserDetail>;
  update(
    id: string,
    data: Partial<{ username: string; name: string; phone: string | null; email: string | null; roleId: string; warehouseIds: string[] }>,
  ): Promise<UserDetail>;
  setStatus(id: string, status: UserStatus): Promise<UserDetail>;
  /** Stores a new hash, clears the lock and bumps tokenVersion. */
  setPassword(id: string, passwordHash: string): Promise<UserDetail>;
  lock(id: string, at: Date): Promise<void>;
  recordLogin(id: string, at: Date): Promise<void>;
  /** Active users on a locked (Admin) role, optionally excluding one user. */
  countActiveAdmins(exceptUserId?: string): Promise<number>;
}

export interface RoleRepository {
  findById(id: string): Promise<Role | null>;
  nameExists(nameKey: string, exceptId?: string): Promise<boolean>;
  list(): Promise<Role[]>;
  create(data: { name: string; nameKey: string; description: string | null; permissions: PermissionMap; flags: SensitiveFlags }): Promise<Role>;
  /** Applies the changes and bumps permissionVersion. */
  update(id: string, data: { name?: string; nameKey?: string; description?: string | null; permissions?: Partial<PermissionMap>; flags?: Partial<SensitiveFlags> }): Promise<Role>;
  delete(id: string): Promise<void>;
}

export interface WarehouseRepository {
  list(opts?: { ids?: string[]; activeOnly?: boolean }): Promise<Warehouse[]>;
}

export interface RefreshTokenRepository {
  create(data: { userId: string; tokenHash: string; familyId: string; client: ClientType; expiresAt: Date; ip: string | null; userAgent: string | null }): Promise<RefreshTokenRecord>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /** Marks `id` revoked (replaced by `replacedById`) only if it is still active. Returns false if it was already revoked. */
  markRotated(id: string, replacedById: string): Promise<boolean>;
  revokeFamily(familyId: string, reason: string): Promise<number>;
  revokeAllForUser(userId: string, reason: string): Promise<number>;
}

export interface LoginHistoryRepository {
  record(entry: { userId: string | null; usernameAttempted: string; result: LoginResult; client: ClientType | null; ip: string | null; userAgent: string | null }): Promise<void>;
  list(query: ListQuery<LoginHistoryFilters>): Promise<{ items: LoginHistoryEntry[]; total: number }>;
}

/** Repositories bound to one database client (root or transaction). */
export interface IdentityRepos {
  users: UserRepository;
  roles: RoleRepository;
  warehouses: WarehouseRepository;
  refreshTokens: RefreshTokenRepository;
  loginHistory: LoginHistoryRepository;
  audit: AuditService;
}

export interface UnitOfWork {
  /** Repositories on the root connection (no transaction). */
  repos: IdentityRepos;
  transaction<T>(fn: (repos: IdentityRepos) => Promise<T>): Promise<T>;
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
  /** Spends the same time as `verify` for unknown users (timing-attack resistance). */
  dummyVerify(plain: string): Promise<void>;
}

export interface RefreshTokenCodec {
  generate(): string;
  hash(token: string): string;
}

export interface AccessTokenIssuer {
  issue(claims: { sub: string; rid: string; pv: number; tv: number }): Promise<{ token: string; expiresIn: number }>;
}

/** Counts failed logins per username within a sliding window (Redis). */
export interface LoginFailureCounter {
  increment(username: string): Promise<number>;
  reset(username: string): Promise<void>;
}

/** Cache of user/role data needed on every request; services invalidate after changes. */
export interface PrincipalCache {
  invalidateUser(userId: string): Promise<void>;
  invalidateRole(roleId: string): Promise<void>;
}

export interface IdentityConfig {
  maxLoginFailures: number;
  refreshTokenTtlDays: number;
}
