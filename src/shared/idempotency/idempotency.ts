import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma, isUniqueViolation } from "@/shared/db/prisma";
import { ConflictError, ValidationError } from "@/shared/errors/app-error";

export const IDEMPOTENCY_HEADER = "idempotency-key";
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const KEY_PATTERN = /^[A-Za-z0-9_\-:.]{8,128}$/;

export interface StoredResponse {
  status: number;
  body: unknown;
}

export type IdempotencyStart =
  | { kind: "new"; recordId: string }
  | { kind: "replay"; response: StoredResponse };

export function requestHash(method: string, path: string, body: string): string {
  return createHash("sha256").update(`${method.toUpperCase()}\n${path}\n${body}`).digest("hex");
}

/**
 * Claims an idempotency key for (user, key). Returns `replay` with the saved response when the
 * same request was already completed; throws 409 when the key was used with a different request
 * or the original is still in flight.
 */
export async function beginIdempotent(input: { key: string; userId: string; method: string; path: string; body: string }): Promise<IdempotencyStart> {
  if (!KEY_PATTERN.test(input.key)) {
    throw new ValidationError("Idempotency-Key must be 8–128 characters of letters, digits, '-', '_', ':' or '.'.");
  }
  const hash = requestHash(input.method, input.path, input.body);

  for (let attempt = 0; attempt < 2; attempt++) {
    const existing = await prisma.idempotencyKey.findUnique({ where: { userId_key: { userId: input.userId, key: input.key } } });

    if (existing && existing.expiresAt <= new Date()) {
      await prisma.idempotencyKey.deleteMany({ where: { id: existing.id, expiresAt: { lte: new Date() } } });
      continue;
    }
    if (existing) {
      if (existing.requestHash !== hash) {
        throw new ConflictError("This Idempotency-Key was already used with a different request.", [], "IDEMPOTENCY_KEY_REUSED");
      }
      if (existing.responseStatus === null) {
        throw new ConflictError("A request with this Idempotency-Key is still being processed.", [], "IDEMPOTENCY_IN_PROGRESS");
      }
      return { kind: "replay", response: { status: existing.responseStatus, body: existing.responseBody } };
    }

    try {
      const created = await prisma.idempotencyKey.create({
        data: {
          key: input.key,
          userId: input.userId,
          method: input.method.toUpperCase(),
          path: input.path,
          requestHash: hash,
          expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
        },
      });
      return { kind: "new", recordId: created.id };
    } catch (err) {
      // A concurrent request claimed the key between our read and insert: re-read and decide.
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new ConflictError("A request with this Idempotency-Key is still being processed.", [], "IDEMPOTENCY_IN_PROGRESS");
}

export async function completeIdempotent(recordId: string, response: StoredResponse): Promise<void> {
  await prisma.idempotencyKey.update({
    where: { id: recordId },
    data: { responseStatus: response.status, responseBody: response.body === undefined || response.body === null ? Prisma.JsonNull : (response.body as Prisma.InputJsonValue) },
  });
}

/** Releases the key after a server error so the client can safely retry. */
export async function abandonIdempotent(recordId: string): Promise<void> {
  await prisma.idempotencyKey.deleteMany({ where: { id: recordId } });
}

export async function purgeExpiredIdempotencyKeys(): Promise<number> {
  const { count } = await prisma.idempotencyKey.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  return count;
}
