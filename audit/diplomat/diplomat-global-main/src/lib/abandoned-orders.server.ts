/**
 * Abandoned Order Lifecycle
 *
 * Marks pending orders older than 24 hours as 'abandoned'.
 * This is idempotent — only affects orders with status='pending'.
 *
 * Safe to call multiple times. Does not touch paid/cancelled/refunded orders.
 *
 * Can be triggered by:
 * - Vercel Cron Job (configure in vercel.json)
 * - Admin manual trigger
 * - Scheduled task
 */
import { createDatabaseClient } from "./database.server";

const ABANDONMENT_THRESHOLD_HOURS = 24;

export async function markAbandonedOrders(): Promise<{
  ok: boolean;
  marked: number;
  message: string;
}> {
  const db = createDatabaseClient();

  const threshold = new Date(
    Date.now() - ABANDONMENT_THRESHOLD_HOURS * 60 * 60 * 1000,
  ).toISOString();

  // Find pending orders older than the threshold
  const { data: staleOrders, error: queryError } = await db
    .from("orders")
    .select("id, reference, email, total, created_at")
    .eq("status", "pending")
    .lt("created_at", threshold)
    .limit(100); // Process in batches to avoid long-running transactions

  if (queryError) {
    console.error("[abandoned-orders] Query failed:", queryError);
    return { ok: false, marked: 0, message: "Query failed: " + queryError.message };
  }

  if (!staleOrders || staleOrders.length === 0) {
    return { ok: true, marked: 0, message: "No pending orders to abandon" };
  }

  let marked = 0;

  for (const order of staleOrders) {
    // CAS: only transition from pending → abandoned
    // This prevents race conditions and protects against non-pending orders
    const { error: updateError } = await db
      .from("orders")
      .update({ status: "abandoned" })
      .eq("id", order.id)
      .eq("status", "pending"); // CAS condition

    if (!updateError) {
      marked++;

      // Notification for abandoned order
      try {
        const { notifications } = await import("@/lib/notifications");
        await notifications.orderAbandoned(order.id);
      } catch {
        // Notification failure must not block abandonment
      }

      // Audit log
      try {
        await db.from("audit_logs").insert({
          clerk_user_id: "system",
          action: "order.abandoned",
          entity_type: "order",
          entity_id: order.id,
          metadata: {
            reference: order.reference,
            email: order.email,
            total: order.total,
            created_at: order.created_at,
            threshold_hours: ABANDONMENT_THRESHOLD_HOURS,
          },
        });
      } catch {
        // Notification/logging failed — order still marked abandoned, continue
      }
    }
  }

  console.log(`[abandoned-orders] Marked ${marked}/${staleOrders.length} orders as abandoned`);

  return {
    ok: true,
    marked,
    message: `Marked ${marked} order(s) as abandoned`,
  };
}
