-- The new "overheads" permission for existing roles (a separate migration: PostgreSQL can't use
-- an enum value in the transaction that adds it). Admin and Accounts get FULL, every other role
-- (Manager, Store Manager, custom roles) NONE. Roles that already have a row are left alone.
INSERT INTO "RolePermission" ("roleId", "module", "level")
SELECT r."id", 'overheads', CASE WHEN r."name" IN ('Admin', 'Accounts') THEN 'FULL'::"PermissionLevel" ELSE 'NONE'::"PermissionLevel" END
FROM "Role" r
WHERE NOT EXISTS (SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id" AND rp."module" = 'overheads');
