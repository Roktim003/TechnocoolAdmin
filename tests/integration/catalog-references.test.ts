import { beforeEach, describe, expect, it } from "vitest";
import * as catalogsRoute from "@/app/api/v1/catalogs/route";
import * as catalogRoute from "@/app/api/v1/catalogs/[id]/route";
import * as categoriesRoute from "@/app/api/v1/categories/route";
import * as categoryRoute from "@/app/api/v1/categories/[id]/route";
import * as unitsRoute from "@/app/api/v1/units/route";
import * as unitRoute from "@/app/api/v1/units/[id]/route";
import * as matrixRoute from "@/app/api/v1/roles/matrix/route";
import * as openapiRoute from "@/app/api/v1/openapi.json/route";
import { call } from "../helpers/http";
import { prisma, resetDatabase } from "../helpers/db";
import { adminToken } from "../helpers/fixtures";
import { catalogId, createProduct, tokenForRole, unitId } from "../helpers/catalog";
import { seed } from "../../prisma/seed";
import { TEST_ENV } from "../setup/test-env";

let token: string;

beforeEach(async () => {
  await resetDatabase();
  token = await adminToken();
});

describe("seed", () => {
  it("creates the brand catalogs, categories and units", async () => {
    const catalogs = await call(catalogsRoute.GET, "GET", "/catalogs", { token });
    expect(catalogs.body.data.map((c: any) => c.name)).toEqual(["LG", "Daikin", "Dunham-Bush"]);
    expect(catalogs.body.data.every((c: any) => c.productCount === 0 && c.isActive)).toBe(true);
    const categories = (await call(categoriesRoute.GET, "GET", "/categories", { token })).body.data.map((c: any) => c.name);
    expect(categories.sort()).toEqual(
      ["Split AC", "Cassette AC", "Ducted AC", "VRF / VRV", "Chiller", "Fan coil unit", "AHU", "Accessories", "Piping", "Electrical", "Controls"].sort(),
    );
    const units = (await call(unitsRoute.GET, "GET", "/units", { token })).body.data.map((u: any) => u.code);
    expect(units.sort()).toEqual(["box", "kg", "ltr", "m", "pcs", "roll", "set", "sheet"]);
  });

  it("is idempotent and keeps changes made in the app", async () => {
    await prisma.catalog.update({ where: { id: await catalogId("LG") }, data: { description: "edited", isActive: false } });
    await seed(prisma, { adminUsername: "admin", adminPassword: TEST_ENV.ADMIN_PASSWORD!, adminName: "x", bcryptRounds: 4 });
    expect(await prisma.catalog.count()).toBe(3);
    expect(await prisma.unit.count()).toBe(8);
    expect(await prisma.catalog.findFirstOrThrow({ where: { name: "LG" } })).toMatchObject({ description: "edited", isActive: false });
  });

  it("gives Admin FULL and the other roles VIEW on the catalog", async () => {
    const roles = (await call(matrixRoute.GET, "GET", "/roles/matrix", { token })).body.data.roles;
    expect(Object.fromEntries(roles.map((r: any) => [r.name, r.permissions.catalog]))).toEqual({ Admin: "FULL", Accounts: "VIEW", Manager: "VIEW", "Store Manager": "VIEW" });
  });
});

describe("catalogs", () => {
  it("creates, renames, deactivates and deletes an unused catalog; names are unique case-insensitively", async () => {
    const created = await call(catalogsRoute.POST, "POST", "/catalogs", { token, body: { name: "Gree" } });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: "Gree", sortOrder: 4, isActive: true, productCount: 0 });
    expect((await call(catalogsRoute.POST, "POST", "/catalogs", { token, body: { name: " gree " } })).status).toBe(409);

    const id = created.body.data.id;
    const upd = await call(catalogRoute.PATCH, "PATCH", `/catalogs/${id}`, { token, params: { id }, body: { name: "Gree Electric", isActive: false } });
    expect(upd.body.data).toMatchObject({ name: "Gree Electric", isActive: false });
    expect((await call(catalogRoute.DELETE, "DELETE", `/catalogs/${id}`, { token, params: { id } })).status).toBe(204);
    expect(await prisma.auditLog.count({ where: { entityType: "Catalog", entityId: id } })).toBe(3);
  });

  it("reports product counts", async () => {
    await createProduct(token);
    await createProduct(token);
    const catalogs = (await call(catalogsRoute.GET, "GET", "/catalogs", { token })).body.data;
    expect(catalogs.find((c: any) => c.name === "LG").productCount).toBe(2);
  });

  it("requires FULL to manage, VIEW to list", async () => {
    const { token: view } = await tokenForRole(token, "Manager");
    expect((await call(catalogsRoute.GET, "GET", "/catalogs", { token: view })).status).toBe(200);
    expect((await call(catalogsRoute.POST, "POST", "/catalogs", { token: view, body: { name: "X" } })).status).toBe(403);
    expect((await call(categoriesRoute.POST, "POST", "/categories", { token: view, body: { name: "X" } })).status).toBe(403);
    expect((await call(unitsRoute.POST, "POST", "/units", { token: view, body: { code: "x", name: "X" } })).status).toBe(403);
  });
});

