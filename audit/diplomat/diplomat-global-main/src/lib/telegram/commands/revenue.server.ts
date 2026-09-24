import { createDatabaseClient } from "@/lib/database.server";

function formatNaira(n: number): string {
  return "\u20A6" + n.toLocaleString("en-NG");
}

export async function handleRevenue(args: string): Promise<string> {
  const arg = args.toLowerCase().trim();
  const isToday = arg.includes("today");
  const isMonth = arg.includes("month");

  try {
    const db = createDatabaseClient();

    let startDate: Date;
    let label: string;

    if (isToday) {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      label = "TODAY";
    } else if (isMonth) {
      startDate = new Date();
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      label = "THIS MONTH";
    } else {
      // Last 7 days
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      label = "LAST 7 DAYS";
    }

    const { data: orders } = await db
      .from("orders")
      .select("total, status")
      .gte("created_at", startDate.toISOString())
      .in("status", ["paid", "delivered", "processing"]);

    const totalRevenue = (orders || []).reduce(
      (sum: number, o: any) => sum + Number(o.total || 0),
      0,
    );
    const paymentCount = (orders || []).length;

    // Failed payments in same period
    const { data: failed } = await db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startDate.toISOString())
      .eq("status", "cancelled");

    const failedCount = failed || 0;

    const lines = [
      "\uD83D\uDCB0 *REVENUE \u2014 " + label + "*",
      "",
      `Verified revenue: ${formatNaira(totalRevenue)}`,
      `Successful payments: ${paymentCount}`,
      `Failed payments: ${failedCount}`,
    ];

    return lines.join("\n");
  } catch (err) {
    return "\u274C Failed to calculate revenue.";
  }
}
