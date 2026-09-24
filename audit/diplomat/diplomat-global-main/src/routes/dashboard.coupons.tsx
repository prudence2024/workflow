import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus,
  Search,
  Tag,
  Trash2,
  Copy,
  Check,
  Clock,
  Percent,
  RefreshCw,
  Edit,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatCouponExpiry,
  getCouponState,
  isCouponExhausted,
  type CouponRow,
} from "@/lib/coupon-lifecycle";
import {
  adminListCoupons,
  adminCreateCoupon,
  adminDeleteCoupon,
  adminUpdateCoupon,
  adminGenerateCouponCode,
} from "@/lib/admin/server-fns";
import { Pagination } from "@/components/admin/pagination";
import { CustomSelect } from "@/components/ui/custom-select";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/coupons")({
  head: () => ({
    meta: [
      { title: "Coupons — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: CouponsPage,
});

const formatNaira = (n: number) => "₦" + n.toLocaleString("en-NG");

function getCouponStatus(coupon: CouponRow): { label: string; color: string } {
  switch (getCouponState(coupon)) {
    case "disabled":
      return {
        label: "Disabled",
        color: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
      };
    case "expired":
      return {
        label: "Expired",
        color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      };
    case "scheduled":
      return {
        label: "Scheduled",
        color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
      };
    case "exhausted":
      return {
        label: "Limit Reached",
        color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
      };
    default:
      return {
        label: "Active",
        color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      };
  }
}

function CouponsPage() {
  const today = new Date().toISOString().split("T")[0];
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [mutationPending, setMutationPending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [editingCoupon, setEditingCoupon] = useState<CouponRow | null>(null);
  const [form, setForm] = useState({
    code: "",
    discount_type: "percentage" as "percentage" | "fixed",
    discount_value: "",
    max_uses: "1",
    starts_at: "",
    expires_at: "",
  });

  const fetchCoupons = useServerFn(adminListCoupons);
  const createCoupon = useServerFn(adminCreateCoupon);
  const deleteCoupon = useServerFn(adminDeleteCoupon);
  const updateCoupon = useServerFn(adminUpdateCoupon);
  const generateCode = useServerFn(adminGenerateCouponCode);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetchCoupons({ data: { search, page, pageSize: 10 } });
      if ("error" in res && res.error) throw new Error(res.error);
      setCoupons((res.coupons || []) as CouponRow[]);
      setTotal(res.total || 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Coupons could not be loaded.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [fetchCoupons, page, search]);

  useEffect(() => {
    setPage(1);
  }, [search]);
  useEffect(() => {
    void load();
  }, [load]);

  const handleGenerateCode = async () => {
    setGenerating(true);
    try {
      const res = await generateCode();
      if (res?.code) setForm((f) => ({ ...f, code: res.code }));
      else toast.error("Failed to generate code");
    } catch {
      toast.error("Failed to generate code");
    }
    setGenerating(false);
  };

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSubmit = async () => {
    if (mutationPending) return;
    if (!form.code?.trim()) {
      toast.error("Coupon code is required");
      return;
    }
    const val = Number(form.discount_value);
    if (!val || val <= 0) {
      toast.error("Discount value must be a positive number");
      return;
    }
    if (form.discount_type === "percentage" && val > 100) {
      toast.error("Percentage discount cannot exceed 100%");
      return;
    }
    setMutationPending(true);
    try {
      const res = await createCoupon({
        data: {
          code: form.code.toUpperCase().trim(),
          discount_type: form.discount_type,
          discount_value: val,
          max_uses: Number(form.max_uses) || 1,
          starts_at: form.starts_at || undefined,
          expires_at: form.expires_at || undefined,
        },
      });
      if (res?.ok) {
        setCoupons((current) => [res.coupon as CouponRow, ...current]);
        toast.success("Coupon created");
        setForm({
          code: "",
          discount_type: "percentage",
          discount_value: "",
          max_uses: "1",
          starts_at: "",
          expires_at: "",
        });
        setShowCreate(false);
        await load();
      } else toast.error(res?.message || "Failed to create coupon");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to create coupon. Please check all fields.",
      );
    } finally {
      setMutationPending(false);
    }
  };

  const handleEdit = async () => {
    if (!editingCoupon || mutationPending) return;
    const val = Number(form.discount_value);
    if (!val || val <= 0) {
      toast.error("Discount value must be a positive number");
      return;
    }
    if (form.discount_type === "percentage" && val > 100) {
      toast.error("Percentage cannot exceed 100%");
      return;
    }
    setMutationPending(true);
    try {
      const res = await updateCoupon({
        data: {
          coupon_id: editingCoupon.id,
          code: form.code.toUpperCase().trim(),
          discount_type: form.discount_type,
          discount_value: val,
          max_uses: Number(form.max_uses) || 1,
          starts_at: form.starts_at || undefined,
          expires_at: form.expires_at || undefined,
        },
      });
      if (res?.ok) {
        setCoupons((current) =>
          current.map((coupon) =>
            coupon.id === editingCoupon.id ? (res.coupon as CouponRow) : coupon,
          ),
        );
        toast.success("Coupon updated");
        setEditingCoupon(null);
        setForm({
          code: "",
          discount_type: "percentage",
          discount_value: "",
          max_uses: "1",
          starts_at: "",
          expires_at: "",
        });
        await load();
      } else toast.error(res?.message || "Failed to update coupon");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update coupon");
    } finally {
      setMutationPending(false);
    }
  };

  const openEdit = (coupon: CouponRow) => {
    setEditingCoupon(coupon);
    setForm({
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: String(coupon.discount_value),
      max_uses: String(coupon.max_uses || 1),
      starts_at: coupon.starts_at ? coupon.starts_at.split("T")[0] : "",
      expires_at: coupon.expires_at ? coupon.expires_at.split("T")[0] : "",
    });
  };

  const handleDelete = async (id: string, code: string) => {
    if (!confirm(`Delete coupon "${code}"?`)) return;
    if (mutationPending) return;
    setMutationPending(true);
    try {
      const res = await deleteCoupon({ data: { coupon_id: id } });
      if (res.ok) {
        setCoupons((current) => current.filter((coupon) => coupon.id !== id));
        toast.success("Coupon deleted");
        await load();
      } else toast.error(res.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete coupon");
    } finally {
      setMutationPending(false);
    }
  };

  const handleToggleActive = async (coupon: CouponRow) => {
    if (mutationPending) return;
    setMutationPending(true);
    try {
      const res = await updateCoupon({ data: { coupon_id: coupon.id, active: !coupon.active } });
      if (res.ok) {
        setCoupons((current) =>
          current.map((row) => (row.id === coupon.id ? (res.coupon as CouponRow) : row)),
        );
        toast.success(coupon.active ? "Coupon disabled" : "Coupon enabled");
        await load();
      } else toast.error(res.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to change coupon status");
    } finally {
      setMutationPending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Coupons</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{total} coupons</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setForm({
              code: "",
              discount_type: "percentage",
              discount_value: "",
              max_uses: "1",
              starts_at: "",
              expires_at: "",
            });
            setShowCreate(true);
            handleGenerateCode();
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0891b2] text-white rounded-lg text-sm font-medium hover:opacity-90 transition"
        >
          <Plus className="h-4 w-4" /> Create Coupon
        </button>
      </div>

      {(showCreate || editingCoupon) && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1e] p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {editingCoupon ? "Edit Coupon" : "Create New Coupon"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
              Coupon Code
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="Auto-generated"
                  className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
                <button
                  type="button"
                  onClick={handleGenerateCode}
                  disabled={generating}
                  className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-50"
                  title="Generate new code"
                >
                  <RefreshCw className={cn("h-4 w-4", generating && "animate-spin")} />
                </button>
              </div>
            </label>
            <CustomSelect
              label="Discount Type"
              value={form.discount_type}
              onChange={(v) => setForm({ ...form, discount_type: v as "percentage" | "fixed" })}
              options={[
                { value: "percentage", label: "Percentage (%)" },
                { value: "fixed", label: "Fixed Amount (₦)" },
              ]}
            />
            <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
              {form.discount_type === "percentage" ? "Discount %" : "Discount Amount (₦)"}
              <input
                type="number"
                value={form.discount_value}
                onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                placeholder="e.g. 10"
                min="1"
                className="appearance-none px-3 py-2.5 pr-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
              Max Uses
              <input
                type="number"
                value={form.max_uses}
                onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                placeholder="1"
                min="1"
                className="min-w-0 w-full appearance-none px-3 py-2.5 pr-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
              Starts Date
              <input
                type="date"
                min={today}
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                className="min-w-0 w-full appearance-none px-3 py-2.5 pr-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
              Expiry Date
              <input
                type="date"
                min={today}
                value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                className="min-w-0 w-full appearance-none px-3 py-2.5 pr-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={editingCoupon ? handleEdit : handleSubmit}
              disabled={mutationPending}
              className="px-4 py-2 bg-[#0891b2] text-white rounded-lg text-sm font-medium hover:opacity-90 transition"
            >
              {editingCoupon ? "Save Changes" : "Create Coupon"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setEditingCoupon(null);
              }}
              className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search coupons..."
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>

      {loadError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
        >
          <span>{loadError}</span>
          <button type="button" className="font-semibold underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[52rem] w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                <th className="min-w-36 text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                  Code
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                  Discount
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                  Usage
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                  Expires
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                  Status
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {coupons.map((coupon) => {
                const status = getCouponStatus(coupon);
                const exhausted = isCouponExhausted(coupon);
                return (
                  <tr
                    key={coupon.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition"
                  >
                    <td className="min-w-36 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="px-2 py-1 rounded bg-brand/10 text-brand font-mono text-xs font-bold">
                          {coupon.code}
                        </code>
                        <button
                          type="button"
                          onClick={() => copyCode(coupon.code, coupon.id)}
                          className="text-gray-400 hover:text-brand transition"
                        >
                          {copiedId === coupon.id ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      <span className="flex items-center gap-1">
                        {coupon.discount_type === "percentage" ? (
                          <>
                            <Percent className="h-3.5 w-3.5 text-brand" />
                            {coupon.discount_value}%
                          </>
                        ) : (
                          <>{formatNaira(coupon.discount_value)}</>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {coupon.uses ?? 0} / {coupon.max_uses ?? "∞"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "flex items-center gap-1 text-xs",
                          status.label === "Expired"
                            ? "text-red-500"
                            : "text-gray-600 dark:text-gray-400",
                        )}
                      >
                        <Clock className="h-3 w-3 shrink-0" />
                        <time
                          dateTime={coupon.expires_at || undefined}
                          className="whitespace-nowrap tabular-nums"
                        >
                          {formatCouponExpiry(coupon.expires_at)}
                        </time>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <span
                          data-coupon-enabled={coupon.active}
                          className={cn(
                            "whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium",
                            coupon.active
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
                          )}
                        >
                          {coupon.active ? "Enabled" : "Disabled"}
                        </span>
                        {exhausted && (
                          <span className="whitespace-nowrap rounded-full bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                            Exhausted
                          </span>
                        )}
                        {!exhausted && status.label !== "Active" && status.label !== "Disabled" && (
                          <span
                            className={cn(
                              "whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium",
                              status.color,
                            )}
                          >
                            {status.label}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(coupon)}
                          disabled={mutationPending}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(coupon)}
                          disabled={mutationPending}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 transition"
                          title={coupon.active ? "Disable" : "Enable"}
                        >
                          {coupon.active ? "⏸" : "▶"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(coupon.id, coupon.code)}
                          disabled={mutationPending}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {coupons.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    <Tag className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p>No coupons found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <Pagination page={page} totalItems={total} pageSize={10} onPageChange={setPage} />
    </div>
  );
}
