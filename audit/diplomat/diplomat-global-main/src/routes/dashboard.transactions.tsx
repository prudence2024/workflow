import { useRouteSearchInput } from "@/hooks/use-route-search-input";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Wallet,
  Search,
  CreditCard,
  Package,
  Receipt,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { adminGetTransactionDetail } from "@/lib/admin/server-fns";
import { Pagination } from "@/components/admin/pagination";
import {
  DetailDrawer,
  DetailDrawerSection,
  DetailField,
} from "@/components/dashboard/detail-drawer";

const searchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).catch(1),
  search: z.string().optional().default(""),
  detail: z.string().optional().default(""),
});

export const Route = createFileRoute("/dashboard/transactions")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Transactions — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  loaderDeps: ({ search }) => ({ page: search.page, search: search.search }),
  loader: async ({ deps }) => {
    try {
      const { adminListTransactions } = await import("@/lib/admin/server-fns");
      const res = await adminListTransactions({
        data: { search: deps.search || "", page: deps.page, pageSize: 10 },
      });
      if (res.error) throw new Error(res.error);
      return { transactions: res.transactions ?? [], total: res.total ?? 0 };
    } catch {
      throw new Error("Unable to load transactions. Please retry.");
    }
  },
  component: TransactionsPage,
});

const statusColors: Record<string, string> = {
  initiated: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
  pending: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  successful: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  abandoned: "bg-gray-100 text-gray-600 dark:bg-gray-800/60 dark:text-gray-400",
  refunded: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
};

/**
 * Financially truthful presentation: a transaction marked failed carries the
 * provider's gateway_response; when that evidence shows a provider-confirmed
 * decline of the attempt itself, the badge reads "Declined" (with the reason
 * preserved underneath). Transport/verification errors never reach this row.
 */
const PROVIDER_DECLINE_EVIDENCE =
  /declin|insufficient|do not honor|do_not_honor|not permitted|blocked|revoked|expired card|invalid card|withdrawn/i;

function displayTransactionStatus(tx: { status: string; gateway_response?: string | null }): {
  label: string;
  className: string;
} {
  if (
    tx.status === "failed" &&
    tx.gateway_response &&
    PROVIDER_DECLINE_EVIDENCE.test(tx.gateway_response)
  ) {
    return {
      label: "Declined",
      className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    };
  }
  const label = tx.status === "successful" ? "Paid" : tx.status;
  return { label, className: statusColors[tx.status] || "bg-gray-100 text-gray-600" };
}

const formatNaira = (n: number) => "₦" + n.toLocaleString("en-NG");

