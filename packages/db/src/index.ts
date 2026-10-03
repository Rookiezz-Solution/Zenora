import { PrismaClient } from "@prisma/client";

declare global {
  var __zenoraPrisma: PrismaClient | undefined;
}

// Reuse a single client across hot reloads in dev (Next.js/ts-node-dev both
// re-evaluate modules); avoids exhausting the Postgres connection pool.
// ZENORA_LOG_QUERIES=true prints every SQL statement (a development aid for counting
// queries per request: against a remote database each one is a network round trip).
export const prisma = globalThis.__zenoraPrisma ?? new PrismaClient({ log: process.env.ZENORA_LOG_QUERIES === "true" ? ["query"] : [] });

if (process.env.NODE_ENV !== "production") {
  globalThis.__zenoraPrisma = prisma;
}

export * from "@prisma/client";
