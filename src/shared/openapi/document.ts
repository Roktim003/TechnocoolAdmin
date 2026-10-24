import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { z } from "@/shared/validation/zod";
import { json, registry } from "./registry";
// Each module registers its paths as a side effect of importing its openapi file.
import "@/modules/identity/interface/openapi";
import "@/modules/audit/interface/openapi";
import "@/modules/catalog/interface/openapi";
import "@/modules/inventory/interface/openapi";
import "@/modules/inventory/interface/openapi-control";
import "@/modules/notifications/interface/openapi";
import "@/modules/purchasing/interface/openapi";
import "@/modules/projects/interface/openapi";
import "@/modules/reporting/interface/openapi";

registry.registerPath({
  method: "get",
  path: "/health",
  tags: ["System"],
  summary: "Liveness / readiness: checks PostgreSQL and Redis",
  responses: {
    200: json(z.object({ data: z.object({ status: z.literal("ok"), checks: z.record(z.unknown()), time: z.string() }) })),
    503: json(z.object({ data: z.object({ status: z.literal("degraded"), checks: z.record(z.unknown()), time: z.string() }) }), "A dependency is down"),
  },
});

let cached: ReturnType<OpenApiGeneratorV31["generateDocument"]> | undefined;

export function openApiDocument() {
  cached ??= new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "StockBook API",
      version: "1.0.0",
      description:
        "REST API for StockBook (web + mobile). Success: `{ data, meta? }`. Error: `{ error: { code, message, details, requestId } }`. " +
        "Every response carries an `X-Request-Id` header. Lists accept `page`, `pageSize` (≤100), `sort` (e.g. `name,-createdAt`), `q` and field filters. " +
        "Timezone: Asia/Dhaka. Currency: BDT.",
    },
    servers: [{ url: "/api/v1" }],
    tags: [
      { name: "Auth" },
      { name: "Users" },
      { name: "Roles" },
      { name: "Warehouses" },
      { name: "Login history" },
      { name: "Audit log" },
      { name: "Catalog" },
      { name: "Stock" },
      { name: "Masters" },
      { name: "Stock counts" },
      { name: "Opening stock" },
      { name: "Low stock" },
      { name: "Suppliers" },
      { name: "Purchase orders" },
      { name: "Projects" },
      { name: "Reports" },
      { name: "Report schedules" },
      { name: "Dashboard" },
      { name: "Notifications" },
      { name: "System" },
    ],
  });
  return cached;
}
