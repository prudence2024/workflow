import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";

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
 *   - edge (`DATABASE_RUNTIME=edge`): Cloudflare Hyperdrive connection string
 *     over a request-scoped node-postgres Client. Hyperdrive owns upstream
 *     pooling while each Drizzle transaction keeps one Client/connection for
 *     BEGIN -> SET LOCAL ROLE -> queries -> COMMIT.
 *     Scripts and migrations must keep running on node.
 */
export function databaseRuntime(): "node" | "edge" {
  return process.env.DATABASE_RUNTIME === "edge" ? "edge" : "node";
}

const globalForDb = globalThis as typeof globalThis & {
  __workflowPool?: Pool;
};

type HyperdriveBinding = { connectionString: string };

declare global {
  interface CloudflareEnv {
    HYPERDRIVE?: HyperdriveBinding;
  }
}

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

type Cleanup = () => Promise<void>;

function onceCleanup(client: Client): Cleanup {
  let ended = false;
  return async () => {
    if (ended) return;
    ended = true;
    await client.end();
  };
}

function wrapWithCleanup<T>(value: T, cleanup: Cleanup): T {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return value;
  return new Proxy(value as object, {
    get(target, prop, receiver) {
      if (prop === "then" && typeof (target as PromiseLike<unknown>).then === "function") {
        return (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
          Promise.resolve((target as PromiseLike<unknown>).then(onFulfilled, onRejected)).finally(cleanup);
      }
      const member = Reflect.get(target, prop, receiver);
      if (typeof member !== "function") return member;
      return (...args: unknown[]) => wrapWithCleanup(member.apply(target, args), cleanup);
    },
  }) as T;
}

function getHyperdriveConnectionString(): string {
  const { env } = getCloudflareContext();
  const binding = (env as CloudflareEnv).HYPERDRIVE;
  if (!binding?.connectionString) {
    throw new Error("HYPERDRIVE binding is not configured for the Cloudflare runtime.");
  }
  return binding.connectionString;
}

function getEdgeClient(): DrizzleClient {
  const client = new Client({ connectionString: getHyperdriveConnectionString() });
  // pg queues queries until connect resolves; retaining the rejection on the
  // queued query prevents an unhandled promise while preserving the original
  // database error for the caller.
  void client.connect().catch(() => undefined);
  const cleanup = onceCleanup(client);
  const raw = drizzleNode(client);
  return new Proxy(raw, {
    get(target, prop, receiver) {
      const member = Reflect.get(target, prop, receiver);
      if (typeof member !== "function") return member;
      return (...args: unknown[]) => {
        try {
          return wrapWithCleanup(member.apply(target, args), cleanup);
        } catch (error) {
          void cleanup();
          liftPgCode(error);
          throw error;
        }
      };
    },
  }) as unknown as DrizzleClient;
}

function getClient(): DrizzleClient {
  if (databaseRuntime() === "edge") return getEdgeClient();
  if (!client) client = drizzleNode(getPool());
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
  client = null;
}
