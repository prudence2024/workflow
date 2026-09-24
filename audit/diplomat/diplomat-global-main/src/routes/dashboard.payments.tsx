import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Search } from "lucide-react";
import { adminListTransactions } from "@/lib/admin/server-fns";
import { joinInFlight } from "@/lib/in-flight-dedupe";

export const Route = createFileRoute("/dashboard/payments")({
  head: () => ({
    meta: [
      { title: "Payments — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PaymentsPage,
});

const statusColors: Record<string, string> = {
  initiated: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
  pending: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  successful: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  refunded: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
};

const formatNaira = (n: number) => "₦" + n.toLocaleString("en-NG");

function PaymentsPage() {
  const [search, setSearch] = useState("");
  const [transactions, setTransactions] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchTransactions = useServerFn(adminListTransactions);

  const load = async () => {
    setLoading(true);
    // The page component mounts twice (verified live), so the same request
    // would otherwise be issued twice concurrently. Same key joins it.
    const res = await joinInFlight(`payments|${search}`, () =>
      fetchTransactions({ data: { search } }),
    );
    setTransactions(res.transactions || []);
    setTotal(res.total || 0);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [search]);

  // Summary stats
  const successful = transactions.filter((t: any) => t.status === "successful").length;
  const failed = transactions.filter((t: any) => t.status === "failed").length;
  const totalAmount = transactions
    .filter((t: any) => t.status === "successful")
    .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Payments</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Payment management and Paystack integration
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-white dark:bg-[#0F0F12]">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Total Transactions</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{total}</p>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-[#0F0F12]">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Successful</p>
            <p className="text-xl font-bold text-green-600">{successful}</p>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-[#0F0F12]">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Total Revenue</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {formatNaira(totalAmount)}
            </p>
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
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Reference
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Order
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Amount
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">
                    Channel
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">
                    Date
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
                      {tx.paystack_reference && (
                        <p className="text-xs text-gray-500">PS: {tx.paystack_reference}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {tx.orders?.reference || "—"}
                      </span>
                      <p className="text-xs text-gray-500">{tx.orders?.email || ""}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatNaira(Number(tx.amount))}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={statusColors[tx.status] || "bg-gray-100 text-gray-600"}>
                        {tx.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-sm text-gray-500">{tx.channel || "—"}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {new Date(tx.created_at).toLocaleDateString("en-NG", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-gray-500 dark:text-gray-400"
                    >
                      <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">No payments yet</p>
                      <p className="text-xs mt-1">
                        Payment records will appear after successful checkout
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
