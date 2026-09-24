import { createDatabaseClient } from "@/lib/admin/admin-ops.server";

function getDb() {
  try {
    return createDatabaseClient();
  } catch {
    return null;
  }
}

/** /inventory — show product stock overview */
export async function handleInventory(): Promise<string> {
  const db = getDb();
  if (!db) return "⚠️ Database not available.";

  try {
    const { data: products, error } = await db
      .from("products")
      .select("name, stock, status, in_stock")
      .eq("status", "active")
      .order("name")
      .limit(50);

    if (error) return "⚠️ Failed to fetch inventory.";

    if (!products || products.length === 0) {
      return "📦 *Inventory*\n\nNo active products found.";
    }

    const inStock = products.filter((p) => p.in_stock !== false && (p.stock ?? 0) > 0);
    const outOfStock = products.filter((p) => p.in_stock === false || (p.stock ?? 0) <= 0);

    const lines = [
      `📦 *Inventory Overview*\n`,
      `Active products: ${products.length}`,
      `In stock: ${inStock.length}`,
      `Out of stock: ${outOfStock.length}\n`,
    ];

    if (outOfStock.length > 0) {
      lines.push("*Out of stock:*");
      for (const p of outOfStock.slice(0, 5)) {
        lines.push(`  ❌ ${p.name}`);
      }
      if (outOfStock.length > 5) lines.push(`  ... and ${outOfStock.length - 5} more`);
    }

    return lines.join("\n");
  } catch {
    return "⚠️ Error fetching inventory.";
  }
}

/** /lowstock — show products with low/zero stock */
export async function handleLowStock(): Promise<string> {
  const db = getDb();
  if (!db) return "⚠️ Database not available.";

  try {
    const { data: products, error } = await db
      .from("products")
      .select("name, stock, status")
      .eq("status", "active")
      .lte("stock", 5)
      .order("stock", { ascending: true })
      .limit(15);

    if (error) return "⚠️ Failed to fetch low stock products.";

    if (!products || products.length === 0) {
      return "✅ *Low Stock*\n\nAll products have adequate stock.";
    }

    const lines = [`⚠️ *Low Stock Products*\n`];
    for (const p of products) {
      const stock = p.stock ?? 0;
      const icon = stock === 0 ? "🔴" : stock <= 2 ? "🟡" : "🟢";
      lines.push(`${icon} ${p.name} — ${stock} unit${stock === 1 ? "" : "s"}`);
    }
    return lines.join("\n");
  } catch {
    return "⚠️ Error fetching low stock.";
  }
}
