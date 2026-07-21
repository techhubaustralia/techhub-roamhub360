import "server-only";

// ONE PrismaClient for the whole app. Previously ~11 modules each newed their own via a private
// lazy `prisma()` — so each held a separate connection pool, which exhausts Postgres connections
// under load and leaves no single place to set pool limits or logging. This is that single place.
//
// Kept lazy (dynamic import) so local/dev/build without a generated client or DATABASE_URL doesn't
// break at import time — the throw only fires if a query is actually attempted without a database.
/* eslint-disable @typescript-eslint/no-explicit-any */

// Cache on globalThis so dev/HMR reloads reuse the same client instead of leaking a pool per reload.
const g = globalThis as unknown as { _roamhubPrisma?: any };

export async function prisma(): Promise<any> {
  if (!process.env.DATABASE_URL) throw new Error("Database not configured (set DATABASE_URL).");
  if (!g._roamhubPrisma) {
    const mod: any = await import("@prisma/client");
    // connection_limit is set on DATABASE_URL (?connection_limit=N) per Prisma; centralised here so
    // there is one obvious knob rather than N implicit pools.
    g._roamhubPrisma = new mod.PrismaClient();
  }
  return g._roamhubPrisma;
}
