/**
 * COGS data-quality summarizer — pure, shared by sales analytics.
 *
 * Cost semantics (from the cost_price migration):
 *   NULL    = cost unknown at time of sale (historical rows, unconfigured products)
 *   0       = explicitly zero cost (free item / giveaway) — KNOWN
 *   > 0     = actual captured cost — KNOWN
 *
 * Conflating NULL with 0 fabricates "COGS ₦0 / margin 100%" when cost data
 * simply was never captured. Callers must render a truthful "not configured"
 * state whenever costDataAvailable is false.
 */

export interface CogsItem {
  quantity: number | string | null;
  cost_price: number | string | null;
}

export interface CogsSummary {
  cogsTotal: number;
  itemsWithCost: number;
  itemsWithoutCost: number;
  hasCompleteData: boolean;
  /** false when NO item in the period carries a known cost → COGS-derived metrics are not meaningful */
  costDataAvailable: boolean;
}

export function summarizeCogs(items: CogsItem[]): CogsSummary {
  let cogsTotal = 0;
  let itemsWithCost = 0;
  let itemsWithoutCost = 0;

  for (const item of items) {
    const qty = Number(item.quantity ?? 0);
    const raw = item.cost_price;
    if (raw === null || raw === undefined) {
      itemsWithoutCost += qty;
      continue;
    }
    const cost = Number(raw);
    if (Number.isNaN(cost)) {
      itemsWithoutCost += qty;
      continue;
    }
    // Explicit zero is a KNOWN cost (contributes ₦0 to COGS by choice).
    cogsTotal += cost * qty;
    itemsWithCost += qty;
  }

  return {
    cogsTotal,
    itemsWithCost,
    itemsWithoutCost,
    hasCompleteData: itemsWithoutCost === 0,
    costDataAvailable: itemsWithCost > 0,
  };
}
