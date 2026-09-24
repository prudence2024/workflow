import { createDatabaseClient } from "@/lib/database.server";

function formatNaira(n: number): string {
  return "\u20A6" + n.toLocaleString("en-NG");
}

function hasEnv(...names: string[]): boolean {
  return names.every((n) => Boolean((process.env[n] ?? "").trim()));
}

export async function handleStatus(): Promise<string> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  let dbOk = false;
  let todayPayments = 0;
  let todayRevenue = 0;
  let todayLeads = 0;
  let todayContacts = 0;

  try {
    const db = createDatabaseClient();

    // Today's verified payments
    const { count: payCount } = await db
      .from("orders")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayISO)
      .eq("status", "paid");

    todayPayments = payCount ?? 0;
    dbOk = true;

    // Today's revenue from paid orders
    const { data: revData } = await db
      .from("orders")
      .select("total")
      .gte("created_at", todayISO)
      .eq("status", "paid");

    todayRevenue = (revData || []).reduce((sum: number, o: any) => sum + Number(o.total || 0), 0);

    // Today's contacts
    const { count: contactCount } = await db
      .from("messages")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayISO);

    todayContacts = contactCount ?? 0;

    // Today's newsletter subscribers (leads)
    const { count: leadCount } = await db
      .from("newsletter_subscribers")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayISO)
      .eq("is_active", true);

    todayLeads = leadCount ?? 0;
  } catch {
    // DB may be unavailable
  }

  // Service statuses
  const paystackStatus = hasEnv("PAYSTACK_SECRET_KEY") ? "Configured" : "Not configured";
  const emailStatus = hasEnv("RESEND_API_KEY", "RESEND_FROM_EMAIL")
    ? "Configured"
    : "Not configured";
  const brevoStatus = hasEnv("BREVO_API_KEY") ? "Configured" : "Not configured";

  return [
    "\uD83C\uDFE2 *DIPLOMAT GLOBAL*",
    "",
    "*SYSTEM STATUS*",
    "",
    `Website: Online`,
    `Database: ${dbOk ? "Healthy" : "Unavailable"}`,
    `Paystack: ${paystackStatus}`,
    `Transactional email: ${emailStatus}`,
    `Marketing email: ${brevoStatus}`,
    `Telegram: Operational`,
    "",
    "*TODAY*",
    "",
    `Successful payments: ${todayPayments}`,
    `New leads: ${todayLeads}`,
    `Messages: ${todayContacts}`,
    `Revenue: ${formatNaira(todayRevenue)}`,
  ].join("\n");
}