function TransactionsPage() {
  const { page, search: urlSearch, detail: urlDetail } = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard/transactions" });
  const router = useRouter();
  const match = Route.useMatch();

  // URL search params + the route loader are the single source of truth for
  // the transactions list; Refresh re-runs it via router.invalidate().
  const { transactions, total } = Route.useLoaderData();
  const listLoading = match.isFetching !== false;

  // Transient search input commits to the URL after a short debounce.
  const [searchInput, setSearchInput] = useRouteSearchInput(urlSearch);
  useEffect(() => {
    if (searchInput === urlSearch) return;
    const t = setTimeout(() => {
      navigate({ search: { page: 1, search: searchInput, detail: urlDetail }, replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, urlSearch, urlDetail, navigate]);

  // Detail drawer state
  const detailId = urlDetail;
  const [detailData, setDetailData] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailPermDenied, setDetailPermDenied] = useState(false);
  const [detailNotFound, setDetailNotFound] = useState(false);

  const fetchDetail = useServerFn(adminGetTransactionDetail);

  // Refresh = one authoritative re-read through the route loader.
  const refresh = useCallback(async () => {
    await router.invalidate({ sync: true });
  }, [router]);

  // Load detail
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
        const res = await fetchDetail({ data: { transaction_id: detailId } });
        if (cancelled) return;
        if (res?.transaction) {
          setDetailData(res.transaction);
        } else if (res?.error?.toLowerCase().includes("permission")) {
          setDetailPermDenied(true);
          setDetailError(res.error);
        } else if (res?.error?.toLowerCase().includes("not found")) {
          setDetailNotFound(true);
          setDetailError(res.error);
        } else {
          setDetailError(res?.error || "Failed to load");
        }
      } catch (err: any) {
        if (!cancelled) setDetailError(err?.message || "Failed to load transaction");
      }
      if (!cancelled) setDetailLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [detailId]);

  const openDetail = useCallback(
    (id: string) => {
      navigate({ search: { page, search: urlSearch, detail: id }, replace: true });
    },
    [page, urlSearch, navigate],
  );

  const closeDetail = useCallback(() => {
    navigate({ search: { page, search: urlSearch, detail: "" }, replace: true });
  }, [page, urlSearch, navigate]);

  const txn = detailData;
  const order = txn?.orders;
  // Name and Email are distinct fields; never infer a name from the email.
  const customerName = order?.customers
    ? `${order.customers.first_name || ""} ${order.customers.last_name || ""}`.trim() ||
      "Not provided"
    : "Not provided";

  return (
    <div className="space-y-6" aria-busy={listLoading}>
      {listLoading && <p role="status">Loading current transactions...</p>}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Transactions</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {total} payment transactions
          </p>
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
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by reference..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
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
                    Date
                  </th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {!listLoading &&
                  transactions.map((tx: any) => (
                    <tr
                      key={tx.id}
                      className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                      onClick={() => openDetail(tx.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openDetail(tx.id);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`View transaction ${tx.reference}`}
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900 dark:text-white font-mono">
                          {tx.reference}
                        </p>
                        {tx.paystack_reference && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            PS: {tx.paystack_reference}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {tx.orders?.reference || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {formatNaira(Number(tx.amount))}
                        </p>
                        <p className="text-xs text-gray-500">{tx.currency}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={displayTransactionStatus(tx).className}>
                          {displayTransactionStatus(tx).label}
                        </Badge>
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
                      <td className="px-4 py-3">
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </td>
                    </tr>
                  ))}
                {transactions.length === 0 && !listLoading && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-gray-500 dark:text-gray-400"
                    >
                      <Wallet className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">No transactions yet</p>
                      <p className="text-xs mt-1">
                        Paystack transactions will appear here after checkout
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
              navigate({ search: { page: p, search: urlSearch, detail: urlDetail }, replace: true })
            }
          />
        </CardContent>
      </Card>

      {/* Transaction Detail Drawer */}
      <DetailDrawer
        open={!!detailId}
        onClose={closeDetail}
        title={txn ? `Transaction` : "Transaction Detail"}
        subtitle={txn?.reference}
        badge={
          txn ? (
            <Badge className={displayTransactionStatus(txn).className}>
              {displayTransactionStatus(txn).label}
            </Badge>
          ) : undefined
        }
        loading={detailLoading}
        error={detailError}
        accessDenied={detailPermDenied}
        notFound={detailNotFound}
      >
        {txn && (
          <div className="space-y-5 p-5">
            <DetailDrawerSection title="Payment Details" icon={<CreditCard className="h-4 w-4" />}>
              <div className="space-y-2">
                <DetailField label="Amount">
                  <span className="text-lg font-bold text-brand">
                    {formatNaira(Number(txn.amount))}
                  </span>
                </DetailField>
                <DetailField label="Reference" mono>
                  {txn.reference}
                </DetailField>
                <DetailField label="Currency">{txn.currency || "Not recorded"}</DetailField>
                <DetailField label="Verification">Not recorded</DetailField>
                <DetailField label="Verified at">Not available</DetailField>
                {txn.paystack_reference && (
                  <DetailField label="Paystack Ref" mono>
                    {txn.paystack_reference}
                  </DetailField>
                )}
                <DetailField label="Channel">{txn.channel || "—"}</DetailField>
                {txn.paid_at && (
                  <DetailField label="Paid At">
                    {new Date(txn.paid_at).toLocaleString("en-NG")}
                  </DetailField>
                )}
                <DetailField label="Created">
                  {new Date(txn.created_at).toLocaleString("en-NG")}
                </DetailField>
                {txn.gateway_response && (
                  <DetailField label="Gateway Response">{txn.gateway_response}</DetailField>
                )}
              </div>
            </DetailDrawerSection>

            {order && (
              <DetailDrawerSection title="Linked Order" icon={<Package className="h-4 w-4" />}>
                <div className="space-y-2">
                  <DetailField label="Order">
                    <a
                      href={`/dashboard/orders/${order.id}`}
                      className="text-brand hover:underline font-mono"
                    >
                      {order.reference}
                    </a>
                  </DetailField>
                  <DetailField label="Customer">{customerName}</DetailField>
                  <DetailField label="Customer Email">
                    {order.customers?.email || order.email || "Not recorded"}
                  </DetailField>
                  <DetailField label="Total">
                    <span className="font-bold">{formatNaira(Number(order.total))}</span>
                  </DetailField>
                  <DetailField label="Items">
                    {order.order_items?.length || 0} product(s)
                  </DetailField>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800/50 pt-2">
                    {(order.order_items || []).map((item: any) => (
                      <div key={item.id} className="flex justify-between py-1.5 text-xs">
                        <span>
                          {item.name}{" "}
                          {item.sku && (
                            <span className="text-gray-400 font-mono">({item.sku})</span>
                          )}
                        </span>
                        <span>
                          ×{item.quantity} — {formatNaira(Number(item.line_total))}
                        </span>
                      </div>
                    ))}
                  </div>
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
                </div>
              </DetailDrawerSection>
            )}
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
