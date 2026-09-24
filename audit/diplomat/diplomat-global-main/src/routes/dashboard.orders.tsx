import { useRouteSearchInput } from "@/hooks/use-route-search-input";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { ordersSearchSchema, ordersLoaderDeps, loadOrdersPage } from "@/lib/admin/orders-loader";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingCart,
  Search,
  Clock,
  RefreshCw,
  User,
  MapPin,
  Package,
  CreditCard,
  Receipt,
  ChevronRight,
} from "lucide-react";
import { adminGetOrderDetail, adminUpdateOrderStatus } from "@/lib/admin/server-fns";
import { Pagination } from "@/components/admin/pagination";
import { toast } from "sonner";
import {
  DetailDrawer,
  DetailDrawerSection,
  DetailField,
} from "@/components/dashboard/detail-drawer";

export const Route = createFileRoute("/dashboard/orders")({
  validateSearch: ordersSearchSchema,
  head: () => ({
    meta: [
      { title: "Orders — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  loaderDeps: ordersLoaderDeps,
  loader: loadOrdersPage,
  component: OrdersPage,
});

const statusColors: Record<string, string> = {
  pending: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  paid: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  processing: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  shipped: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  delivered: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  refunded: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
  abandoned: "bg-stone-100 text-stone-600 dark:bg-stone-800/50 dark:text-stone-400",
};

const txnStatusColors: Record<string, string> = {
  successful: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  pending: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const STATUS_OPTIONS = [
  "all",
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "abandoned",
];

const formatNaira = (n: number) => "₦" + n.toLocaleString("en-NG");

function OrdersPage() {
  const { page, search: urlSearch, status: urlStatus, detail: urlDetail } = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard/orders" });
  const router = useRouter();
  const match = Route.useMatch();

  // URL search params + the route loader are the single source of truth for
  // the orders list. The loader re-runs whenever page/search/status change
  // (see loaderDeps); Refresh re-runs it via router.invalidate().
  const { orders, total } = Route.useLoaderData();
  const listLoading = match.isFetching !== false;

  // The search input is transient local state that commits to the URL (and
  // therefore the loader) after a short debounce — typing never triggers
  // duplicate fetches.
  const [searchInput, setSearchInput] = useRouteSearchInput(urlSearch);
  useEffect(() => {
    if (searchInput === urlSearch) return;
    const t = setTimeout(() => {
      navigate({
        search: { page: 1, search: searchInput, status: urlStatus, detail: urlDetail },
        replace: true,
      });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, urlSearch, urlStatus, urlDetail, navigate]);

  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Detail drawer: the open order id lives in the URL (`?detail=`) so the
  // drawer can never diverge from the address bar. The drawer *data* itself is
  // fetched on demand for the open id — an interaction-driven read, not a
  // duplicate of the list loader.
  const detailId = urlDetail;
  const [detailData, setDetailData] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailPermDenied, setDetailPermDenied] = useState(false);
  const [detailNotFound, setDetailNotFound] = useState(false);
  const [detailUpdating, setDetailUpdating] = useState(false);

  const fetchDetail = useServerFn(adminGetOrderDetail);
  const updateStatus = useServerFn(adminUpdateOrderStatus);

  // Refresh = one authoritative re-read through the route loader.
  const refresh = useCallback(async () => {
    await router.invalidate({ sync: true });
  }, [router]);

  // Load detail when detailId changes
  useEffect(() => {
    if (!detailId) {
      setDetailData(null);
      setDetailError(null);
      setDetailPermDenied(false);
      setDetailNotFound(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      setDetailError(null);
      setDetailPermDenied(false);
      setDetailNotFound(false);
      try {
        const res = await fetchDetail({ data: { order_id: detailId } });
        if (cancelled) return;
        if (res?.order) {
          setDetailData({ order: res.order, transactions: res.transactions || [] });
        } else if (
          res?.error?.toLowerCase().includes("permission") ||
          res?.error?.toLowerCase().includes("authorized")
        ) {
          setDetailPermDenied(true);
          setDetailError(res.error);
        } else if (res?.error?.toLowerCase().includes("not found")) {
          setDetailNotFound(true);
          setDetailError(res.error);
        } else {
          setDetailError(res?.error || "Failed to load");
        }
      } catch (err: any) {
        if (!cancelled) setDetailError(err?.message || "Failed to load order");
      }
      if (!cancelled) setDetailLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [detailId]);

  const openDetail = useCallback(
    (id: string) => {
      navigate({
        search: { page, search: urlSearch, status: urlStatus, detail: id },
        replace: true,
      });
    },
    [page, urlSearch, urlStatus, navigate],
  );

  const closeDetail = useCallback(() => {
    navigate({ search: { page, search: urlSearch, status: urlStatus, detail: "" }, replace: true });
  }, [page, urlSearch, urlStatus, navigate]);

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    setUpdatingId(orderId);
    setDetailUpdating(true);
    const res = await updateStatus({ data: { order_id: orderId, status: newStatus } });
    if (res.ok) {
      toast.success(`Status updated to ${newStatus}`);
      // Re-read the authoritative list through the route loader
      await router.invalidate({ sync: true });
      if (detailId === orderId) {
        const refreshed = await fetchDetail({ data: { order_id: orderId } });
        if (refreshed?.order)
          setDetailData({ order: refreshed.order, transactions: refreshed.transactions || [] });
      }
    } else {
      toast.error(res.message);
    }
    setUpdatingId(null);
    setDetailUpdating(false);
  };

  const order = detailData?.order;
  const transactions = detailData?.transactions || [];
  // Name and Email are distinct fields; never infer a name from the email.
  const customerName = order?.customers
    ? `${order.customers.first_name || ""} ${order.customers.last_name || ""}`.trim() ||
      "Not provided"
    : "Not provided";
  const shipping = (order?.shipping_address as any) || {};

  return (
    <div className="space-y-6" aria-busy={listLoading}>
      {listLoading && <p role="status">Loading current orders...</p>}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Orders</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{total} orders</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={listLoading}
          className="mt-4 sm:mt-0"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${listLoading ? "animate-spin" : ""}`} />{" "}
          {listLoading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            aria-label="Search by reference or email..."
            placeholder="Search by reference or email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {STATUS_OPTIONS.map((s) => (
            <Button
              key={s}
              variant={urlStatus === s ? "default" : "outline"}
              size="sm"
              onClick={() =>
                navigate({
                  search: { page: 1, search: urlSearch, status: s, detail: urlDetail },
                  replace: true,
                })
              }
              className={
                urlStatus === s ? "bg-gray-900 dark:bg-white dark:text-gray-900 text-white" : ""
              }
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <Card className="bg-white dark:bg-[#0F0F12]">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Order
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden sm:table-cell">
                    Customer
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Total
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">
                    Date
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-8" />
                </tr>
              </thead>
              <tbody>
                {!listLoading &&
                  orders.map((o: any) => {
                    // Name and Email are distinct; never infer a name from the email.
                    const custName = o.customers
                      ? `${o.customers.first_name || ""} ${o.customers.last_name || ""}`.trim() ||
                        "Not provided"
                      : "Not provided";
                    return (
                      <tr
                        key={o.id}
                        className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                        onClick={() => openDetail(o.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openDetail(o.id);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`View order ${o.reference}`}
                      >
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {o.reference}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {o.order_items?.length || 0} items
                          </p>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <p className="text-sm text-gray-900 dark:text-white">{custName}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{o.email}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {formatNaira(Number(o.total))}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={statusColors[o.status] || "bg-gray-100 text-gray-600"}>
                            {o.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {new Date(o.created_at).toLocaleDateString("en-NG", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        </td>
                      </tr>
                    );
                  })}
                {orders.length === 0 && !listLoading && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-gray-500 dark:text-gray-400"
                    >
                      <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">No orders yet</p>
                      <p className="text-xs mt-1">
                        Orders will appear after customers complete checkout
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalItems={total}
            pageSize={10}
            onPageChange={(p: number) =>
              navigate({
                search: { page: p, search: urlSearch, status: urlStatus, detail: urlDetail },
                replace: true,
              })
            }
          />
        </CardContent>
      </Card>

      {/* ── Order Detail Drawer ── */}
      <DetailDrawer
        open={!!detailId}
        onClose={closeDetail}
        title={order?.reference || "Order Detail"}
        subtitle={order ? `ID: ${order.id.slice(0, 8)}` : undefined}
        badge={
          order ? (
            <Badge className={statusColors[order.status] || ""}>{order.status}</Badge>
          ) : undefined
        }
        actions={
          order ? (
            <div className="flex gap-1">
              {order.status === "paid" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={detailUpdating}
                  onClick={() => handleStatusUpdate(order.id, "processing")}
                >
                  Process
                </Button>
              )}
              {order.status === "processing" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={detailUpdating}
                  onClick={() => handleStatusUpdate(order.id, "shipped")}
                >
                  Ship
                </Button>
              )}
              {order.status === "shipped" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={detailUpdating}
                  onClick={() => handleStatusUpdate(order.id, "delivered")}
                >
                  Deliver
                </Button>
              )}
            </div>
          ) : undefined
        }
        loading={detailLoading}
        error={detailError}
        accessDenied={detailPermDenied}
        notFound={detailNotFound}
      >
        {order && (
          <div className="space-y-5 p-5">
            {/* Customer & Shipping */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DetailDrawerSection title="Customer" icon={<User className="h-4 w-4" />}>
                <div className="space-y-2">
                  <DetailField label="Name">{customerName}</DetailField>
                  <DetailField label="Email">{order.email}</DetailField>
                  {order.customers?.phone && (
                    <DetailField label="Phone">{order.customers.phone}</DetailField>
                  )}
                </div>
              </DetailDrawerSection>

              <DetailDrawerSection title="Shipping" icon={<MapPin className="h-4 w-4" />}>
                <div className="space-y-1 text-sm">
                  {shipping.state && (
                    <p>
                      <span className="text-gray-500">State: </span>
                      {shipping.state}
                    </p>
                  )}
                  {shipping.lga && (
                    <p>
                      <span className="text-gray-500">LGA: </span>
                      {shipping.lga}
                    </p>
                  )}
                  {shipping.city && (
                    <p>
                      <span className="text-gray-500">City: </span>
                      {shipping.city}
                    </p>
                  )}
                  {shipping.address && (
                    <p>
                      <span className="text-gray-500">Address: </span>
                      {shipping.address}
                    </p>
                  )}
                  {!shipping.state && !shipping.lga && !shipping.address && (
                    <p className="text-gray-400">No shipping address</p>
                  )}
                </div>
              </DetailDrawerSection>
            </div>

            {/* Order Items */}
            <DetailDrawerSection title="Items" icon={<Package className="h-4 w-4" />}>
              <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
                {(order.order_items || []).map((item: any) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {item.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {item.sku && <span className="font-mono">SKU: {item.sku}</span>}
                        {item.sku && " · "}Qty: {item.quantity} ·{" "}
                        {formatNaira(Number(item.unit_price))}/ea
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white ml-3">
                      {formatNaira(Number(item.line_total))}
                    </p>
                  </div>
                ))}
              </div>
            </DetailDrawerSection>

            {/* Totals */}
            <DetailDrawerSection title="Summary">
              <div className="space-y-1.5 max-w-xs ml-auto text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Subtotal</span>
                  <span>{formatNaira(Number(order.subtotal))}</span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Discount</span>
                    <span className="text-green-600">-{formatNaira(Number(order.discount))}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Delivery</span>
                  <span>
                    {order.delivery_fee > 0 ? formatNaira(Number(order.delivery_fee)) : "Free"}
                  </span>
                </div>
                <div className="flex justify-between font-bold border-t border-gray-200 dark:border-gray-700 pt-1.5 mt-1.5">
                  <span>Total</span>
                  <span className="text-brand">{formatNaira(Number(order.total))}</span>
                </div>
              </div>
            </DetailDrawerSection>

            {/* Payment History */}
            {transactions.length > 0 && (
              <DetailDrawerSection
                title="Payment History"
                icon={<CreditCard className="h-4 w-4" />}
              >
                <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
                  {transactions.map((txn: any) => (
                    <div
                      key={txn.id}
                      className="flex items-center justify-between py-2 first:pt-0 last:pb-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg px-2 -mx-2 transition-colors"
                      onClick={() => navigate({ to: "/dashboard/transactions", search: { page: 1, detail: txn.id } })}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs text-gray-900 dark:text-white">
                          {txn.reference}
                        </p>
                        <p className="text-xs text-gray-500">
                          {txn.channel || "—"} ·{" "}
                          {txn.paid_at ? new Date(txn.paid_at).toLocaleString("en-NG") : "—"}
                        </p>
                      </div>
                      <div className="text-right ml-3">
                        <p className="text-sm font-medium">{formatNaira(Number(txn.amount))}</p>
                        <Badge className={`text-xs ${txnStatusColors[txn.status] || ""}`}>
                          {txn.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </DetailDrawerSection>
            )}

            {/* Receipt + Timeline */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {order.receipts?.length > 0 && order.receipts[0].download_token && (
                <DetailDrawerSection title="Receipt" icon={<Receipt className="h-4 w-4" />}>
                  <a
                    href={`/api/receipt/${order.receipts[0].download_token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-brand hover:underline"
                  >
                    View Receipt →
                  </a>
                </DetailDrawerSection>
              )}
              <DetailDrawerSection title="Timeline" icon={<Clock className="h-4 w-4" />}>
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="text-gray-500">Created: </span>
                    {new Date(order.created_at).toLocaleString("en-NG")}
                  </p>
                  {order.payment_reference && (
                    <p>
                      <span className="text-gray-500">Payment Ref: </span>
                      <span className="font-mono text-xs">{order.payment_reference}</span>
                    </p>
                  )}
                </div>
              </DetailDrawerSection>
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
