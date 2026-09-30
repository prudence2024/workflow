import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Lazy database pool.
 *
 * DATABASE_URL is read on first use, not at import time. Next.js evaluates page
 * and route modules during `next build` (route analysis, prerender attempts,
 * static export of metadata), and a throw-at-import would fail the build on a
 * machine that has no runtime secrets. Configuration problems therefore surface
 * on the first real query — where they can be handled and reported — instead of
 * at module load.
 */
const globalForDb = globalThis as typeof globalThis & {
  __workflowPool?: Pool;
};

function readDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === "") {
    throw new Error(
      "DATABASE_URL is not configured. Set it in .env.local (development) or the deployment environment.",
    );
  }
  return url;
}

export function getPool(): Pool {
  if (!globalForDb.__workflowPool) {
    globalForDb.__workflowPool = new Pool({
      connectionString: readDatabaseUrl(),
      // Neon's pooled endpoint multiplexes thousands of client connections; a
      // small per-process pool is the documented pattern.
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return globalForDb.__workflowPool;
}

/** True when a database is reachable by configuration, without connecting. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "");
}

type DrizzleClient = ReturnType<typeof drizzle>;

let client: DrizzleClient | null = null;

function getClient(): DrizzleClient {
  if (!client) {
    client = drizzle(getPool());
  }
  return client;
}

/**
 * Proxy so existing `db.select(...)` / `db.transaction(...)` call sites keep
 * working while the underlying pool stays lazy.
 */
export const db = new Proxy({} as DrizzleClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient() as object, prop, receiver);
  },
}) as DrizzleClient;

/** Close the pool (scripts and graceful shutdown). */
export async function closePool(): Promise<void> {
  const pool = globalForDb.__workflowPool;
  if (pool) {
    await pool.end();
    globalForDb.__workflowPool = undefined;
    client = null;
  }
}
