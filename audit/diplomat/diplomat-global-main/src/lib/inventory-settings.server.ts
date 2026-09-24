import "@tanstack/react-start/server-only";
import type { createDatabaseClient } from "./database.server";
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  resolveInventoryState,
  resolveLowStockThreshold,
  type InventoryRow,
} from "./inventory-lifecycle";

type Db = ReturnType<typeof createDatabaseClient>;

export async function loadInventorySettings(db: Db) {
  const { data, error } = await db
    .from("site_settings")
    .select("key, value")
    .in("key", ["low_stock_alerts_enabled", "low_stock_threshold_default"]);
  if (error) {
    // Degrade, don't throw: a transient settings read must never take down a
    // public product listing or PDP that already loaded fine (the Owner-visible
    // "Inventory settings could not be loaded" page failure). Consumers use
    // the documented default threshold; alert delivery still re-reads settings
    // after confirmed mutations, where failure is already swallowed.
    console.error("[inventory-settings] read failed — using defaults:", error.message);
    return { defaultThreshold: DEFAULT_LOW_STOCK_THRESHOLD, alertsEnabled: true };
  }
  const settings = Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
  const raw = settings.low_stock_threshold_default;
  const value = raw == null || String(raw).trim() === "" ? undefined : Number(raw);
  return {
    defaultThreshold: resolveLowStockThreshold(value, DEFAULT_LOW_STOCK_THRESHOLD),
    alertsEnabled: settings.low_stock_alerts_enabled !== "false",
  };
}

/** Called only after a confirmed mutation. Reads never emit alerts. */
export async function emitLowStockTransition(
  db: Db,
  product: { id: string; name: string },
  before: InventoryRow | null,
  after: InventoryRow,
  source: "sale" | "admin_adjustment" = "admin_adjustment",
  orderReference?: string,
) {
  try {
    const settings = await loadInventorySettings(db);
    if (!settings.alertsEnabled) return;
    const next = resolveInventoryState(after, false, settings.defaultThreshold);
    const previous = before
      ? resolveInventoryState(before, false, settings.defaultThreshold)
      : null;

    // SOLD OUT transition (quantity > 0 → <= 0): notify exactly once per
    // transition. The notification dedupes on its event key, so callback/
    // webhook replays and Admin re-renders can never duplicate it. Telegram
    // stays best-effort and never blocks or duplicates the alert on a replay
    // (the notification path is the exactly-once anchor).
    if (next.quantity !== null && next.quantity <= 0 && (previous?.quantity ?? 1) > 0) {
      const { notifications } = await import("./notifications");
      await notifications.outOfStock(product.id, product.name, source);
      const { sendAdminAlert } = await import("./telegram.server");
      await sendAdminAlert(
        "Sold Out",
        `SOLD OUT\n\nProduct: ${product.name}\nStock: 0${source === "sale" ? `\nReason: last unit(s) purchased${orderReference ? `\nOrder: ${orderReference}` : ""}` : "\nReason: manual stock adjustment"}`,
      );
      return;
    }

    if (next.state !== "low_stock" || previous?.state === "low_stock") return;
    const { notifications } = await import("./notifications");
    await notifications.lowStock(product.id, product.name, next.quantity!);
    const { sendAdminAlert } = await import("./telegram.server");
    const { buildLowStockAlert } = await import("./telegram/formatters/lead");
    await sendAdminAlert(
      "Low Stock",
      buildLowStockAlert({
        productName: product.name,
        quantity: next.quantity!,
        threshold: resolveLowStockThreshold(after.low_stock_threshold, settings.defaultThreshold),
      }),
    );
  } catch {
    // Uncertain settings/delivery must neither send uncontrolled alerts nor undo stock.
  }
}
