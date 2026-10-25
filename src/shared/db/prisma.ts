import { PrismaClient, type Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** DATABASE_URL with DATABASE_POOL_SIZE applied as Prisma's connection_limit (each process has its own pool). */
export function databaseUrl(url = process.env.DATABASE_URL, poolSize = process.env.DATABASE_POOL_SIZE): string | undefined {
  if (!url || !poolSize?.trim()) return url;
  const u = new URL(url);
  u.searchParams.set("connection_limit", poolSize.trim());
  return u.toString();
}

/** Single PrismaClient per process (survives Next.js dev hot reloads). */
export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    ...(databaseUrl() ? { datasourceUrl: databaseUrl() } : {}),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** A Prisma client or an interactive-transaction client; repositories accept either. */
export type Db = PrismaClient | Prisma.TransactionClient;

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}
