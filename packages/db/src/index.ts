import { PrismaClient } from "@prisma/client";

declare global {
  var __zenoraPrisma: PrismaClient | undefined;
}

// Reuse a single client across hot reloads in dev (Next.js/ts-node-dev both
// re-evaluate modules); avoids exhausting the Postgres connection pool.
export const prisma = globalThis.__zenoraPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__zenoraPrisma = prisma;
}

export * from "@prisma/client";
