import { randomUUID } from "node:crypto";
import { RateLimitError } from "@/shared/errors/app-error";
import type { Principal } from "@/shared/auth/principal";
import { NotFoundError } from "@/shared/errors/app-error";
import { IdentityErrors } from "../domain/errors";
import { normalizeUsername, shouldLock } from "../domain/rules";
import type { ClientType, LoginResult, Role, UserDetail } from "../domain/types";
import type { LoginInput } from "./dto";
import type {
  AccessTokenIssuer,
  IdentityConfig,
  LoginFailureCounter,
  PasswordHasher,
  PrincipalCache,
  RefreshTokenCodec,
  SessionActivity,
  UnitOfWork,
} from "./ports";

export interface RequestInfo {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export interface Session {
  user: UserDetail;
  role: Role;
  client: ClientType;
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface AuthDeps {
  uow: UnitOfWork;
  hasher: PasswordHasher;
  refreshCodec: RefreshTokenCodec;
  accessTokens: AccessTokenIssuer;
  failures: LoginFailureCounter;
  cache: PrincipalCache;
  config: IdentityConfig;
  /** Web idle timeout tracking (optional: without it web sessions never idle out). */
  activity?: SessionActivity;
  now?: () => Date;
}

class RotationRace extends Error {}

export class AuthService {
  private readonly now: () => Date;

  constructor(private readonly d: AuthDeps) {
    this.now = d.now ?? (() => new Date());
  }

  private get repos() {
    return this.d.uow.repos;
  }

  async login(input: LoginInput, req: RequestInfo): Promise<Session> {
    const username = normalizeUsername(input.username);
    const history = (userId: string | null, result: LoginResult) =>
      this.repos.loginHistory.record({ userId, usernameAttempted: username, result, client: input.client, ip: req.ip, userAgent: req.userAgent });

    const creds = await this.repos.users.findCredentials(username);

    if (!creds) {
      await this.d.hasher.dummyVerify(input.password);
      const failures = await this.d.failures.increment(username);
      if (failures > this.d.config.maxLoginFailures) {
        await history(null, "RATE_LIMITED");
        throw new RateLimitError("Too many failed login attempts. Try again in a few minutes.", this.d.config.loginFailureWindowSeconds ?? 900);
      }
      await history(null, "UNKNOWN_USER");
      throw IdentityErrors.invalidCredentials();
    }

    const { user, passwordHash } = creds;

    // A locked account stays locked until an Admin sets a new password; don't even check the password.
    if (user.lockedAt) {
      await history(user.id, "LOCKED");
      throw IdentityErrors.accountLocked();
    }

    if (!(await this.d.hasher.verify(input.password, passwordHash))) {
      const failures = await this.d.failures.increment(username);
      await history(user.id, "WRONG_PASSWORD");
      if (shouldLock(failures, this.d.config.maxLoginFailures)) {
        const at = this.now();
        await this.d.uow.transaction(async (r) => {
          await r.users.lock(user.id, at);
          await r.audit.record(
            { actorId: null, ip: req.ip, requestId: req.requestId },
            { action: "user.locked", entityType: "User", entityId: user.id, before: { lockedAt: null }, after: { lockedAt: at, failedAttempts: failures } },
          );
        });
        await this.d.cache.invalidateUser(user.id);
        throw IdentityErrors.accountLocked();
      }
      throw IdentityErrors.invalidCredentials();
    }

    if (user.status === "DISABLED") {
      await history(user.id, "DISABLED");
      throw IdentityErrors.accountDisabled();
    }

    await this.d.failures.reset(username);
    const at = this.now();
    await this.repos.users.recordLogin(user.id, at);
    const session = await this.issueSession({ ...user, lastLoginAt: at }, randomUUID(), input.client, req);
    await history(user.id, "SUCCESS");
    return session;
  }

