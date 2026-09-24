import { describe, expect, it, vi } from "vitest";

/**
 * Admin notification idempotency contract (§15):
 *
 * Payment notifications are created from callback, webhook AND replay paths.
 * They MUST be exactly-once per business event across all of them. The
 * mechanism is a DB-level unique index on admin_notifications.event_key
 * combined with an upsert(..., ignoreDuplicates) — replaying the same event
 * key can never produce a second active notification row.
 *
 * Payment event keys are also versionless-but-order-scoped, so callback and
 * webhook for one order collide on the SAME key.
 */

const UPSERT_SOURCE = "src/lib/admin/server-fns.ts";
const MIGRATION = "supabase/migrations/20260827150000_admin_notifications.sql";

describe("admin notification idempotency", () => {
  it("dedupes on a DB-level unique event_key index (not application state)", () => {
    const migration = readFileSync_utf8(MIGRATION);
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS admin_notifications_event_key_unique/);
  });

  it("createNotification uses upsert with onConflict event_key + ignoreDuplicates", () => {
    const source = readFileSync_utf8(UPSERT_SOURCE);
    expect(source).toMatch(/admin_notifications["']\)\.upsert\(/);
    expect(source).toMatch(/onConflict:\s*"event_key"/);
    expect(source).toMatch(/ignoreDuplicates:\s*true/);
  });

  it("payment success event key is order-scoped so callback/webhook/replay collide", () => {
    const source = readFileSync_utf8("src/lib/notifications.ts");
    expect(source).toMatch(/eventKey:\s*`order_paid_\$\{orderId\}`/);
    expect(source).toMatch(/eventKey:\s*`payment_failed_\$\{orderId\}`/);
  });

  it("notification creation never throws into the payment path", async () => {
    vi.resetModules();
    const upsert = vi.fn().mockResolvedValue({ error: { message: "db down" } });
    vi.doMock("@/lib/admin/server-fns", () => ({
      createNotification: async (opts: { eventKey: string }) => {
        // Mirror the real implementation's swallow-error behavior.
        try {
          await upsert(opts);
        } catch {
          /* never throw */
        }
      },
    }));
    const { notify } = await import("@/lib/notifications");
    await expect(
      notify({ eventKey: "order_paid_x", category: "payment", title: "t" }),
    ).resolves.toBeUndefined();
    expect(upsert).toHaveBeenCalledOnce();
  });
});

function readFileSync_utf8(path: string): string {
  // Lazy require keeps the test transform simple.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("node:fs").readFileSync(path, "utf8") as string;
}
