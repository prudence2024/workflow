import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, User, ShoppingCart, Star, Mail, Phone, MapPin } from "lucide-react";
import { adminGetCustomerDetail } from "@/lib/admin/server-fns";

const formatNaira = (n: number) => "₦" + n.toLocaleString("en-NG");
const statusColors: Record<string, string> = {
  paid: "bg-blue-100 text-blue-800",
  pending: "bg-orange-100 text-orange-800",
  cancelled: "bg-red-100 text-red-800",
  delivered: "bg-green-100 text-green-800",
};

export const Route = createFileRoute("/dashboard/customers/$id")({
  head: () => ({
    meta: [
      { title: "Customer Detail — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: CustomerDetailPage,
});

function CustomerDetailPage() {
  const { id } = Route.useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [permDenied, setPermDenied] = useState(false);
  const fetchDetail = useServerFn(adminGetCustomerDetail);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetchDetail({ data: { customer_id: id } });
        if (res?.customer) {
          setData(res);
        } else if (
          res?.error?.includes("permission") ||
          res?.error?.includes("authorized") ||
          res?.error?.includes("authenticated") ||
          res?.error?.includes("Permission")
        ) {
          setPermDenied(true);
          setError(res.error);
        } else {
          setError(res?.error || "Customer not found");
        }
      } catch (err: any) {
        console.error("[customer-detail] Failed to load:", err);
        setError(err?.message || "Failed to load customer. Please try again.");
      }
      setLoading(false);
    })();
  }, [id]);

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
          {error || "You do not have permission to view this customer."}
        </p>
      </div>
    );
  if (error)
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="text-4xl">🔍</div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Customer Not Found</h2>
        <p className="text-sm text-gray-500">{error}</p>
        <Link to="/dashboard/customers" className="text-sm text-brand hover:underline mt-2">
          ← Back to Customers
        </Link>
      </div>
    );
  if (!data) return null;

  const { customer, orders, reviews, totalSpend, totalOrders } = data;
  // Name and Email are distinct fields; never infer a name from the email.
  const customerName =
    `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || "Not provided";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/dashboard/customers"
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{customerName}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{customer.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white dark:bg-[#0F0F12]">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-brand">{totalOrders}</p>
            <p className="text-xs text-gray-500">Orders</p>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-[#0F0F12]">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-brand">{formatNaira(totalSpend)}</p>
            <p className="text-xs text-gray-500">Total Spend</p>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-[#0F0F12]">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-brand">{reviews.length}</p>
            <p className="text-xs text-gray-500">Reviews</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-white dark:bg-[#0F0F12]">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" /> Contact
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-gray-400" />
              <span>{customer.email}</span>
            </div>
            {customer.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-gray-400" />
                <span>{customer.phone}</span>
              </div>
            )}
            {customer.created_at && (
              <div className="text-xs text-gray-500 pt-2">
                Customer since {new Date(customer.created_at).toLocaleDateString("en-NG")}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-white dark:bg-[#0F0F12]">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" /> Order History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800">
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                        Order
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">
                        Items
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                        Total
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order: any) => (
                      <tr
                        key={order.id}
                        className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                        onClick={() => (window.location.href = `/dashboard/orders/${order.id}`)}
                      >
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                          {order.reference}
                        </td>
                        <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                          {order.order_items?.length || 0} items
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {formatNaira(Number(order.total))}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            className={statusColors[order.status] || "bg-gray-100 text-gray-600"}
                          >
                            {order.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                          {new Date(order.created_at).toLocaleDateString("en-NG")}
                        </td>
                      </tr>
                    ))}
                    {orders.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                          No orders yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {reviews.length > 0 && (
            <Card className="bg-white dark:bg-[#0F0F12]">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Star className="h-5 w-5" /> Reviews
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {reviews.map((r: any) => (
                  <div
                    key={r.id}
                    className="border-b border-gray-100 dark:border-gray-800 pb-3 last:border-0"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{r.products?.name || "Product"}</span>
                      <span className="text-yellow-500">{"★".repeat(r.rating || 0)}</span>
                    </div>
                    {r.comment && (
                      <p className="text-xs text-gray-500 mt-1">{r.comment.slice(0, 150)}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
