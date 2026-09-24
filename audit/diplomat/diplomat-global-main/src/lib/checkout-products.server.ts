import "@tanstack/react-start/server-only";
import type { CheckoutProductRow } from "./checkout-quote";

export const CHECKOUT_PRODUCT_SELECT_WITH_COST =
  "id, sku, name, price, cost_price, status, inventory(quantity, reserved)";
export const CHECKOUT_PRODUCT_SELECT_BASE =
  "id, sku, name, price, status, inventory(quantity, reserved)";

export interface ProductQueryError {
  code?: string;
  message: string;
}

export class CheckoutProductQueryError extends Error {
  constructor(readonly databaseCode: string) {
    super("Products could not be verified. Please retry.");
    this.name = "CheckoutProductQueryError";
  }
}

type QueryResult = {
  data: unknown;
  error: ProductQueryError | null;
};

function productRows(data: unknown): CheckoutProductRow[] {
  return Array.isArray(data) ? (data as CheckoutProductRow[]) : [];
}

function costColumnIsUnavailable(error: ProductQueryError | null): boolean {
  return error?.code === "42703" && error.message.toLowerCase().includes("cost_price");
}

/**
 * Migration A owns cost columns and is Owner-gated. Quotes therefore attempt to
 * snapshot cost when available, while remaining operational against the current
 * pre-migration schema without inventing a cost value.
 */
export async function loadCheckoutProductRows(
  query: (selection: string) => PromiseLike<QueryResult>,
): Promise<CheckoutProductRow[]> {
  let result = await query(CHECKOUT_PRODUCT_SELECT_WITH_COST);
  if (costColumnIsUnavailable(result.error)) {
    result = await query(CHECKOUT_PRODUCT_SELECT_BASE);
    if (!result.error) {
      result = {
        data: productRows(result.data).map((product) => ({ ...product, cost_price: null })),
        error: null,
      };
    }
  }
  if (result.error) throw new CheckoutProductQueryError(result.error.code ?? "unknown");
  return productRows(result.data);
}