describe("categories and units", () => {
  it("creates, renames and deactivates categories", async () => {
    const c = await call(categoriesRoute.POST, "POST", "/categories", { token, body: { name: "Ventilation" } });
    expect(c.status).toBe(201);
    expect((await call(categoriesRoute.POST, "POST", "/categories", { token, body: { name: "split ac" } })).status).toBe(409);
    const id = c.body.data.id;
    const upd = await call(categoryRoute.PATCH, "PATCH", `/categories/${id}`, { token, params: { id }, body: { name: "Ventilation fan", isActive: false } });
    expect(upd.body.data).toMatchObject({ name: "Ventilation fan", isActive: false });
  });

  it("creates units with lower-case codes, renames and deactivates them", async () => {
    const u = await call(unitsRoute.POST, "POST", "/units", { token, body: { code: "PAIR", name: "Pair" } });
    expect(u.status).toBe(201);
    expect(u.body.data.code).toBe("pair");
    expect((await call(unitsRoute.POST, "POST", "/units", { token, body: { code: "pcs", name: "Dup" } })).status).toBe(409);
    expect((await call(unitsRoute.POST, "POST", "/units", { token, body: { code: "1x", name: "Bad" } })).status).toBe(400);
    const id = await unitId("box");
    const upd = await call(unitRoute.PATCH, "PATCH", `/units/${id}`, { token, params: { id }, body: { name: "Carton", isActive: false } });
    expect(upd.body.data).toMatchObject({ code: "box", name: "Carton", isActive: false });
    expect((await call(unitRoute.PATCH, "PATCH", `/units/${id}`, { token, params: { id }, body: { code: "crt" } })).status).toBe(400);
  });
});

describe("OpenAPI", () => {
  it("documents every catalog endpoint", async () => {
    const doc = await (await openapiRoute.GET()).json();
    const ops = Object.entries(doc.paths as Record<string, object>).flatMap(([p, m]) => Object.keys(m).map((x) => `${x.toUpperCase()} ${p}`));
    expect(ops).toEqual(
      expect.arrayContaining([
        "GET /catalogs", "POST /catalogs", "PATCH /catalogs/{id}", "DELETE /catalogs/{id}",
        "GET /categories", "POST /categories", "PATCH /categories/{id}", "DELETE /categories/{id}",
        "GET /units", "POST /units", "PATCH /units/{id}",
        "GET /products", "POST /products", "GET /products/{id}", "PATCH /products/{id}",
        "POST /products/{id}/discontinue", "POST /products/{id}/reactivate", "GET /products/{id}/history",
        "GET /products/by-code/{code}", "GET /products/by-barcode/{barcode}", "GET /products/check-code",
        "POST /products/{id}/photos", "PATCH /products/{id}/photos/{photoId}", "DELETE /products/{id}/photos/{photoId}", "GET /products/{id}/photos/{photoId}/file",
        "GET /products/import/template", "POST /products/import", "GET /products/import/{jobId}", "GET /products/export",
      ]),
    );
    expect(doc.components.schemas.ProductSummary.properties.purchaseCost).toBeDefined();
    expect(doc.components.schemas.CreateProductRequest.required).toEqual(expect.arrayContaining(["code", "name", "catalogId", "categoryId", "unitId", "sellingPrice"]));
  });
});
