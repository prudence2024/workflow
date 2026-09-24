import { useRouteSearchInput } from "@/hooks/use-route-search-input";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Search,
  Edit,
  X,
  Upload,
  FileSpreadsheet,
  MailX,
  MailCheck,
  ChevronRight,
  ShoppingCart,
  Star,
  Phone as PhoneIcon,
  Mail as MailIcon,
  MapPin,
} from "lucide-react";
import {
  adminListCustomers,
  adminGetCustomerDetail,
  adminUpdateCustomer,
  adminUnsubscribeCustomer,
  adminResubscribeCustomer,
} from "@/lib/admin/server-fns";
import { Pagination } from "@/components/admin/pagination";
import { toast } from "sonner";
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

export const Route = createFileRoute("/dashboard/customers")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Customers — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  loaderDeps: ({ search }) => ({
    page: search.page,
    search: search.search,
  }),
  loader: async ({ deps }) => {
    try {
      const { adminListCustomers } = await import("@/lib/admin/server-fns");
      const res = await adminListCustomers({
        data: { search: deps.search || "", page: deps.page, pageSize: 10 },
      });
      if (res.error) throw new Error(res.error);
      return { customers: res.customers ?? [], total: res.total ?? 0 };
    } catch {
      throw new Error("Unable to load customers. Please retry.");
    }
  },
  component: CustomersPage,
});

const fmtN = (n: number) => "₦" + n.toLocaleString("en-NG");

