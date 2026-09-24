/**
 * Central command definitions for the Diplomat Global Telegram Operations Bot.
 * Single source of truth for: webhook router, /help response, setMyCommands, Admin Help page.
 */

export interface TelegramCommandDef {
  command: string;
  description: string;
  /** True if this is a base command name (no arguments) that Telegram can display in / menu */
  registerable: boolean;
}

export const TELEGRAM_COMMANDS: TelegramCommandDef[] = [
  { command: "start", description: "Opens the Operations Bot command menu", registerable: true },
  { command: "help", description: "Shows available Telegram commands", registerable: true },
  {
    command: "status",
    description: "Shows a current business and system summary",
    registerable: true,
  },
  { command: "health", description: "Checks the health of supported services", registerable: true },
  { command: "today", description: "Shows today's business summary", registerable: true },
  { command: "orders", description: "Shows recent orders (use: orders pending, orders paid)", registerable: true },
  {
    command: "payments",
    description: "Shows recent payments (use: payments today)",
    registerable: true,
  },
  {
    command: "revenue",
    description: "Shows verified revenue (use: revenue today, revenue month)",
    registerable: true,
  },
  { command: "inventory", description: "Shows product stock overview", registerable: true },
  { command: "lowstock", description: "Shows products with low or zero stock", registerable: true },
  { command: "customers", description: "Shows recent customers (minimal PII)", registerable: true },
  { command: "audit", description: "Shows today's security audit events", registerable: true },
  { command: "leads", description: "Shows recent contacts & subscribers", registerable: true },
  { command: "notifications", description: "Shows recent admin notifications", registerable: true },
  { command: "summary", description: "Shows today's business summary", registerable: false },
  { command: "weekly", description: "Shows weekly business summary", registerable: false },
];

/**
 * Build the /start and /help response text.
 */
export function buildHelpText(): string {
  const lines = [
    "\uD83E\uDD16 *DIPLOMAT GLOBAL*",
    "",
    "Internal Operations Bot",
    "",
    "Available commands:",
    "",
  ];

  for (const cmd of TELEGRAM_COMMANDS) {
    const args =
      cmd.command === "payments"
        ? " [today]"
        : cmd.command === "revenue"
          ? " [today|month]"
          : cmd.command === "leads"
            ? " [today]"
            : "";
    lines.push(`/${cmd.command}${args} — ${cmd.description}`);
  }

  return lines.join("\n");
}

/**
 * Build the Telegram setMyCommands JSON payload (registerable commands only).
 */
export function buildSetMyCommandsPayload(): Array<{ command: string; description: string }> {
  return TELEGRAM_COMMANDS.filter((c) => c.registerable).map((c) => ({
    command: c.command,
    description: c.description,
  }));
}
