import { createDatabaseClient } from "@/lib/database.server";

function hasEnv(...names: string[]): boolean {
  return names.every((n) => Boolean((process.env[n] ?? "").trim()));
}

export async function handleHealth(): Promise<string> {
  // Database check
  let dbStatus = "\u274C Unavailable";
  try {
    const db = createDatabaseClient();
    const { error } = await db.from("orders").select("id", { count: "exact", head: true });
    dbStatus = error ? "\u26A0\uFE0F Query error" : "\u2705 Healthy";
  } catch {
    dbStatus = "\u274C Connection failed";
  }

  // Telegram check
  let telegramStatus = "\u274C Not configured";
  try {
    const { verifyTelegramConnectivity } = await import("@/lib/telegram.server");
    const result = await verifyTelegramConnectivity();
    telegramStatus = result.ok ? "\u2705 Operational" : `\u274C ${result.error}`;
  } catch {
    telegramStatus = "\u274C Check failed";
  }

  // Paystack
  const paystackStatus = hasEnv("PAYSTACK_SECRET_KEY")
    ? "\u2705 Configured"
    : "\u26A0\uFE0F Awaiting credentials";

  // Resend
  const resendConfigured = hasEnv("RESEND_API_KEY", "RESEND_FROM_EMAIL");
  const resendDomain = process.env.RESEND_DOMAIN_VERIFIED === "true";
  const resendStatus = !resendConfigured
    ? "\u26A0\uFE0F Not configured"
    : resendDomain
      ? "\u2705 Operational"
      : "\u26A0\uFE0F Sender/domain verification required";

  // Brevo
  const brevoStatus = hasEnv("BREVO_API_KEY")
    ? "\u26A0\uFE0F Configured but sender blocked"
    : "\u26A0\uFE0F Not configured";

  return [
    "\uD83C\uDF10 *SYSTEM HEALTH*",
    "",
    `Application: \u2705 Online`,
    `Database: ${dbStatus}`,
    `Telegram: ${telegramStatus}`,
    `Paystack: ${paystackStatus}`,
    `Transactional email: ${resendStatus}`,
    `Marketing email: ${brevoStatus}`,
  ].join("\n");
}
