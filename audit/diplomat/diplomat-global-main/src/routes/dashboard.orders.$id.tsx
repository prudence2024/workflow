import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Receipt, CreditCard, Package, User, MapPin, Clock } from "lucide-react";
import { adminGetOrderDetail, adminUpdateOrderStatus } from "@/lib/admin/server-fns";
import { toast } from "sonner";

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
  abandoned: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
};

const formatNaira = (n: number) => "₦" + n.toLocaleString("en-NG");

export const Route = createFileRoute("/dashboard/orders/$id")({
  head: () => ({
    meta: [
      { title: "Order Detail — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: OrderDetailPage,
});

function OrderDetailPage() {
  const { id } = Route.useParams();
  const [order, setOrder] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [permDenied, setPermDenied] = useState(false);
  const fetchDetail = useServerFn(adminGetOrderDetail);
  const updateStatus = useServerFn(adminUpdateOrderStatus);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchDetail({ data: { order_id: id } });
      if (res?.order) {
        setOrder(res.order);
        setTransactions(res.transactions || []);
      } else if (
        res?.error?.includes("permission") ||
        res?.error?.includes("authorized") ||
        res?.error?.includes("authenticated") ||
        res?.error?.includes("Permission")
      ) {
        setPermDenied(true);
        setError(res.error);
      } else {
        setError(res?.error || "Order not found");
      }
    } catch (err: any) {
      console.error("[order-detail] Failed to load:", err);
      setError(err?.message || "Failed to load order. Please try again.");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  const handleStatusUpdate = async (newStatus: string) => {
    try {
      const res = await updateStatus({ data: { order_id: id, status: newStatus } });
      if (res?.ok) {
        toast.success(`Status updated to ${newStatus}`);
        load();
      } else toast.error(res?.message || "Update failed");
    } catch (err: any) {
      toast.error(err?.message || "Update failed");
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-brand border-t-transparent rounded-full" />
      </div>
    );
  if (permDenied)
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="text-4xl">🔒</div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Access Denied</h2>
        <p className="text-sm text-gray-500">
          {error || "You do not have permission to view this order."}
        </p>
      </div>
    );
  if (error)
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="text-4xl">🔍</div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Order Not Found</h2>
        <p className="text-sm text-gray-500">{error}</p>
        <Link to="/dashboard/orders" className="text-sm text-brand hover:underline mt-2">
          ← Back to Orders
        </Link>
      </div>
    );
  if (!order) return null;

  const customerName = order.customers
    ? `${order.customers.first_name || ""} ${order.customers.last_name || ""}`.trim() ||
      "Not provided"
    : "Not provided";
  const shipping = (order.shipping_address as any) || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard/orders"
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{order.reference}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Order #{order.id.slice(0, 8)}
            </p>
          </div>
          <Badge className={statusColors[order.status] || "bg-gray-100 text-gray-600"}>
            {order.status}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {order.status === "pending" && (
            <Button size="sm" onClick={() => handleStatusUpdate("cancelled")} variant="destructive">
              Cancel
            </Button>
          )}
          {order.status === "paid" && (
            <Button size="sm" onClick={() => handleStatusUpdate("processing")}>
              Mark Processing
            </Button>
          )}
          {order.status === "processing" && (
            <Button size="sm" onClick={() => handleStatusUpdate("shipped")}>
              Mark Shipped
            </Button>
          )}
          {order.status === "shipped" && (
            <Button size="sm" onClick={() => handleStatusUpdate("delivered")}>
              Mark Delivered
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Items + Totals */}
        <div className="lg:col-span-2 space-y-6">
          {/* Items */}
          <Card className="bg-white dark:bg-[#0F0F12]">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="h-5 w-5" /> Order Items
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800">
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                        Product
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">
                        SKU
                      </th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                        Qty
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                        Unit Price
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(order.order_items || []).map((item: any) => (
                      <tr
                        key={item.id}
                        className="border-b border-gray-100 dark:border-gray-800/50"
                      >
                        <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">
                          {item.name}
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden sm:table-cell font-mono text-xs">
                          {item.sku || "—"}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                          {formatNaira(Number(item.unit_price))}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
                          {formatNaira(Number(item.line_total))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Totals */}
          <Card className="bg-white dark:bg-[#0F0F12]">
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-2 max-w-sm ml-auto">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span>{formatNaira(Number(order.subtotal))}</span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Discount</span>
                    <span className="text-green-600">-{formatNaira(Number(order.discount))}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Delivery</span>
                  <span>
                    {order.delivery_fee > 0 ? formatNaira(Number(order.delivery_fee)) : "Free"}
                  </span>
                </div>
                {order.coupon_id && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Coupon</span>
                    <Badge variant="outline" className="text-xs">
                      Applied
                    </Badge>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
                  <span>Total</span>
                  <span className="text-brand">{formatNaira(Number(order.total))}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Transactions */}
          {transactions.length > 0 && (
            <Card className="bg-white dark:bg-[#0F0F12]">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CreditCard className="h-5 w-5" /> Payment History
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-800">
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                          Reference
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">
                          Channel
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                          Status
                        </th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                          Amount
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                          Date
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((txn: any) => (
                        <tr
                          key={txn.id}
                          className="border-b border-gray-100 dark:border-gray-800/50"
                        >
                          <td className="px-4 py-3 font-mono text-xs text-gray-900 dark:text-white">
                            {txn.reference}
                          </td>
                          <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                            {txn.channel || "—"}
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={txnStatusColors[txn.status] || ""}>
                              {txn.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            {formatNaira(Number(txn.amount))}
                          </td>
                          <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                            {txn.paid_at ? new Date(txn.paid_at).toLocaleString("en-NG") : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Customer + Shipping + Receipt */}
        <div className="space-y-6">
          {/* Customer */}
          <Card className="bg-white dark:bg-[#0F0F12]">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5" /> Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <span className="text-gray-500 block">Name</span>
                <span className="text-gray-900 dark:text-white font-medium">{customerName}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Email</span>
                <span className="text-gray-900 dark:text-white">{order.email}</span>
              </div>
              {order.customers?.phone && (
                <div>
                  <span className="text-gray-500 block">Phone</span>
                  <span className="text-gray-900 dark:text-white">{order.customers.phone}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Shipping Address */}
          <Card className="bg-white dark:bg-[#0F0F12]">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="h-5 w-5" /> Shipping
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {shipping.state && (
                <div>
                  <span className="text-gray-500">State: </span>
                  <span className="text-gray-900 dark:text-white">{shipping.state}</span>
                </div>
              )}
              {shipping.lga && (
                <div>
                  <span className="text-gray-500">LGA: </span>
                  <span className="text-gray-900 dark:text-white">{shipping.lga}</span>
                </div>
              )}
              {shipping.city && (
                <div>
                  <span className="text-gray-500">City: </span>
                  <span className="text-gray-900 dark:text-white">{shipping.city}</span>
                </div>
              )}
              {shipping.address && (
                <div>
                  <span className="text-gray-500">Address: </span>
                  <span className="text-gray-900 dark:text-white">{shipping.address}</span>
                </div>
              )}
              {!shipping.state && !shipping.lga && !shipping.address && (
                <p className="text-gray-400">No shipping address</p>
              )}
            </CardContent>
          </Card>

          {/* Receipt */}
          {order.receipts && order.receipts.length > 0 && (
            <Card className="bg-white dark:bg-[#0F0F12]">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Receipt className="h-5 w-5" /> Receipt
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <span className="text-gray-500 block">Receipt No.</span>
                  <span className="font-mono text-gray-900 dark:text-white">
                    {order.receipts[0].receipt_number}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block">Status</span>
                  <Badge className="bg-green-100 text-green-800">{order.receipts[0].status}</Badge>
                </div>
                {order.receipts[0].download_token && (
                  <a
                    href={`/api/receipt/${order.receipts[0].download_token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline"
                  >
                    <Receipt className="h-4 w-4" /> View Receipt
                  </a>
                )}
              </CardContent>
            </Card>
          )}

          {/* Order Metadata */}
          <Card className="bg-white dark:bg-[#0F0F12]">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5" /> Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <span className="text-gray-500">Created: </span>
                <span className="text-gray-900 dark:text-white">
                  {new Date(order.created_at).toLocaleString("en-NG")}
                </span>
              </div>
              {order.payment_reference && (
                <div>
                  <span className="text-gray-500">Payment Ref: </span>
                  <span className="font-mono text-gray-900 dark:text-white">
                    {order.payment_reference}
                  </span>
                </div>
              )}
              {order.idempotency_key && (
                <div>
                  <span className="text-gray-500">Idempotency: </span>
                  <span className="font-mono text-xs text-gray-400">
                    {order.idempotency_key.slice(0, 8)}...
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
