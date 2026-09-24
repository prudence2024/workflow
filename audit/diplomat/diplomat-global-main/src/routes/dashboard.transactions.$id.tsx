import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CreditCard, Receipt, Package } from "lucide-react";
import { adminGetTransactionDetail } from "@/lib/admin/server-fns";

const txnStatusColors: Record<string, string> = {
  successful: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  pending: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const formatNaira = (n: number) => "₦" + n.toLocaleString("en-NG");

export const Route = createFileRoute("/dashboard/transactions/$id")({
  head: () => ({
    meta: [
      { title: "Transaction Detail — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: TransactionDetailPage,
});

function TransactionDetailPage() {
  const { id } = Route.useParams();
  const [txn, setTxn] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [permDenied, setPermDenied] = useState(false);
  const fetchDetail = useServerFn(adminGetTransactionDetail);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetchDetail({ data: { transaction_id: id } });
        if (res?.transaction) {
          setTxn(res.transaction);
        } else if (
          res?.error?.includes("permission") ||
          res?.error?.includes("authorized") ||
          res?.error?.includes("authenticated") ||
          res?.error?.includes("Permission")
        ) {
          setPermDenied(true);
          setError(res.error);
        } else {
          setError(res?.error || "Transaction not found");
        }
      } catch (err: any) {
        console.error("[txn-detail] Failed to load:", err);
        setError(err?.message || "Failed to load transaction. Please try again.");
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
          {error || "You do not have permission to view this transaction."}
        </p>
      </div>
    );
  if (error)
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="text-4xl">🔍</div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Transaction Not Found
        </h2>
        <p className="text-sm text-gray-500">{error}</p>
        <Link to="/dashboard/transactions" className="text-sm text-brand hover:underline mt-2">
          ← Back to Transactions
        </Link>
      </div>
    );
  if (!txn) return null;

  const order = txn.orders;
  // Name and Email are distinct fields; never infer a name from the email.
  const customerName = order?.customers
    ? `${order.customers.first_name || ""} ${order.customers.last_name || ""}`.trim() ||
      "Not provided"
    : "Not provided";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/dashboard/transactions"
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Transaction</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">{txn.reference}</p>
        </div>
        <Badge className={txnStatusColors[txn.status] || ""}>{txn.status}</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-white dark:bg-[#0F0F12]">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5" /> Payment Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <span className="text-gray-500 block">Amount</span>
              <span className="text-xl font-bold text-brand">
                {formatNaira(Number(txn.amount))}
              </span>
            </div>
            <div>
              <span className="text-gray-500 block">Currency</span>
              <span className="text-gray-900 dark:text-white">
                {txn.currency || "Not recorded"}
              </span>
            </div>
            <div>
              <span className="text-gray-500 block">Application Reference</span>
              <span className="font-mono text-gray-900 dark:text-white">{txn.reference}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Paystack Reference</span>
              <span className="font-mono text-xs text-gray-900 dark:text-white">
                {txn.paystack_reference || "Not recorded"}
              </span>
            </div>
            <div>
              <span className="text-gray-500 block">Channel</span>
              <span className="text-gray-900 dark:text-white">{txn.channel || "Not recorded"}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Status</span>
              <Badge className={txnStatusColors[txn.status] || ""}>{txn.status}</Badge>
            </div>
            <div>
              <span className="text-gray-500 block">Verification</span>
              <span className="text-gray-900 dark:text-white">Not recorded</span>
            </div>
            <div>
              <span className="text-gray-500 block">Paid</span>
              <span>
                {txn.paid_at ? new Date(txn.paid_at).toLocaleString("en-NG") : "Not recorded"}
              </span>
            </div>
            <div>
              <span className="text-gray-500 block">Verified timestamp</span>
              <span>Not recorded</span>
            </div>
            <div>
              <span className="text-gray-500 block">Created</span>
              <span className="text-gray-900 dark:text-white">
                {new Date(txn.created_at).toLocaleString("en-NG")}
              </span>
            </div>
            {txn.gateway_response && (
              <div>
                <span className="text-gray-500 block">Gateway Response</span>
                <span className="text-gray-700 dark:text-gray-300 text-xs">
                  {txn.gateway_response}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {order && (
          <Card className="bg-white dark:bg-[#0F0F12]">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="h-5 w-5" /> Linked Order
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <span className="text-gray-500 block">Order</span>
                <a
                  href={`/dashboard/orders/${order.id}`}
                  className="font-mono text-brand hover:underline"
                >
                  {order.reference}
                </a>
              </div>
              <div>
                <span className="text-gray-500 block">Customer</span>
                <span className="text-gray-900 dark:text-white">{customerName}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Customer Email</span>
                <span className="text-gray-900 dark:text-white">
                  {order.email || "Not recorded"}
                </span>
              </div>
              <div>
                <span className="text-gray-500 block">Total</span>
                <span className="font-bold">{formatNaira(Number(order.total))}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Items</span>
                <span className="text-gray-900 dark:text-white">
                  {order.order_items?.length || 0} product(s)
                </span>
              </div>
              {(order.order_items || []).map((item: any) => (
                <div
                  key={item.id}
                  className="flex justify-between text-xs border-t border-gray-100 dark:border-gray-800 pt-2"
                >
                  <span>
                    {item.name} {item.sku && <span className="text-gray-400">({item.sku})</span>}
                  </span>
                  <span>
                    ×{item.quantity} — {formatNaira(Number(item.line_total))}
                  </span>
                </div>
              ))}
              {order.receipts?.length > 0 && order.receipts[0].download_token && (
                <div className="pt-2">
                  <a
                    href={`/api/receipt/${order.receipts[0].download_token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-brand hover:underline"
                  >
                    <Receipt className="h-4 w-4 inline mr-1" />
                    View Receipt
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
