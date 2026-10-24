import { ZodError } from "zod";
import { AppError, type ErrorDetail } from "@/shared/errors/app-error";
import { isUniqueViolation } from "@/shared/db/prisma";
import type { Logger } from "@/shared/logger/logger";

export interface ErrorBody {
  error: { code: string; message: string; details: ErrorDetail[]; requestId: string };
}

export function zodDetails(err: ZodError): ErrorDetail[] {
  return err.issues.map((i) => ({ path: i.path.join("."), message: i.message, code: i.code }));
}

/** Maps any thrown value to an HTTP status and the standard error envelope. */
export function toErrorBody(err: unknown, requestId: string, log: Logger): { status: number; body: ErrorBody } {
  const make = (status: number, code: string, message: string, details: ErrorDetail[] = []) => ({
    status,
    body: { error: { code, message, details, requestId } },
  });

  if (err instanceof AppError) return make(err.status, err.code, err.message, err.details);
  if (err instanceof ZodError) return make(400, "VALIDATION_ERROR", "The request is invalid.", zodDetails(err));
  if (isUniqueViolation(err)) return make(409, "CONFLICT", "A record with the same unique value already exists.");
  if ((err as { code?: string } | null)?.code === "P2003") return make(409, "CONFLICT", "The record is still referenced by other data.");

  log.error({ err }, "unhandled error");
  return make(500, "INTERNAL_ERROR", "An unexpected error occurred.");
}
