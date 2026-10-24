import type { ListQuery } from "@/shared/pagination/list-query";
import type { AuditListFilters } from "./dto";

/** Who did something, from where. Passed from the interface layer into every mutating use-case. */
export interface ActorContext {
  actorId: string | null;
  ip: string | null;
  requestId: string | null;
}

export interface AuditEntryInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

export interface AuditLogRecord {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  requestId: string | null;
  createdAt: Date;
  user: { id: string; name: string; username: string } | null;
}

export interface AuditRepository {
  insert(row: Omit<AuditLogRecord, "id" | "createdAt" | "user">): Promise<void>;
  list(query: ListQuery<AuditListFilters>): Promise<{ items: AuditLogRecord[]; total: number }>;
}

const SECRET_KEYS = new Set(["password", "passwordHash", "tokenHash", "refreshToken", "accessToken"]);

/** Removes secrets and converts the snapshot to plain JSON before it is persisted. */
export function sanitizeSnapshot(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  return JSON.parse(
    JSON.stringify(value, (key, v) => (SECRET_KEYS.has(key) ? undefined : v)),
  );
}

/**
 * Reusable audit trail. Mutating use-cases in every module call `record` inside the same
 * transaction as the change (pass a repository bound to the transaction).
 */
export class AuditService {
  constructor(private readonly repo: AuditRepository) {}

  async record(actor: ActorContext, entry: AuditEntryInput): Promise<void> {
    await this.repo.insert({
      userId: actor.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: sanitizeSnapshot(entry.before),
      after: sanitizeSnapshot(entry.after),
      ip: actor.ip,
      requestId: actor.requestId,
    });
  }

  list(query: ListQuery<AuditListFilters>) {
    return this.repo.list(query);
  }
}
