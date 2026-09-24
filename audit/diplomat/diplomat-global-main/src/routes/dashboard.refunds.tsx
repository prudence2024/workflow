import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Search } from "lucide-react";
import { adminListTransactions, adminInitiateRefund } from "@/lib/admin/server-fns";
import { joinInFlight } from "@/lib/in-flight-dedupe";
import { Pagination } from "@/components/admin/pagination";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/refunds")({
  head: () => ({
    meta: [
      { title: "Refunds — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: RefundsPage,
});

const formatNaira = (n: number) => "₦" + n.toLocaleString("en-NG");

function RefundsPage() {
  const [search, setSearch] = useState("");
  const [transactions, setTransactions] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refundId, setRefundId] = useState<string | null>(null);
  const [showRefundModal, setShowRefundModal] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");

  const fetchTransactions = useServerFn(adminListTransactions);
  const initiateRefund = useServerFn(adminInitiateRefund);

  const load = async () => {
    setLoading(true);
    // The page component mounts twice (verified live), so the same request
    // would otherwise be issued twice concurrently. Same key joins it.
    const res = await joinInFlight(`refunds|${search}|${page}`, () =>
      fetchTransactions({ data: { search, page, pageSize: 10 } }),
    );
    setTransactions(res.transactions || []);
    setTotal(res.total || 0);
    setLoading(false);
  };

  useEffect(() => {
    setPage(1);
  }, [search]);
  useEffect(() => {
    load();
  }, [page, search]);

  const handleRefund = async (txId: string) => {
    setRefundId(txId);
    const tx = transactions.find((t: any) => t.id === txId);
    const amount = refundAmount ? Number(refundAmount) : undefined;
    const res = await initiateRefund({
      data: { transaction_id: txId, amount, reason: refundReason || undefined },
    });
    if (res.ok) {
      toast.success("Refund initiated successfully");
      setShowRefundModal(null);
      setRefundAmount("");
      setRefundReason("");
      load();
    } else {
      toast.error(res.message);
    }
    setRefundId(null);
  };

  // Filter to show successful (refundable) and refunded transactions
  const refundable = transactions.filter((t: any) => t.status === "successful");
  const refunded = transactions.filter((t: any) => t.status === "refunded");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Refunds</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage payment refunds via Paystack
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-white dark:bg-[#0F0F12]">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Refundable Transactions</p>
            <p className="text-xl font-bold text-green-600">{refundable.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-[#0F0F12]">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Refunded</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{refunded.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          aria-label="Search by reference..."
          placeholder="Search by reference..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <Card className="bg-white dark:bg-[#0F0F12]">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    Reference
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    Order
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    Amount
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx: any) => (
                  <tr
                    key={tx.id}
                    className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900 dark:text-white font-mono">
                        {tx.reference}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{tx.orders?.reference || "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatNaira(Number(tx.amount))}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={
                          tx.status === "successful"
                            ? "bg-green-100 text-green-800"
                            : tx.status === "refunded"
                              ? "bg-gray-100 text-gray-600"
                              : "bg-orange-100 text-orange-800"
                        }
                      >
                        {tx.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {tx.status === "successful" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-red-600"
                          onClick={() => setShowRefundModal(tx.id)}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" /> Refund
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                      <RotateCcw className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">No transactions found</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Pagination page={page} totalItems={total} pageSize={10} onPageChange={setPage} />

      {/* Refund Modal */}
      {showRefundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md mx-4 bg-white dark:bg-[#1a1a1e] max-h-[90vh] overflow-y-auto">
            <CardContent className="p-6 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Initiate Refund
              </h3>
              <p className="text-sm text-gray-500">
                This will process a refund through Paystack. The action cannot be undone.
              </p>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Partial amount (₦, leave empty for full refund)
                </label>
                <Input
                  type="number"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder="Full refund"
                  min={1}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Reason
                </label>
                <Input
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Reason for refund"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleRefund(showRefundModal)}
                  disabled={refundId === showRefundModal}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {refundId === showRefundModal ? "Processing..." : "Confirm Refund"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowRefundModal(null);
                    setRefundAmount("");
                    setRefundReason("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
