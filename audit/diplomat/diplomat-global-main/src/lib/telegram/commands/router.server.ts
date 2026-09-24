import type { CommandContext } from "../types.server";
import { buildHelpText } from "./definitions.server";

/**
 * Route a Telegram update to the appropriate command handler.
 * Only processes text messages from authorized chat IDs.
 */
export async function routeCommand(ctx: CommandContext): Promise<string> {
  const text = ctx.text.trim();
  const parts = text.split(/\s+/);
  const command = parts[0].toLowerCase().replace(/^\/+/, "");
  const args = parts.slice(1).join(" ");

  switch (command) {
    case "start":
      return buildHelpText();
    case "help":
      return buildHelpText();
    case "status":
      return (await import("./status.server")).handleStatus();
    case "health":
      return (await import("./health.server")).handleHealth();
    case "today":
      return (await import("./summary-cmd.server")).handleSummary();
    case "orders":
      return (await import("./orders.server")).handleOrders(args);
    case "order":
      return (await import("./orders.server")).handleOrderDetail(args);
    case "payments":
      return (await import("./payments.server")).handlePayments(args);
    case "revenue":
      return (await import("./revenue.server")).handleRevenue(args);
    case "inventory":
      return (await import("./inventory.server")).handleInventory();
    case "lowstock":
      return (await import("./inventory.server")).handleLowStock();
    case "customers":
      return (await import("./customers.server")).handleCustomers();
    case "audit":
      return (await import("./audit.server")).handleAuditToday();
    case "leads":
      return (await import("./leads.server")).handleLeads(args);
    case "notifications":
      return (await import("./notifications.server")).handleNotifications();
    case "summary":
      return (await import("./summary-cmd.server")).handleSummary();
    case "weekly":
      return (await import("./summary-cmd.server")).handleWeeklySummary();
    default:
      return `Unknown command: /${command}\n\nType /help to see available commands.`;
  }
}
