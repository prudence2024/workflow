import { PLANS, type SelectablePlanKey } from "@/lib/plans";

/**
 * Launch pricing is intentionally explicit commercial pricing. These values
 * are not derived from USD or an exchange rate.
 */
export const NGN_PRICES: Record<SelectablePlanKey, number | null> = {
  free: PLANS.free.priceMonthly,
  pro: PLANS.pro.priceMonthly,
  plus: PLANS.plus.priceMonthly,
};

export function formatNgnPrice(plan: SelectablePlanKey): string {
  const amount = NGN_PRICES[plan];
  return amount === null ? "₦—" : `₦${amount.toLocaleString("en-NG")}`;
}
