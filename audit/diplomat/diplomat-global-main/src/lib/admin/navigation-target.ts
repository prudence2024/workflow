const id = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const recordPath = new RegExp(`^/dashboard/(orders|transactions|customers)/${id}$`);
const listPaths = new Set([
  "/dashboard/orders",
  "/dashboard/transactions",
  "/dashboard/customers",
  "/dashboard/products",
  "/dashboard/reviews",
  "/dashboard/inventory",
  "/dashboard/payments",
  "/dashboard/receipts",
  "/dashboard/messages",
  "/dashboard/testimonials",
  "/dashboard/members",
  "/dashboard/roles",
  "/dashboard/integrations",
  "/dashboard/media",
  "/dashboard/backup",
  "/dashboard/blog",
]);

/** Stored destinations are data, never an instruction to execute arbitrary URLs. */
export function adminNavigationTarget(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/dashboard/") || /[\\#]/.test(value))
    return null;
  const url = new URL(value, "https://admin.invalid");
  if (
    url.origin !== "https://admin.invalid" ||
    (!listPaths.has(url.pathname) && !recordPath.test(url.pathname))
  )
    return null;
  const search: Record<string, string> = {};
  for (const [key, entry] of url.searchParams) {
    if (key === "detail" && new RegExp(`^${id}$`).test(entry)) search.detail = entry;
    else if (key === "search" && entry.length <= 200) search.search = entry;
    else return null;
  }
  return { to: url.pathname, search };
}
