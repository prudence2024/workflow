export const CART_STORAGE_VERSION = 1;

export interface StoredCartProduct {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  category: string;
  price: number;
  image: string;
  inStock: boolean;
}

export interface StoredCartLine {
  productId: string;
  quantity: number;
  product?: StoredCartProduct;
}

interface VersionedCart {
  version: typeof CART_STORAGE_VERSION;
  items: unknown[];
}

export interface ParsedStoredCart {
  items: StoredCartLine[];
  invalidItemCount: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeProduct(value: unknown, productId: string): StoredCartProduct | undefined {
  if (!isRecord(value) || value.id !== productId) return undefined;
  if (
    typeof value.slug !== "string" ||
    typeof value.name !== "string" ||
    typeof value.tagline !== "string" ||
    typeof value.category !== "string" ||
    typeof value.price !== "number" ||
    !Number.isFinite(value.price) ||
    typeof value.image !== "string" ||
    typeof value.inStock !== "boolean"
  ) {
    return undefined;
  }
  return {
    id: productId,
    slug: value.slug,
    name: value.name,
    tagline: value.tagline,
    category: value.category,
    price: value.price,
    image: value.image,
    inStock: value.inStock,
  };
}

function normalizeLine(value: unknown): StoredCartLine | null {
  if (!isRecord(value)) return null;
  const embedded = isRecord(value.product) ? value.product : undefined;
  const productIdCandidates = [value.productId, value.product_id, value.id, embedded?.id];
  const productId = productIdCandidates.find(
    (candidate): candidate is string => typeof candidate === "string" && candidate.trim() !== "",
  );
  const quantity =
    typeof value.quantity === "string" && value.quantity.trim() !== ""
      ? Number(value.quantity)
      : value.quantity;
  if (
    !productId ||
    !UUID_PATTERN.test(productId) ||
    !Number.isInteger(quantity) ||
    Number(quantity) < 1 ||
    Number(quantity) > 99
  ) {
    return null;
  }
  const product = normalizeProduct(embedded, productId);
  return product
    ? { productId, quantity: Number(quantity), product }
    : { productId, quantity: Number(quantity) };
}

/**
 * Accepts both the original unversioned array and the current versioned envelope.
 * Embedded names/prices remain display-only; checkout sends only productId and quantity.
 */
export function parseStoredCartState(raw: string): ParsedStoredCart {
  const parsed: unknown = JSON.parse(raw);
  const values = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && parsed.version === CART_STORAGE_VERSION && Array.isArray(parsed.items)
      ? parsed.items
      : [];
  const normalized = values.map(normalizeLine);
  return {
    items: normalized.filter((line): line is StoredCartLine => line !== null),
    invalidItemCount: normalized.filter((line) => line === null).length,
  };
}

export function parseStoredCart(raw: string): StoredCartLine[] {
  return parseStoredCartState(raw).items;
}

export function serializeStoredCart(items: StoredCartLine[]): string {
  const payload: VersionedCart = { version: CART_STORAGE_VERSION, items };
  return JSON.stringify(payload);
}

export function toCheckoutItems(items: StoredCartLine[]) {
  return items.map(({ productId, quantity }) => ({ productId, quantity }));
}