function CustomersPage() {
  const { page, search: urlSearch, detail: urlDetail } = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard/customers" });
  const router = useRouter();
  const match = Route.useMatch();

  // URL search params + the route loader are the single source of truth for
  // the customers list; Refresh re-runs it via router.invalidate().
  const { customers, total } = Route.useLoaderData();
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

  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    state: "",
    lga: "",
    city: "",
    address: "",
  });

  // Detail drawer state
  const detailId = urlDetail;
  const [detailData, setDetailData] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailPermDenied, setDetailPermDenied] = useState(false);
  const [detailNotFound, setDetailNotFound] = useState(false);

  const fetchDetail = useServerFn(adminGetCustomerDetail);
  const updateCustomer = useServerFn(adminUpdateCustomer);
  const unsubscribeCustomer = useServerFn(adminUnsubscribeCustomer);
  const resubscribeCustomer = useServerFn(adminResubscribeCustomer);

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
        const res = await fetchDetail({ data: { customer_id: detailId } });
        if (cancelled) return;
        if (res?.customer) {
          setDetailData(res);
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
        if (!cancelled) setDetailError(err?.message || "Failed to load customer");
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

  const openEdit = (c: any) => {
    setEditingCustomer(c);
    setEditForm({
      first_name: c.first_name || "",
      last_name: c.last_name || "",
      phone: c.phone || "",
      state: c.state || "",
      lga: c.lga || "",
      city: c.city || "",
      address: c.address || "",
    });
  };

  const handleSave = async () => {
    if (!editingCustomer) return;
    const res = await updateCustomer({ data: { customer_id: editingCustomer.id, ...editForm } });
    if (res.ok) {
      toast.success("Customer updated");
      setEditingCustomer(null);
      await refresh();
    } else {
      toast.error(res.message);
    }
  };

  const formatLocation = (c: any) => {
    const parts = [c.city, c.lga, c.state].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "—";
  };

  return (
    <div className="space-y-6" aria-busy={listLoading}>
      {listLoading && <p role="status">Loading current customers...</p>}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Customers</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{total} customers</p>
        </div>
        <a
          href="/dashboard/email?tab=import"
          className="mt-3 sm:mt-0 inline-flex items-center gap-2 px-4 py-2.5 bg-[#0891b2] text-white rounded-lg text-sm font-medium hover:opacity-90 transition"
        >
          <FileSpreadsheet className="h-4 w-4" /> Import Contacts
        </a>
      </div>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          aria-label="Search by name or email..."
          placeholder="Search by name or email..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Edit Customer Modal */}
      {editingCustomer && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditingCustomer(null);
          }}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#0F0F12] p-6 shadow-xl ring-1 ring-gray-200 dark:ring-gray-800 max-h-[90vh] overflow-y-auto"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Edit Customer</h3>
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{editingCustomer.email}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  First Name
                </label>
                <Input
                  value={editForm.first_name}
                  onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                  placeholder="First name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Last Name
                </label>
                <Input
                  value={editForm.last_name}
                  onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                  placeholder="Last name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone
                </label>
                <PhoneInput
                  value={editForm.phone || ""}
                  onChange={(e164) => setEditForm({ ...editForm, phone: e164 })}
                  defaultCountry="NG"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  State
                </label>
                <Input
                  value={editForm.state}
                  onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                  placeholder="e.g. Lagos"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  LGA
                </label>
                <Input
                  value={editForm.lga}
                  onChange={(e) => setEditForm({ ...editForm, lga: e.target.value })}
                  placeholder="e.g. Ikeja"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  City
                </label>
                <Input
                  value={editForm.city}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                  placeholder="e.g. Lagos"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Address
                </label>
                <Input
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  placeholder="Street address"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white">
                Save Changes
              </Button>
              <Button variant="outline" onClick={() => setEditingCustomer(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      <Card className="bg-white dark:bg-[#0F0F12]">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Customer
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden sm:table-cell">
                    Phone
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">
                    Location
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Joined
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden lg:table-cell">
                    Marketing
                  </th>
                  <th className="px-4 py-3 lg:hidden w-6" aria-label="Marketing status" />
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {!listLoading &&
                  customers.map((c: any) => (
                    <tr
                      key={c.id}
                      className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                      onClick={() => openDetail(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openDetail(c.id);
                        }
                      }}
                    >
                      <td className="px-4 py-3 min-w-0">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-semibold text-xs">
                            {(c.first_name?.[0] || "") + (c.last_name?.[0] || "") || "U"}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {c.first_name || c.last_name
                                ? `${c.first_name || ""} ${c.last_name || ""}`.trim()
                                : "Unknown"}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {c.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {c.phone || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {formatLocation(c)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {new Date(c.created_at).toLocaleDateString("en-NG", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {c.marketing_consent ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-[10px]">
                            <MailCheck className="h-3 w-3 mr-1" /> Opted in
                          </Badge>
                        ) : (
                          <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 text-[10px]">
                            <MailX className="h-3 w-3 mr-1" /> Unsubscribed
                          </Badge>
                        )}
                      </td>
                      {/* Mobile: compact marketing dot */}
                      <td className="px-4 py-3 lg:hidden">
                        <span
                          title={
                            c.marketing_consent ? "Marketing: Opted in" : "Marketing: Unsubscribed"
                          }
                          className={`inline-block h-2.5 w-2.5 rounded-full ${c.marketing_consent ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {c.marketing_consent ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="hidden sm:inline-flex h-8 px-2 text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                              onClick={async () => {
                                const res = await unsubscribeCustomer({
                                  data: { customer_id: c.id },
                                });
                                if (res.ok) {
                                  toast.success(res.message);
                                  await refresh();
                                } else toast.error(res.message);
                              }}
                              title="Unsubscribe from marketing"
                            >
                              <MailX className="h-3.5 w-3.5 mr-1" /> Unsubscribe
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="hidden sm:inline-flex h-8 px-2 text-xs text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                              onClick={async () => {
                                const res = await resubscribeCustomer({
                                  data: { customer_id: c.id },
                                });
                                if (res.ok) {
                                  toast.success(res.message);
                                  await refresh();
                                } else toast.error(res.message);
                              }}
                              title="Resubscribe to marketing"
                            >
                              <MailCheck className="h-3.5 w-3.5 mr-1" /> Resubscribe
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => openEdit(c)}
                            title="Edit customer"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                {customers.length === 0 && !listLoading && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-gray-500 dark:text-gray-400"
                    >
                      <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">No customers yet</p>
                      <p className="text-xs mt-1">
                        Customers appear after their first purchase or newsletter signup
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

      {/* Customer Detail Drawer */}
      <DetailDrawer
        open={!!detailId}
        onClose={closeDetail}
        title={
          detailData?.customer
            ? `${detailData.customer.first_name || ""} ${detailData.customer.last_name || ""}`.trim() ||
              "Not provided"
            : "Customer Detail"
        }
        subtitle={detailData?.customer?.email}
        badge={
          detailData?.customer ? (
            <Badge
              className={
                detailData.customer.marketing_consent
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-600"
              }
            >
              {detailData.customer.marketing_consent ? "Subscribed" : "Unsubscribed"}
            </Badge>
          ) : undefined
        }
        actions={
          detailData?.customer ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                closeDetail();
                openEdit(detailData.customer);
              }}
            >
              <Edit className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          ) : undefined
        }
        loading={detailLoading}
        error={detailError}
        accessDenied={detailPermDenied}
        notFound={detailNotFound}
      >
        {detailData && (
          <div className="space-y-5 p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DetailDrawerSection title="Contact" icon={<MailIcon className="h-4 w-4" />}>
                <div className="space-y-2">
                  <DetailField label="Email">{detailData.customer.email}</DetailField>
                  {detailData.customer.phone && (
                    <DetailField label="Phone">{detailData.customer.phone}</DetailField>
                  )}
                  {detailData.customer.created_at && (
                    <DetailField label="Customer Since">
                      {new Date(detailData.customer.created_at).toLocaleDateString("en-NG")}
                    </DetailField>
                  )}
                </div>
              </DetailDrawerSection>
              <DetailDrawerSection title="Location" icon={<MapPin className="h-4 w-4" />}>
                <div className="space-y-1 text-sm">
                  {detailData.customer.state && <p>{detailData.customer.state}</p>}
                  {detailData.customer.lga && <p>{detailData.customer.lga}</p>}
                  {detailData.customer.city && <p>{detailData.customer.city}</p>}
                  {detailData.customer.address && <p>{detailData.customer.address}</p>}
                  {!detailData.customer.state &&
                    !detailData.customer.lga &&
                    !detailData.customer.address && (
                      <p className="text-gray-400">No address on file</p>
                    )}
                </div>
              </DetailDrawerSection>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-900/30">
                <p className="text-xl font-bold text-brand">{detailData.totalOrders}</p>
                <p className="text-xs text-gray-500">Orders</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-900/30">
                <p className="text-xl font-bold text-brand">{fmtN(detailData.totalSpend)}</p>
                <p className="text-xs text-gray-500">Total Spend</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-900/30">
                <p className="text-xl font-bold text-brand">{detailData.reviews.length}</p>
                <p className="text-xs text-gray-500">Reviews</p>
              </div>
            </div>

            {/* Order History */}
            <DetailDrawerSection title="Order History" icon={<ShoppingCart className="h-4 w-4" />}>
              <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
                {(detailData.orders || []).slice(0, 10).map((o: any) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <a
                        href={`/dashboard/orders/${o.id}`}
                        className="text-sm font-medium text-brand hover:underline"
                      >
                        {o.reference}
                      </a>
                      <p className="text-xs text-gray-500">
                        {o.order_items?.length || 0} items ·{" "}
                        {new Date(o.created_at).toLocaleDateString("en-NG")}
                      </p>
                    </div>
                    <div className="text-right ml-3">
                      <p className="text-sm font-medium">{fmtN(Number(o.total))}</p>
                      <Badge
                        className={`text-xs ${o.status === "paid" ? "bg-green-100 text-green-800" : o.status === "pending" ? "bg-orange-100 text-orange-800" : "bg-gray-100 text-gray-600"}`}
                      >
                        {o.status}
                      </Badge>
                    </div>
                  </div>
                ))}
                {(!detailData.orders || detailData.orders.length === 0) && (
                  <p className="text-sm text-gray-400 py-3">No orders yet</p>
                )}
              </div>
            </DetailDrawerSection>

            {/* Reviews */}
            {detailData.reviews.length > 0 && (
              <DetailDrawerSection title="Reviews" icon={<Star className="h-4 w-4" />}>
                <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
                  {detailData.reviews.map((r: any) => (
                    <div key={r.id} className="py-2 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{r.products?.name || "Product"}</span>
                        <span className="text-yellow-500">{"★".repeat(r.rating || 0)}</span>
                      </div>
                      {r.comment && (
                        <p className="text-xs text-gray-500 mt-1">{r.comment.slice(0, 150)}</p>
                      )}
                    </div>
                  ))}
                </div>
              </DetailDrawerSection>
            )}
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
