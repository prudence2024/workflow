import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { neonConfig, Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as drizzleEdge } from "drizzle-orm/neon-serverless";

/**
 * Lazy database pool.
 *
 * DATABASE_URL is read on first use, not at import time. Next.js evaluates page
 * and route modules during `next build` (route analysis, prerender attempts,
 * static export of metadata), and a throw-at-import would fail the build on a
 * machine that has no runtime secrets. Configuration problems therefore surface
 * on the first real query — where they can be handled and reported — instead of
 * at module load.
 *
 * Two transports, one query surface:
 *   - node (default): `pg` Pool over TCP. Local dev, scripts, tests, any
 *     Node runtime. Full interactive transactions.
 *   - edge (`DATABASE_RUNTIME=edge`): Neon serverless Pool over WebSocket.
 *     Cloudflare Workers, where TCP sockets do not exist. The drizzle
 *     neon-serverless adapter supports real interactive transactions over
 *     the WebSocket transport, so withTenant()'s BEGIN -> SET LOCAL ROLE ->
 *     queries -> COMMIT flow — and therefore forced RLS — works unchanged.
 *     Scripts and migrations must keep running on node.
 */
if (typeof globalThis.WebSocket !== "undefined") {
  // Workers provide a global WebSocket; Node 22 does too. The Neon driver
  // needs an explicit constructor reference.
  neonConfig.webSocketConstructor = globalThis.WebSocket;
}

export function databaseRuntime(): "node" | "edge" {
  return process.env.DATABASE_RUNTIME === "edge" ? "edge" : "node";
}

const globalForDb = globalThis as typeof globalThis & {
  __workflowPool?: Pool;
  __workflowEdgePool?: NeonPool;
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
  if (databaseRuntime() === "edge") {
    throw new Error("getPool() is node-only: the edge runtime uses the Neon WebSocket pool internally.");
  }
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

type DrizzleClient = ReturnType<typeof drizzleNode>;

let client: DrizzleClient | null = null;

/**
 * The neon-serverless driver wraps PostgreSQL failures as
 * `{ query, params, cause }`, leaving the SQLSTATE on `cause.code` while
 * node-postgres surfaces it directly as `err.code`. Nothing in the app
 * branches on error codes today, but the tenant gateway is exactly where a
 * future check would live — so the edge client lifts the code onto the
 * outer error, keeping both transports indistinguishable to callers.
 */
function liftPgCode(e: unknown): void {
  if (e && typeof e === "object") {
    const outer = e as { code?: string; cause?: { code?: string } };
    if (!outer.code && outer.cause && typeof outer.cause.code === "string") {
      outer.code = outer.cause.code;
    }
  }
}

function getEdgeClient(): DrizzleClient {
  if (!globalForDb.__workflowEdgePool) {
    globalForDb.__workflowEdgePool = new NeonPool({
      connectionString: readDatabaseUrl(),
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    });
  }
  const raw = drizzleEdge(globalForDb.__workflowEdgePool);
  const normalized = new Proxy(raw, {
    get(t, prop, receiver) {
      const v = Reflect.get(t, prop, receiver);
      if (typeof v !== "function" || (prop !== "transaction" && prop !== "execute")) {
        return typeof v === "function" ? v.bind(t) : v;
      }
      return async (...args: unknown[]) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return await (v as any).apply(t, args);
        } catch (e) {
          liftPgCode(e);
          throw e;
        }
      };
    },
  });
  // Same method surface (select/insert/update/delete/execute/transaction);
  // the cast is contained here so every call site keeps working unchanged.
  return normalized as unknown as DrizzleClient;
}

function getClient(): DrizzleClient {
  if (!client) {
    client = databaseRuntime() === "edge" ? getEdgeClient() : drizzleNode(getPool());
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
  }
  const edgePool = globalForDb.__workflowEdgePool;
  if (edgePool) {
    await edgePool.end();
    globalForDb.__workflowEdgePool = undefined;
  }
  client = null;
}
