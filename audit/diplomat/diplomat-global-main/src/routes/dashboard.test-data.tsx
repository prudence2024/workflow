import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Trash2, ShieldCheck, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { ownerTestdataPurge, adminGetMyRole } from "@/lib/admin/server-fns";

export const Route = createFileRoute("/dashboard/test-data")({
  head: () => ({
    meta: [
      { title: "Test Data Cleanup — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Test_DataPage,
});

const CONFIRMATION_PHRASE = "PURGE TEST DATA";

type PurgeResult = {
  ok: boolean;
  mode?: "preview" | "execute";
  message?: string;
  samples?: {
    reference: string;
    status: string;
    total: number;
    email: string;
    created_at: string;
  }[];
  counts?: {
    orders: number;
    order_items: number;
    receipts: number;
    payment_transactions: number;
    review_claims: number;
    customers: number;
  };
  blocked?: { reference: string; reason: string }[];
  deletable_orders?: number;
  audit_recorded?: boolean;
};

function Test_DataPage() {
  const navigate = useNavigate();
  const purge = useServerFn(ownerTestdataPurge);
  const getRole = useServerFn(adminGetMyRole);

  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [createdBefore, setCreatedBefore] = useState("");
  const [createdAfter, setCreatedAfter] = useState("");
  const [orderReference, setOrderReference] = useState("");
  const [email, setEmail] = useState("");
  const [includeCustomers, setIncludeCustomers] = useState(false);
  const [result, setResult] = useState<PurgeResult | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [secondConfirm, setSecondConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getRole()
      .then((r) => setIsOwner(r.role === "owner"))
      .catch(() => setIsOwner(false));
  }, [getRole]);

  const hasFilter = Boolean(createdBefore || createdAfter || orderReference || email);

  const runPurge = async (mode: "preview" | "execute") => {
    if (!hasFilter) {
      toast.error("Set at least one explicit filter first.");
      return;
    }
    if (mode === "execute" && confirmText !== CONFIRMATION_PHRASE) {
      toast.error(`Type exactly: ${CONFIRMATION_PHRASE}`);
      return;
    }
    if (mode === "execute" && !secondConfirm) {
      toast.error("Tick the second confirmation checkbox first.");
      return;
    }
    setBusy(true);
    try {
      const res = (await purge({
        data: {
          mode,
          confirmation: mode === "execute" ? confirmText : undefined,
          created_before: createdBefore || undefined,
          created_after: createdAfter || undefined,
          order_reference: orderReference || undefined,
          email: email || undefined,
          include_customers: includeCustomers,
        },
      })) as PurgeResult;
      setResult(res);
      if (res.ok && res.mode === "preview") {
        toast.success(
          `Preview: ${res.counts?.orders ?? 0} order(s) selected, ${res.deletable_orders ?? 0} deletable.`,
        );
      } else if (res.ok && res.mode === "execute") {
        toast.success("Purge executed. Audit evidence recorded.");
        setConfirmText("");
        setSecondConfirm(false);
        setResult(null);
      } else {
        toast.error(res.message || "Purge failed.");
      }
    } catch {
      toast.error("Purge request failed.");
    } finally {
      setBusy(false);
    }
  };

  if (isOwner === null) {
    return (
      <div className="flex items-center justify-center py-16" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Test Data Cleanup</h1>
        <Card className="bg-white dark:bg-[#1a1a1e]">
          <CardContent className="p-8 flex flex-col items-center text-center gap-3">
            <div className="p-3 rounded-xl bg-red-100 dark:bg-red-900/30">
              <Lock className="h-6 w-6 text-red-600 dark:text-red-400" aria-hidden="true" />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
              This tool permanently deletes order data and is restricted to the Owner role. Ask the
              store Owner if you believe you need access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Test Data Cleanup</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Owner-only, dry-run by default. Catalog (products, categories, pages, blog, settings) is
          never touched. Provider systems (Paystack, Resend) are external and unaffected.
        </p>
      </div>

      <Alert className="border-amber-300 dark:border-amber-700">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <AlertTitle className="text-amber-800 dark:text-amber-300">
          Destructive and permanent
        </AlertTitle>
        <AlertDescription className="text-amber-800/90 dark:text-amber-300/90">
          Deleted orders, items, receipts, payment transactions and review claims cannot be
          recovered from this app. Orders with financial-completion ledger rows are protected and
          reported, never deleted.
        </AlertDescription>
      </Alert>

      {/* 1. Explicit filters */}
      <Card className="bg-white dark:bg-[#1a1a1e]">
        <CardContent className="p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            1. Select records explicitly
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nothing is ever inferred as “test”. Combine filters as needed — at least one is
            required.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="td-after">Created on/after (optional)</Label>
              <Input
                id="td-after"
                type="date"
                value={createdAfter}
                onChange={(e) => setCreatedAfter(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="td-before">Created before (optional)</Label>
              <Input
                id="td-before"
                type="date"
                value={createdBefore}
                onChange={(e) => setCreatedBefore(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="td-ref">Exact order reference (optional)</Label>
              <Input
                id="td-ref"
                placeholder="DG-XXXXXXXX-XXXX"
                value={orderReference}
                onChange={(e) => setOrderReference(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="td-email">Exact customer email (optional)</Label>
              <Input
                id="td-email"
                type="email"
                placeholder="test@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              className="h-4 w-4 accent-red-600"
              checked={includeCustomers}
              onChange={(e) => setIncludeCustomers(e.target.checked)}
            />
            Also remove customer records whose ONLY orders are being purged
          </label>
          <Button onClick={() => runPurge("preview")} disabled={busy || !hasFilter}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            )}
            Run dry-run preview
          </Button>
        </CardContent>
      </Card>

      {/* 2. Preview */}
      {result?.mode === "preview" && result.ok && (
        <Card className="bg-white dark:bg-[#1a1a1e]">
          <CardContent className="p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              2. Preview (nothing deleted yet)
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              {[
                ["Orders selected", result.counts?.orders ?? 0],
                ["Deletable orders", result.deletable_orders ?? 0],
                ["Order items", result.counts?.order_items ?? 0],
                ["Receipts", result.counts?.receipts ?? 0],
                ["Payment transactions", result.counts?.payment_transactions ?? 0],
                ["Review claims", result.counts?.review_claims ?? 0],
                ["Customers removable", result.counts?.customers ?? 0],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-lg border border-gray-200 dark:border-gray-800 p-3"
                >
                  <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
                  <div className="text-xl font-bold text-gray-900 dark:text-white">{value}</div>
                </div>
              ))}
            </div>

            {(result.blocked?.length ?? 0) > 0 && (
              <div className="rounded-lg border border-amber-300 dark:border-amber-700 p-3 text-sm">
                <div className="font-semibold text-amber-800 dark:text-amber-300 mb-1">
                  Protected — will NOT be deleted ({result.blocked?.length})
                </div>
                <ul className="list-disc pl-5 text-amber-800/90 dark:text-amber-300/90 space-y-0.5">
                  {result.blocked?.map((b) => (
                    <li key={b.reference}>
                      <span className="font-mono">{b.reference}</span> — {b.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(result.samples?.length ?? 0) > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
                      <th className="py-2 pr-3">Reference</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Total</th>
                      <th className="py-2 pr-3">Email</th>
                      <th className="py-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.samples?.map((s) => (
                      <tr
                        key={s.reference}
                        className="border-b border-gray-100 dark:border-gray-800/50"
                      >
                        <td className="py-2 pr-3 font-mono text-xs">{s.reference}</td>
                        <td className="py-2 pr-3">{s.status}</td>
                        <td className="py-2 pr-3">₦{Number(s.total).toLocaleString()}</td>
                        <td className="py-2 pr-3 break-all">{s.email}</td>
                        <td className="py-2 whitespace-nowrap">
                          {new Date(s.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(result.counts?.orders ?? 0) > (result.samples?.length ?? 0) && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Showing first {result.samples?.length} of {result.counts?.orders}.
                  </p>
                )}
              </div>
            )}

            {result.deletable_orders === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Nothing deletable matched — protected/none found. Adjust filters and re-run the
                preview.
              </p>
            ) : (
              <div className="space-y-3 border-t border-gray-200 dark:border-gray-800 pt-4">
                <h3 className="font-semibold text-red-700 dark:text-red-400">
                  3. Confirm permanent deletion
                </h3>
                <div className="space-y-1.5">
                  <Label htmlFor="td-confirm">
                    Type <span className="font-mono font-bold">{CONFIRMATION_PHRASE}</span> to
                    enable
                  </Label>
                  <Input
                    id="td-confirm"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    autoComplete="off"
                    className="max-w-xs"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-red-600"
                    checked={secondConfirm}
                    onChange={(e) => setSecondConfirm(e.target.checked)}
                  />
                  I understand this permanently deletes the {result.deletable_orders} order(s) shown
                  above and cannot be undone
                </label>
                <Button
                  variant="destructive"
                  onClick={() => runPurge("execute")}
                  disabled={busy || confirmText !== CONFIRMATION_PHRASE || !secondConfirm}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  Purge {result.deletable_orders} order(s) permanently
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {result && !result.ok && (
        <Card className="bg-white dark:bg-[#1a1a1e] border-red-300 dark:border-red-800">
          <CardContent className="p-6 flex items-start gap-3">
            <AlertTriangle
              className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5"
              aria-hidden="true"
            />
            <div className="text-sm text-red-700 dark:text-red-400">{result.message}</div>
          </CardContent>
        </Card>
      )}

      <div className="text-xs text-gray-400 dark:text-gray-600 flex items-center gap-1.5">
        <Badge variant="outline" className="font-normal">
          Owner only
        </Badge>
        Every execution writes a permanent audit_logs entry attributed to your account.
      </div>
      <button type="button" className="sr-only" onClick={() => void navigate({ to: "/dashboard" })}>
        Back to dashboard
      </button>
    </div>
  );
}

export default Test_DataPage;
