export interface InventoryRow {
  quantity: number;
  reserved?: number | null;
  low_stock_threshold?: number | null;
}

export type InventoryRelation = InventoryRow | InventoryRow[] | null | undefined;

export interface InventoryDatabaseError {
  message: string;
}

export interface InventoryDatabaseResult<T> {
  data: T | null;
  error: InventoryDatabaseError | null;
}

export interface InventoryPageInput {
  page: number;
  pageSize: number;
}

export function resolveInventoryPage<T>(
  input: InventoryPageInput,
  response: InventoryDatabaseResult<T[]> & { count?: number | null },
) {
  if (response.error) {
    return {
      ok: false as const,
      items: [] as T[],
      total: 0,
      page: input.page,
      pageSize: input.pageSize,
      totalPages: 0,
      message: "Inventory could not be loaded. Please retry.",
    };
  }
  const items = response.data ?? [];
  const total = response.count ?? items.length;
  return {
    ok: true as const,
    items,
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.ceil(total / input.pageSize),
  };
}

export function confirmInventoryUpdate<T>(response: InventoryDatabaseResult<T>) {
  if (response.error) {
    return { ok: false as const, message: "Failed to update inventory." };
  }
  if (!response.data) {
    return {
      ok: false as const,
      message: "Inventory changed or no longer exists. Refresh and retry.",
    };
  }
  return { ok: true as const, inventory: response.data };
}

export function getInventoryQuantity(inventory: InventoryRelation): number | null {
  const row = Array.isArray(inventory) ? inventory[0] : inventory;
  if (!row || !Number.isInteger(row.quantity) || row.quantity < 0) return null;
  return Math.max(0, row.quantity - Math.max(0, row.reserved ?? 0));
}

/**
 * An inventory row is the canonical availability source. The legacy product
 * flag is consulted only for products that genuinely have no inventory row.
 */
export function isProductAvailable(inventory: InventoryRelation, legacyInStock: boolean): boolean {
  const quantity = getInventoryQuantity(inventory);
  return quantity === null ? legacyInStock : quantity > 0;
}

export type InventoryState = "out_of_stock" | "low_stock" | "in_stock";

export function getInventoryState(quantity: number, lowStockThreshold: number): InventoryState {
  if (quantity <= 0) return "out_of_stock";
  if (quantity <= lowStockThreshold) return "low_stock";
  return "in_stock";
}

/** Default threshold applied when an inventory row has no saved value. */
export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

export interface ResolvedStockState {
  /** Cart/checkout gating: an inventory row's quantity is authoritative; legacy flag is the no-row fallback. */
  inStock: boolean;
  state: InventoryState;
  /** null when no inventory row exists (legacy product). */
  quantity: number | null;
}

/**
 * Single owner of display stock state for every surface (Shop, Product Detail,
 * Admin). An inventory row is authoritative: quantity 0 → Sold Out, quantity
 * ≤ threshold → Low Stock, otherwise In Stock. Products without a row fall
 * back to the legacy availability flag as in/out only (no threshold to judge).
 */
export function resolveLowStockThreshold(
  value: unknown,
  fallback = DEFAULT_LOW_STOCK_THRESHOLD,
): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1_000_000
    ? value
    : fallback;
}

export function resolveInventoryState(
  inventory: InventoryRelation,
  legacyInStock: boolean,
  defaultThreshold = DEFAULT_LOW_STOCK_THRESHOLD,
): ResolvedStockState {
  const row = Array.isArray(inventory) ? inventory[0] : inventory;
  const quantity = getInventoryQuantity(inventory);
  if (!row || quantity === null) {
    return { inStock: legacyInStock, state: legacyInStock ? "in_stock" : "out_of_stock", quantity: null };
  }
  return {
    inStock: quantity > 0,
    state: getInventoryState(
      quantity,
      resolveLowStockThreshold(row.low_stock_threshold, defaultThreshold),
    ),
    quantity,
  };
}

export function shouldDecrementInventoryForFinalization(input: {
  orderWasAlreadyPaid: boolean;
  orderClaimedByThisRequest: boolean;
}): boolean {
  return !input.orderWasAlreadyPaid && input.orderClaimedByThisRequest;
}

export type InventoryDecrementResult =
  | { decremented: true; quantity: number }
  | {
      decremented: false;
      reason: "insufficient" | "conflict" | "error";
      available?: number;
    };

/**
 * Decrement stock with an exact-value compare-and-swap. The database callback
 * must update only when `quantity === expectedQuantity`; bounded retries avoid
 * lost updates when distinct paid orders complete concurrently.
 *
 * This protects normal retries and contention. It is not a substitute for a
 * transactional order/inventory marker if the process crashes between effects.
 */
export async function decrementInventoryAtomic(
  requestedQuantity: number,
  load: () => Promise<InventoryDatabaseResult<InventoryRow>>,
  compareAndSwap: (input: {
    expectedQuantity: number;
    nextQuantity: number;
  }) => Promise<InventoryDatabaseResult<InventoryRow>>,
  maxAttempts = 8,
): Promise<InventoryDecrementResult> {
  if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
    return { decremented: false, reason: "error" };
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const current = await load();
    if (current.error || !current.data) return { decremented: false, reason: "error" };

    const available = current.data.quantity;
    if (!Number.isInteger(available) || available < 0) {
      return { decremented: false, reason: "error" };
    }
    if (available < requestedQuantity) {
      return { decremented: false, reason: "insufficient", available };
    }

    const updated = await compareAndSwap({
      expectedQuantity: available,
      nextQuantity: available - requestedQuantity,
    });
    if (updated.error) return { decremented: false, reason: "error", available };
    if (updated.data) return { decremented: true, quantity: updated.data.quantity };
  }

  return { decremented: false, reason: "conflict" };
}
