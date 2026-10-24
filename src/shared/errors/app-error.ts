/**
 * Framework-free error types. Domain and application layers throw these; the HTTP
 * layer maps them to status codes and the error envelope (shared/http/errors.ts).
 */

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_LOCKED"
  | "ACCOUNT_DISABLED"
  | "TOKEN_EXPIRED"
  | "REFRESH_TOKEN_REUSED"
  | "FORBIDDEN"
  | "CSRF_REJECTED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "IDEMPOTENCY_KEY_REUSED"
  | "IDEMPOTENCY_IN_PROGRESS"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "BUSINESS_RULE"
  | "RATE_LIMITED"
  | "QUERY_TIMEOUT"
  | "INTERNAL_ERROR";

export interface ErrorDetail {
  path?: string;
  message: string;
  code?: string;
  /** Machine-readable extras, e.g. the remaining quantity of an OVER_RECEIPT. */
  meta?: Record<string, string>;
}

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
    readonly details: ErrorDetail[] = [],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message = "The request is invalid.", details: ErrorDetail[] = []) {
    super("VALIDATION_ERROR", 400, message, details);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Authentication is required.", code: ErrorCode = "UNAUTHENTICATED") {
    super(code, 401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.", code: ErrorCode = "FORBIDDEN") {
    super(code, 403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string) {
    super("NOT_FOUND", 404, `${entity} was not found.`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details: ErrorDetail[] = [], code: ErrorCode = "CONFLICT") {
    super(code, 409, message, details);
  }
}

/** A request that is well-formed but violates a business rule (HTTP 422). */
export class BusinessRuleError extends AppError {
  constructor(
    message: string,
    readonly rule?: string,
    extra?: { path?: string; meta?: Record<string, string> },
  ) {
    super("BUSINESS_RULE", 422, message, rule ? [{ code: rule, message, ...(extra?.path ? { path: extra.path } : {}), ...(extra?.meta ? { meta: extra.meta } : {}) }] : []);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests. Please try again later.") {
    super("RATE_LIMITED", 429, message);
  }
}
