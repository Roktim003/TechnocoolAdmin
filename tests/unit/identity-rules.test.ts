import { describe, expect, it } from "vitest";
import {
  assertCanChangeRole,
  assertCanDisable,
  assertNotLastAdmin,
  assertRoleDeletable,
  assertRoleEditable,
  initialPermissions,
  normalizeUsername,
  roleNameKey,
  shouldLock,
  USERNAME_PATTERN,
} from "@/modules/identity/domain/rules";
import { SEED_ROLES } from "@/modules/identity/domain/seed-roles";
import { MODULE_KEYS } from "@/shared/rbac/levels";

describe("usernames", () => {
  it("are normalised to lower case and trimmed", () => {
    expect(normalizeUsername("  Rahim.Store ")).toBe("rahim.store");
  });

  it("allow letters, digits, dot, dash, underscore (3–32)", () => {
    expect(USERNAME_PATTERN.test("store_a-1.x")).toBe(true);
    expect(USERNAME_PATTERN.test("ab")).toBe(false);
    expect(USERNAME_PATTERN.test("has space")).toBe(false);
    expect(USERNAME_PATTERN.test("a".repeat(33))).toBe(false);
  });
});

describe("role names", () => {
  it("compare case- and whitespace-insensitively", () => {
    expect(roleNameKey("  Store   Manager ")).toBe(roleNameKey("store manager"));
  });
});

describe("user rules", () => {
  it("a user cannot disable themselves", () => {
    expect(() => assertCanDisable("u1", { id: "u1" })).toThrow(expect.objectContaining({ status: 422 }));
    expect(() => assertCanDisable("u1", { id: "u2" })).not.toThrow();
  });

  it("a user cannot change their own role", () => {
    expect(() => assertCanChangeRole("u1", { id: "u1", roleId: "r1" }, "r2")).toThrow(expect.objectContaining({ status: 422 }));
    expect(() => assertCanChangeRole("u1", { id: "u1", roleId: "r1" }, "r1")).not.toThrow();
    expect(() => assertCanChangeRole("u1", { id: "u2", roleId: "r1" }, "r2")).not.toThrow();
  });

  it("the last active Admin cannot be removed", () => {
    expect(() => assertNotLastAdmin(true, 0)).toThrow(expect.objectContaining({ status: 422 }));
    expect(() => assertNotLastAdmin(true, 1)).not.toThrow();
    expect(() => assertNotLastAdmin(false, 0)).not.toThrow();
  });
});

describe("login lockout", () => {
  it("locks once failures reach the limit", () => {
    expect(shouldLock(4, 5)).toBe(false);
    expect(shouldLock(5, 5)).toBe(true);
    expect(shouldLock(6, 5)).toBe(true);
  });
});

describe("role rules", () => {
  it("locked roles cannot be edited or deleted", () => {
    expect(() => assertRoleEditable({ isLocked: true })).toThrow(expect.objectContaining({ status: 422 }));
    expect(() => assertRoleDeletable({ isLocked: true, userCount: 0 })).toThrow(/locked/);
  });

  it("roles with users cannot be deleted", () => {
    expect(() => assertRoleDeletable({ isLocked: false, userCount: 3 })).toThrow(/3 users/);
    expect(() => assertRoleDeletable({ isLocked: false, userCount: 1 })).toThrow(/1 user\./);
    expect(() => assertRoleDeletable({ isLocked: false, userCount: 0 })).not.toThrow();
  });

  it("new roles start blank or as a copy (not a shared reference)", () => {
    const blank = initialPermissions();
    expect(Object.values(blank.permissions).every((l) => l === "NONE")).toBe(true);
    expect(blank.flags).toEqual({ seeCost: false, seeProfit: false, seeMargin: false });

    const template = SEED_ROLES[1]!;
    const copy = initialPermissions(template);
    expect(copy).toEqual({ permissions: template.permissions, flags: template.flags });
    copy.permissions.users = "FULL";
    expect(template.permissions.users).toBe("NONE");
  });

  it("seed roles define every module", () => {
    for (const r of SEED_ROLES) expect(Object.keys(r.permissions).sort()).toEqual([...MODULE_KEYS].sort());
    expect(SEED_ROLES.filter((r) => r.isLocked).map((r) => r.name)).toEqual(["Admin"]);
  });
});
