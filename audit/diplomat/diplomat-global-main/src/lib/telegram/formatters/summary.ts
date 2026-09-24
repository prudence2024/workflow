import { createDatabaseClient } from "@/lib/database.server";

function formatNaira(n: number): string {
  return "\u20A6" + n.toLocaleString("en-NG");
}

export async function generateDailySummary(): Promise<string> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  let verifiedRevenue = 0;
  let successfulPayments = 0;
  let failedPayments = 0;
  let newOrders = 0;
  let newLeads = 0;
  let newContacts = 0;
  let criticalErrors = 0;
  let dbOk = false;

  try {
    const db = createDatabaseClient();

    // Verified revenue + successful payments
    const { data: paidOrders } = await db
      .from("orders")
      .select("total")
      .gte("created_at", todayISO)
      .in("status", ["paid", "delivered", "processing"]);

    successfulPayments = paidOrders?.length ?? 0;
    verifiedRevenue = (paidOrders || []).reduce(
      (sum: number, o: any) => sum + Number(o.total || 0),
      0,
    );
    dbOk = true;

    // Failed payments
    const { count: failedCount } = await db
      .from("orders")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayISO)
      .eq("status", "cancelled");

    failedPayments = failedCount ?? 0;

    // New orders (all)
    const { count: orderCount } = await db
      .from("orders")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayISO);

    newOrders = orderCount ?? 0;

    // New leads
    const { count: leadCount } = await db
      .from("newsletter_subscribers")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayISO)
      .eq("is_active", true);

    newLeads = leadCount ?? 0;

    // New contacts
    const { count: contactCount } = await db
      .from("messages")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayISO);

    newContacts = contactCount ?? 0;

    // Critical errors (recent audit logs)
    const { count: errorCount } = await db
      .from("audit_logs")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayISO)
      .like("action", "%error%");

    criticalErrors = errorCount ?? 0;
  } catch {
    // DB may be unavailable
  }

  const dateStr = today.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return [
    "\uD83D\uDCCA *DIPLOMAT GLOBAL*",
    `*DAILY SUMMARY \u2014 ${dateStr}*`,
    "",
    `Revenue: ${formatNaira(verifiedRevenue)}`,
    `Successful payments: ${successfulPayments}`,
    `Failed payments: ${failedPayments}`,
    `New orders: ${newOrders}`,
    `New leads: ${newLeads}`,
    `New contacts: ${newContacts}`,
    `Critical errors: ${criticalErrors}`,
    `System status: ${dbOk ? "Healthy" : "Unavailable"}`,
  ].join("\n");
}

export async function generateWeeklySummary(): Promise<string> {
  const now = new Date();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoISO = weekAgo.toISOString();

  let verifiedRevenue = 0;
  let successfulPayments = 0;
  let failedPayments = 0;
  let newOrders = 0;
  let newLeads = 0;
  let newContacts = 0;

  try {
    const db = createDatabaseClient();

    const { data: paidOrders } = await db
      .from("orders")
      .select("total")
      .gte("created_at", weekAgoISO)
      .in("status", ["paid", "delivered", "processing"]);

    successfulPayments = paidOrders?.length ?? 0;
    verifiedRevenue = (paidOrders || []).reduce(
      (sum: number, o: any) => sum + Number(o.total || 0),
      0,
    );

    const { count: failedCount } = await db
      .from("orders")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekAgoISO)
      .eq("status", "cancelled");

    failedPayments = failedCount ?? 0;

    const { count: orderCount } = await db
      .from("orders")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekAgoISO);

    newOrders = orderCount ?? 0;

    const { count: leadCount } = await db
      .from("newsletter_subscribers")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekAgoISO)
      .eq("is_active", true);

    newLeads = leadCount ?? 0;

    const { count: contactCount } = await db
      .from("messages")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekAgoISO);

    newContacts = contactCount ?? 0;
  } catch {
    // DB may be unavailable
  }

  const startStr = weekAgo.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
  });
  const endStr = now.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return [
    "\uD83D\uDCCA *DIPLOMAT GLOBAL*",
    `*WEEKLY SUMMARY \u2014 ${startStr} \u2013 ${endStr}*`,
    "",
    `Revenue: ${formatNaira(verifiedRevenue)}`,
    `Successful payments: ${successfulPayments}`,
    `Failed payments: ${failedPayments}`,
    `New orders: ${newOrders}`,
    `New leads: ${newLeads}`,
    `New contacts: ${newContacts}`,
  ].join("\n");
}
