import { createDatabaseClient } from "@/lib/admin/admin-ops.server";

function getDb() {
  try {
    return createDatabaseClient();
  } catch {
    return null;
  }
}

/** /orders — show recent orders */
export async function handleOrders(args: string): Promise<string> {
  const db = getDb();
  if (!db) return "⚠️ Database not available.";

  const statusFilter = args.toLowerCase().trim();

  try {
    let query = db
      .from("orders")
      .select("id, order_number, status, payment_status, total_amount, customer_email, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    if (statusFilter === "pending") {
      query = query.eq("status", "pending");
    } else if (statusFilter === "paid") {
      query = query.eq("payment_status", "paid");
    } else if (statusFilter) {
      query = query.or(`status.ilike.%${statusFilter}%,payment_status.ilike.%${statusFilter}%`);
    }

    const { data: orders, error } = await query;
    if (error) return "⚠️ Failed to fetch orders.";

    if (!orders || orders.length === 0) {
      return `📦 *Orders${statusFilter ? ` (${statusFilter})` : ""}*\n\nNo orders found.`;
    }

    const lines = [`📦 *Recent Orders${statusFilter ? ` (${statusFilter})` : ""}*\n`];
    for (const o of orders) {
      const date = new Date(o.created_at).toLocaleDateString("en-NG", {
        day: "numeric",
        month: "short",
      });
      const statusEmoji =
        o.status === "delivered" ? "✅" : o.status === "cancelled" ? "❌" : "🔄";
      lines.push(
        `${statusEmoji} *${o.order_number || o.id.slice(0, 8)}* — ₦${Number(o.total_amount).toLocaleString()} [${o.status}/${o.payment_status}] ${date}`,
      );
    }
    return lines.join("\n");
  } catch {
    return "⚠️ Error fetching orders.";
  }
}

/** /order <id> — show single order detail */
export async function handleOrderDetail(idArg: string): Promise<string> {
  const db = getDb();
  if (!db) return "⚠️ Database not available.";

  if (!idArg.trim()) return "Usage: /order <order-id-or-number>";

  try {
    const { data: order, error } = await db
      .from("orders")
      .select("*")
      .or(`id.eq.${idArg},order_number.ilike.${idArg}`)
      .single();

    if (error || !order) return `⚠️ Order "${idArg}" not found.`;

    const date = new Date(order.created_at).toLocaleString("en-NG");
    const lines = [
      `📋 *Order ${order.order_number || order.id.slice(0, 8)}*\n`,
      `Status: ${order.status}`,
      `Payment: ${order.payment_status}`,
      `Total: ₦${Number(order.total_amount).toLocaleString()}`,
      `Customer: ${order.customer_name || "—"}`,
      `Email: ${order.customer_email || "—"}`,
      `Phone: ${order.customer_phone || "—"}`,
      `Date: ${date}`,
      `Paystack Ref: ${order.paystack_reference || "—"}`,
    ];
    return lines.join("\n");
  } catch {
    return "⚠️ Error fetching order.";
  }
}
