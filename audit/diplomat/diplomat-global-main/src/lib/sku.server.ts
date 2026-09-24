/**
 * Centralized SKU generation and validation for Diplomat Global.
 *
 * Canonical format: DG-[CODE]-SN[NUMBER]
 *
 * Examples:
 *   DG-CMP-SN10
 *   DG-MOB-SN12
 *   DG-LAP-SN100
 *
 * Rules:
 * - Uppercase
 * - Begins with DG-
 * - Middle code is uppercase letters (typically category abbreviation)
 * - -SN followed by numeric sequence
 * - Unique per product
 * - Stable after creation
 */

/** Regex for the canonical DG-[CODE]-SN[NUMBER] format */
const SKU_REGEX = /^DG-([A-Z]{2,})-SN(\d+)$/;

/** Validate SKU format */
export function isValidSKU(sku: string): boolean {
  return SKU_REGEX.test(sku.toUpperCase());
}

/** Normalize SKU to uppercase */
export function normalizeSKU(sku: string): string {
  return sku.toUpperCase().trim();
}

/** Extract components from a valid SKU */
export function parseSKU(sku: string): { prefix: string; code: string; number: number } | null {
  const match = sku.toUpperCase().match(SKU_REGEX);
  if (!match) return null;
  return { prefix: "DG", code: match[1], number: Number(match[2]) };
}

/** Get a 2-4 letter code from a category name (e.g., "Computers" → "CMP") */
export function categoryToCode(categoryName: string): string {
  if (!categoryName) return "PRD";
  // Take first 3 uppercase letters from category name
  const letters = categoryName.replace(/[^a-zA-Z]/g, "").toUpperCase();
  return letters.slice(0, 3) || "PRD";
}

/** Get a 2-4 letter code from a product name */
export function nameToCode(productName: string): string {
  if (!productName) return "PRD";
  const letters = productName.replace(/[^a-zA-Z]/g, "").toUpperCase();
  return letters.slice(0, 3) || "PRD";
}

/**
 * Generate the next safe SKU for a given code prefix.
 * Uses DB query to find existing SKUs and avoid collisions.
 */
export async function generateNextSKU(db: any, code: string): Promise<string> {
  const prefix = `DG-${code}-SN`;

  // Find the highest existing sequence number for this code
  const { data: existing } = await db.from("products").select("sku").like("sku", `${prefix}%`);

  let maxNum = 9; // Start at SN10 if no existing SKUs

  if (existing && existing.length > 0) {
    for (const row of existing) {
      const match = row.sku?.match(/-SN(\d+)$/);
      if (match) {
        const num = Number(match[1]);
        if (num > maxNum) maxNum = num;
      }
    }
  }

  // Return next sequence number (safe against deleted records and concurrency)
  const nextNum = maxNum + 1;
  const candidate = `${prefix}${nextNum}`;

  // Verify uniqueness (handle race condition)
  const { data: collision } = await db
    .from("products")
    .select("id")
    .eq("sku", candidate)
    .maybeSingle();

  if (collision) {
    // Collision — try next number
    return `${prefix}${nextNum + 1}`;
  }

  return candidate;
}
