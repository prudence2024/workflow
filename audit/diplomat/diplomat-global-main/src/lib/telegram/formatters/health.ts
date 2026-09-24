export function buildHealthReport(checks: {
  application: string;
  database: string;
  telegram: string;
  paystack: string;
  email: string;
  brevo: string;
}): string {
  return [
    "\uD83C\uDF10 *SYSTEM HEALTH*",
    "",
    `Application: ${checks.application}`,
    `Database: ${checks.database}`,
    `Telegram: ${checks.telegram}`,
    `Paystack: ${checks.paystack}`,
    `Transactional email: ${checks.email}`,
    `Marketing email: ${checks.brevo}`,
  ].join("\n");
}