  /**
   * Rotates a refresh token: the presented token is revoked and replaced by a new one in the
   * same family. Presenting an already-rotated token is treated as theft and revokes the family.
   */
  async refresh(rawToken: string, req: RequestInfo): Promise<Session> {
    const record = await this.repos.refreshTokens.findByHash(this.d.refreshCodec.hash(rawToken));
    if (!record) throw IdentityErrors.refreshInvalid();

    if (record.revokedAt) {
      await this.repos.refreshTokens.revokeFamily(record.familyId, "reuse_detected");
      throw IdentityErrors.refreshReused();
    }
    if (record.expiresAt <= this.now()) throw IdentityErrors.refreshInvalid();

    // Web sessions end after the idle timeout; the refresh itself counts as activity.
    if (record.client === "web" && this.idleTtl() && this.d.activity && !(await this.d.activity.touch(record.familyId, this.idleTtl()))) {
      await this.repos.refreshTokens.revokeFamily(record.familyId, "idle_timeout");
      throw IdentityErrors.sessionIdle();
    }

    const user = await this.repos.users.findById(record.userId);
    if (!user || user.status !== "ACTIVE" || user.lockedAt) {
      await this.repos.refreshTokens.revokeFamily(record.familyId, "user_inactive");
      throw IdentityErrors.sessionRevoked();
    }

    try {
      return await this.issueSession(user, record.familyId, record.client, req, record.id);
    } catch (err) {
      if (!(err instanceof RotationRace)) throw err;
      // Another request rotated this token first — the same token was used twice.
      await this.repos.refreshTokens.revokeFamily(record.familyId, "reuse_detected");
      throw IdentityErrors.refreshReused();
    }
  }

  /** Revokes the whole family of the given refresh token (this device's session). */
  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const record = await this.repos.refreshTokens.findByHash(this.d.refreshCodec.hash(rawToken));
    if (record) {
      await this.repos.refreshTokens.revokeFamily(record.familyId, "logout");
      await this.d.activity?.end(record.familyId);
    }
  }

  /** Idle timeout in seconds (0 = off). */
  idleTtl(): number {
    return (this.d.config.sessionIdleMinutes ?? 0) * 60;
  }

  /**
   * Called for every cookie-authenticated (web) request: extends the session, or throws 401
   * SESSION_IDLE when it has been idle longer than the timeout. Mobile (bearer) sessions are exempt.
   */
  async touchWebSession(sessionId: string | undefined): Promise<void> {
    if (!sessionId || !this.idleTtl() || !this.d.activity) return;
    if (!(await this.d.activity.touch(sessionId, this.idleTtl()))) throw IdentityErrors.sessionIdle();
  }

  async me(principal: Principal): Promise<{ user: UserDetail; role: Role }> {
    const [user, role] = await Promise.all([this.repos.users.findById(principal.userId), this.repos.roles.findById(principal.roleId)]);
    if (!user || !role) throw new NotFoundError("User");
    return { user, role };
  }

  private async issueSession(user: UserDetail, familyId: string, client: ClientType, req: RequestInfo, rotateFromId?: string): Promise<Session> {
    const role = await this.repos.roles.findById(user.roleId);
    if (!role) throw IdentityErrors.unknownRole();

    const refreshToken = this.d.refreshCodec.generate();
    const refreshTokenExpiresAt = new Date(this.now().getTime() + this.d.config.refreshTokenTtlDays * 86_400_000);

    await this.d.uow.transaction(async (r) => {
      const created = await r.refreshTokens.create({
        userId: user.id,
        tokenHash: this.d.refreshCodec.hash(refreshToken),
        familyId,
        client,
        expiresAt: refreshTokenExpiresAt,
        ip: req.ip,
        userAgent: req.userAgent,
      });
      if (rotateFromId && !(await r.refreshTokens.markRotated(rotateFromId, created.id))) throw new RotationRace();
    });

    if (!rotateFromId && client === "web" && this.idleTtl()) await this.d.activity?.start(familyId, this.idleTtl());
    const access = await this.d.accessTokens.issue({ sub: user.id, rid: role.id, pv: role.permissionVersion, tv: user.tokenVersion, sid: familyId });
    return { user, role, client, accessToken: access.token, accessTokenExpiresIn: access.expiresIn, refreshToken, refreshTokenExpiresAt };
  }
}
