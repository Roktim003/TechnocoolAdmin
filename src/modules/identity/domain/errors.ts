import { AppError, BusinessRuleError, ConflictError, ForbiddenError, UnauthenticatedError } from "@/shared/errors/app-error";

/** Domain errors of the identity module. Each maps to a fixed HTTP status via AppError. */
export const IdentityErrors = {
  invalidCredentials: () => new UnauthenticatedError("Wrong username or password.", "INVALID_CREDENTIALS"),
  accountLocked: () =>
    new AppError("ACCOUNT_LOCKED", 403, "This account is locked after too many failed login attempts. Ask an Admin to set a new password."),
  accountDisabled: () => new ForbiddenError("This account has been disabled. Contact an Admin.", "ACCOUNT_DISABLED"),
  sessionRevoked: () => new UnauthenticatedError("Your session has ended. Please log in again."),
  sessionIdle: () => new UnauthenticatedError("You were signed out after a period of inactivity. Please log in again.", "SESSION_IDLE"),
  refreshInvalid: () => new UnauthenticatedError("Refresh token is invalid or expired. Please log in again."),
  refreshReused: () => new UnauthenticatedError("Refresh token was already used. All sessions from this login were signed out.", "REFRESH_TOKEN_REUSED"),
  usernameTaken: (username: string) =>
    new ConflictError(`Username '${username}' is already taken.`, [{ path: "username", message: "Username is already taken." }]),
  roleNameTaken: (name: string) => new ConflictError(`A role named '${name}' already exists.`, [{ path: "name", message: "Role name is already taken." }]),
  cannotDisableSelf: () => new BusinessRuleError("You cannot disable your own account.", "CANNOT_DISABLE_SELF"),
  cannotChangeOwnRole: () => new BusinessRuleError("You cannot change your own role.", "CANNOT_CHANGE_OWN_ROLE"),
  lastAdmin: () => new BusinessRuleError("At least one active user must keep the Admin role.", "LAST_ADMIN"),
  roleLocked: () => new BusinessRuleError("The Admin role is locked and cannot be edited or deleted.", "ROLE_LOCKED"),
  roleInUse: (count: number) =>
    new BusinessRuleError(
      `This role is assigned to ${count} user${count === 1 ? "" : "s"}. Move them to another role before deleting it.`,
      "ROLE_IN_USE",
    ),
  unknownRole: () => new BusinessRuleError("The selected role does not exist.", "UNKNOWN_ROLE"),
  unknownWarehouse: () => new BusinessRuleError("One or more selected warehouses do not exist or are inactive.", "UNKNOWN_WAREHOUSE"),
};
