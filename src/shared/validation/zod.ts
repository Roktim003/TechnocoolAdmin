import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Every schema that should appear in the OpenAPI document must be built from this `z`,
// so the `.openapi()` extension is installed before any schema is defined.
extendZodWithOpenApi(z);

export { z };

export const UuidSchema = z.string().uuid();

/** Turns "" into undefined so optional query/form fields can be left blank. */
export const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());
