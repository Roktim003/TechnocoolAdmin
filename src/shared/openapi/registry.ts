import { OpenAPIRegistry, type RouteConfig } from "@asteasolutions/zod-to-openapi";
import { z } from "@/shared/validation/zod";
import { PageMetaSchema } from "@/shared/pagination/list-query";

export const registry = new OpenAPIRegistry();

registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: "Mobile / API clients: `Authorization: Bearer <accessToken>` from `POST /auth/login` with `client: \"mobile\"`.",
});
registry.registerComponent("securitySchemes", "cookieAuth", {
  type: "apiKey",
  in: "cookie",
  name: "sb_at",
  description: "Web clients: HttpOnly access-token cookie set by `POST /auth/login`. Mutations also require a same-site Origin header (CSRF).",
});

export const ErrorEnvelopeSchema = registry.register(
  "ErrorEnvelope",
  z.object({
    error: z.object({
      code: z.string().openapi({ example: "VALIDATION_ERROR" }),
      message: z.string(),
      details: z.array(z.object({ path: z.string().optional(), message: z.string(), code: z.string().optional() })),
      requestId: z.string(),
    }),
  }),
);

export const AUTHENTICATED: RouteConfig["security"] = [{ bearerAuth: [] }, { cookieAuth: [] }];

export const IdempotencyHeaders = z.object({
  "idempotency-key": z
    .string()
    .min(8)
    .max(128)
    .optional()
    .openapi({ description: "Optional. Replays of the same key + body return the saved response for 24h; a different body → 409." }),
});

export const IdParams = z.object({ id: z.string().uuid() });

export const json = (schema: z.ZodTypeAny, description = "OK") => ({ description, content: { "application/json": { schema } } });
export const dataOf = (schema: z.ZodTypeAny) => z.object({ data: schema });
export const listOf = (schema: z.ZodTypeAny) => z.object({ data: z.array(schema), meta: PageMetaSchema });

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: "Validation error",
  401: "Not authenticated, or token expired / revoked",
  403: "Forbidden (missing permission, CSRF rejected, account disabled/locked)",
  404: "Not found",
  409: "Conflict (duplicate, idempotency key reuse)",
  422: "Business rule violated",
  429: "Rate limited",
};

export function errors(...statuses: number[]): RouteConfig["responses"] {
  return Object.fromEntries(statuses.map((s) => [s, json(ErrorEnvelopeSchema, ERROR_DESCRIPTIONS[s] ?? "Error")]));
}
