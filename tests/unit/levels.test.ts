import { describe, expect, it } from "vitest";
import { emptyPermissionMap, hasLevel, levelRank, PERMISSION_LEVELS } from "@/shared/rbac/levels";
import { hasPermission, requirePermission, requireWarehouse } from "@/shared/rbac/guards";
import type { Principal } from "@/shared/auth/principal";

describe("permission levels", () => {
  it("are ordered NONE < VIEW < CREATE < APPROVE < FULL", () => {
    expect(PERMISSION_LEVELS.map(levelRank)).toEqual([0, 1, 2, 3, 4]);
  });

  it.each([
    ["FULL", "NONE", true],
    ["FULL", "FULL", true],
    ["APPROVE", "CREATE", true],
    ["APPROVE", "APPROVE", true],
    ["APPROVE", "FULL", false],
    ["CREATE", "VIEW", true],
    ["VIEW", "CREATE", false],
    ["NONE", "VIEW", false],
    ["NONE", "NONE", true],
  ] as const)("hasLevel(%s, %s) = %s", (actual, required, expected) => {
    expect(hasLevel(actual, required)).toBe(expected);
  });

  it("treats a missing level as NONE", () => {
    expect(hasLevel(undefined, "VIEW")).toBe(false);
    expect(hasLevel(undefined, "NONE")).toBe(true);
  });
});

describe("guards", () => {
  const principal = (overrides: Partial<Principal> = {}): Principal => ({
    userId: "u1",
    username: "u",
    name: "U",
    roleId: "r1",
    roleName: "Manager",
    isAdmin: false,
    permissions: { ...emptyPermissionMap(), inventory: "APPROVE", users: "VIEW" },
    flags: { seeCost: false, seeProfit: false, seeMargin: false },
    warehouseIds: ["w-a"],
    permissionVersion: 1,
    authMethod: "bearer",
    ...overrides,
  });

  it("requirePermission passes at or above the minimum and throws 403 below it", () => {
    const p = principal();
    expect(hasPermission(p, "inventory", "CREATE")).toBe(true);
    expect(() => requirePermission(p, "inventory", "APPROVE")).not.toThrow();
    expect(() => requirePermission(p, "users", "FULL")).toThrow(expect.objectContaining({ status: 403, code: "FORBIDDEN" }));
    expect(() => requirePermission(p, "reports", "VIEW")).toThrow(/Reports/);
  });

  it("requireWarehouse enforces the user's warehouse scope", () => {
    const p = principal();
    expect(() => requireWarehouse(p, "w-a")).not.toThrow();
    expect(() => requireWarehouse(p, "w-b")).toThrow(expect.objectContaining({ status: 403 }));
  });
});
