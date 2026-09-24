import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Receipt, Search, Eye, Mail, X, ExternalLink, RefreshCw } from "lucide-react";
import { adminListReceipts, adminGetReceiptHTML, adminResendReceipt } from "@/lib/admin/server-fns";
import { joinInFlight } from "@/lib/in-flight-dedupe";
import { Pagination } from "@/components/admin/pagination";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/receipts")({
  head: () => ({
    meta: [
      { title: "Receipts — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ReceiptsPage,
});

const formatNaira = (n: number) => "₦" + n.toLocaleString("en-NG");

function ReceiptsPage() {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [viewingReceipt, setViewingReceipt] = useState<any>(null);
  const [receiptHTML, setReceiptHTML] = useState<string | null>(null);
  const [loadingHTML, setLoadingHTML] = useState(false);
  const [resending, setResending] = useState<string | null>(null);

  const fetchReceipts = useServerFn(adminListReceipts);
  const getReceiptHTML = useServerFn(adminGetReceiptHTML);
  const resendReceipt = useServerFn(adminResendReceipt);

  const load = async () => {
    setLoading(true);
    // The page component mounts twice (verified live), so the same request
    // would otherwise be issued twice concurrently. Same key joins it.
    const res = await joinInFlight(`receipts|${search}|${page}`, () =>
      fetchReceipts({ data: { search, page, pageSize: 10 } }),
    );
    setReceipts(res.receipts || []);
    setTotal(res.total || 0);
    setLoading(false);
  };

  useEffect(() => {
    setPage(1);
  }, [search]);
  useEffect(() => {
    load();
  }, [page, search]);

  const viewReceipt = async (receipt: any) => {
    setViewingReceipt(receipt);
    setLoadingHTML(true);
    const res = await getReceiptHTML({ data: { receipt_id: receipt.id } });
    if (res.html) setReceiptHTML(res.html);
    else toast.error(res.error || "Failed to load receipt");
    setLoadingHTML(false);
  };

  const handleResend = async (receiptId: string) => {
    setResending(receiptId);
    const res = await resendReceipt({ data: { receipt_id: receiptId } });
    if (res.ok) toast.success("Receipt resent to customer");
    else toast.error(res.message);
    setResending(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Receipts</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{total} receipts</p>
        </div>
      </div>

      {/* Receipt detail / HTML viewer */}
      {viewingReceipt && (
        <Card className="bg-white dark:bg-[#1a1a1e]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Receipt {viewingReceipt.receipt_number}
              </h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleResend(viewingReceipt.id)}
                  disabled={resending === viewingReceipt.id}
                >
                  <RefreshCw
                    className={`h-4 w-4 mr-1 ${resending === viewingReceipt.id ? "animate-spin" : ""}`}
                  />
                  Resend Email
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setViewingReceipt(null);
                    setReceiptHTML(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {loadingHTML ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <RefreshCw className="h-6 w-6 animate-spin mr-2" /> Loading receipt...
              </div>
            ) : receiptHTML ? (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <iframe
                  srcDoc={receiptHTML}
                  className="w-full border-0"
                  style={{ height: "700px" }}
                  title={`Receipt ${viewingReceipt.receipt_number}`}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          aria-label="Search receipts..."
          placeholder="Search receipts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <Card className="bg-white dark:bg-[#0F0F12]">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    Receipt #
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">
                    Order
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    Customer
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    Total
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                    Date
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {receipts.map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition">
                    <td className="px-4 py-3">
                      <code className="font-mono text-xs font-bold text-brand">
                        {r.receipt_number}
                      </code>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-gray-500 text-xs font-mono">
                      {r.orders?.reference || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      <span className="block max-w-[200px] truncate" title={r.customer_email}>
                        {r.customer_email}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      {formatNaira(r.total)}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <Badge
                        className={
                          r.status === "emailed"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : r.status === "generated"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                              : "bg-red-100 text-red-800"
                        }
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-500 text-xs">
                      {new Date(r.created_at).toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => viewReceipt(r)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleResend(r.id)}
                          disabled={resending === r.id}
                        >
                          <Mail className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {receipts.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                      <Receipt className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">No receipts yet</p>
                      <p className="text-xs mt-1">
                        Receipts are generated automatically after successful payment
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Pagination page={page} totalItems={total} pageSize={10} onPageChange={setPage} />
    </div>
  );
}
