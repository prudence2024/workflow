import { createDatabaseClient } from "@/lib/database.server";

function formatNaira(n: number): string {
  return "\u20A6" + n.toLocaleString("en-NG");
}

export async function handlePayments(args: string): Promise<string> {
  const isToday = args.toLowerCase().includes("today");
  const limit = 5;

  try {
    const db = createDatabaseClient();
    let query = db
      .from("orders")
      .select("id, total, status, email, customers(first_name, last_name), created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (isToday) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query = query.gte("created_at", today.toISOString());
    }

    const { data: orders, error } = await query;

    if (error) {
      return "\u274C Failed to query payments. Please try again.";
    }

    if (!orders || orders.length === 0) {
      return isToday
        ? "\uD83D\uDCB3 *TODAY'S PAYMENTS*\n\nNo payments recorded today."
        : "\uD83D\uDCB3 *RECENT PAYMENTS*\n\nNo payments found.";
    }

    const lines = [
      isToday ? "\uD83D\uDCB3 *TODAY'S PAYMENTS*" : "\uD83D\uDCB3 *RECENT PAYMENTS*",
      "",
    ];

    for (let i = 0; i < orders.length; i++) {
      const o = orders[i] as any;
      const name = o.customers
        ? `${o.customers.first_name || ""} ${o.customers.last_name || ""}`.trim() || "Customer"
        : "Customer";
      const statusEmoji =
        o.status === "paid" || o.status === "delivered"
          ? "\u2705"
          : o.status === "cancelled"
            ? "\u274C"
            : "\u23F3";

      lines.push(
        `${i + 1}. ${formatNaira(Number(o.total))} \u2014 ${statusEmoji} ${o.status}`,
        `   ${name}`,
        `   ${o.email || ""}`,
      );

      if (i < orders.length - 1) lines.push("");
    }

    return lines.join("\n");
  } catch (err) {
    return "\u274C Failed to retrieve payments.";
  }
}
