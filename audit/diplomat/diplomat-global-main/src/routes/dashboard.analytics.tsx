import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, ShoppingCart, Users, Package } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import { adminGetSalesAnalytics } from "@/lib/admin/server-fns";
import { describeLoadFailure, serverFnFailure } from "@/lib/admin/load-failure";

export const Route = createFileRoute("/dashboard/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  loader: async () => {
    const { adminGetDashboardStats, adminGetAnalyticsData, adminGetSalesAnalytics } =
      await import("@/lib/admin/server-fns");
    const [s, a, sales] = await Promise.allSettled([
      adminGetDashboardStats(),
      adminGetAnalyticsData(),
      adminGetSalesAnalytics({ data: { period: "month" } }),
    ]);
    // Capture the REAL reason a call failed (permission denial vs provider/DB
    // error) so the page can render a truthful state instead of an eternal
    // "Loading...". The loader is the only place these fetches happen.
    // A denied serverFn RETURNS its error rather than throwing, so a null
    // payload with a returned `error` is a failure — never "no data".
    const failureOf = (settled: PromiseSettledResult<unknown>, data: unknown) =>
      settled.status === "rejected"
        ? describeLoadFailure(settled.reason)
        : data
          ? null
          : (() => {
              const returned = serverFnFailure(settled.value);
              return returned ? describeLoadFailure(returned) : null;
            })();
    const statsData = s.status === "fulfilled" ? (s.value?.stats ?? null) : null;
    const analyticsData = a.status === "fulfilled" ? (a.value?.data ?? null) : null;
    const salesData = sales.status === "fulfilled" ? (sales.value?.data ?? null) : null;
    return {
      stats: statsData,
      analytics: analyticsData,
      sales: salesData,
      salesError: failureOf(sales, salesData),
      statsError: failureOf(s, statsData),
    };
  },
  component: AnalyticsPage,
});
const formatNaira = (n: number) => "₦" + n.toLocaleString("en-NG");

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "prev_month", label: "Previous Month" },
  { value: "ytd", label: "Year to Date" },
  { value: "prev_year", label: "Previous Year" },
  { value: "all", label: "All Time" },
] as const;

function AnalyticsPage() {
  const loaderData = Route.useLoaderData();
  const [stats, setStats] = useState<any>(loaderData.stats);
  const [analytics, setAnalytics] = useState<any>(loaderData.analytics);
  const [sales, setSales] = useState<any>(loaderData.sales);
  const [salesPeriod, setSalesPeriod] = useState<string>("month");
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState<string | null>(loaderData.salesError ?? null);

  const fetchSales = useServerFn(adminGetSalesAnalytics);

  const loadSales = async (period: string) => {
    setSalesPeriod(period);
    setSalesLoading(true);
    setSalesError(null);
    try {
      const res = await fetchSales({ data: { period: period as any } });
      if (res?.data) {
        setSales(res.data);
      } else {
        setSalesError(
          describeLoadFailure(
            serverFnFailure(res) ?? "Sales analytics returned no data for this period.",
          ),
        );
      }
    } catch (error) {
      setSalesError(describeLoadFailure(error));
    } finally {
      setSalesLoading(false);
    }
  };

  // NOTE: no client-side refetch of stats/analytics here on purpose. The
  // loader above is the single fetch point; a mount-time retry when values
  // were null both duplicated adminGetDashboardStats and hid the real
  // denial/error behind a permanently "Loading" card.
  const avgOrderValue = stats?.totalOrders > 0 ? stats.totalRevenue / stats.totalOrders : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analytics</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Reports and performance insights
        </p>
      </div>

      {loaderData.statsError && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
        >
          {loaderData.statsError} Summary figures below may show zero.
        </div>
      )}

      {/* ── Sales & Profit Analytics ──────────────────────────── */}
      <Card className="bg-white dark:bg-[#0F0F12]">
        <CardHeader className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-lg">Sales &amp; Profit</CardTitle>
            <div role="tablist" aria-label="Analytics period" className="flex flex-wrap gap-1.5">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  role="tab"
                  aria-selected={salesPeriod === p.value}
                  onClick={() => loadSales(p.value)}
                  className={`min-h-9 px-3 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                    salesPeriod === p.value
                      ? "bg-brand text-white"
                      : "bg-surface text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {sales ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {[
                {
                  label: "Gross Sales",
                  value: formatNaira(sales.grossSales || 0),
                  color: "text-green-600",
                },
                {
                  label: "Net Sales",
                  value: formatNaira(sales.netSales || 0),
                  color: "text-blue-600",
                },
                { label: "Paid Orders", value: String(sales.paidOrders || 0), color: "" },
                { label: "Units Sold", value: String(sales.unitsSold || 0), color: "" },
                {
                  label: "Avg Order Value",
                  value: formatNaira(sales.avgOrderValue || 0),
                  color: "",
                },
                { label: "Refunds", value: formatNaira(sales.refunds || 0), color: "text-red-500" },
                {
                  label: "COGS",
                  value: sales.cogsDataQuality?.costDataAvailable
                    ? formatNaira(sales.cogs || 0)
                    : "Not configured",
                  color: "text-orange-600",
                },
                {
                  label: "Gross Profit",
                  value: sales.cogsDataQuality?.costDataAvailable
                    ? formatNaira(sales.grossProfit || 0)
                    : "—",
                  color: (sales.grossProfit || 0) >= 0 ? "text-green-600" : "text-red-600",
                },
                {
                  label: "Gross Margin",
                  value: sales.cogsDataQuality?.costDataAvailable
                    ? `${(sales.grossMargin || 0).toFixed(1)}%`
                    : "—",
                  color: (sales.grossMargin || 0) >= 0 ? "text-green-600" : "text-red-600",
                },
                {
                  label: "Operating Expenses",
                  value: formatNaira(sales.totalExpenses || 0),
                  color: "text-orange-600",
                },
                {
                  label: "Net Profit",
                  value: formatNaira(sales.netProfit || 0),
                  color: (sales.netProfit || 0) >= 0 ? "text-green-600" : "text-red-600",
                },
                {
                  label: "COGS Data",
                  value: sales.cogsDataQuality?.hasCompleteData
                    ? "Complete"
                    : sales.cogsDataQuality?.costDataAvailable
                      ? `${sales.cogsDataQuality?.itemsWithoutCost || 0} unknown`
                      : "Cost data not configured",
                  color: sales.cogsDataQuality?.hasCompleteData
                    ? "text-green-600"
                    : "text-amber-600",
                },
              ].map((item) => (
                <div key={item.label} className="rounded-xl bg-surface p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {item.label}
                  </p>
                  <p className={`mt-1 text-sm font-semibold ${item.color}`}>{item.value}</p>
                </div>
              ))}
            </div>
          ) : salesError ? (
            <div role="alert" className="py-4 text-center">
              <p className="text-sm text-amber-600 dark:text-amber-400">{salesError}</p>
              {/* A permission denial is not retryable — retrying only re-fails. */}
              {!/does not include permission/i.test(salesError) && (
                <button
                  type="button"
                  onClick={() => loadSales(salesPeriod)}
                  className="mt-3 min-h-9 rounded-lg bg-surface px-4 text-xs font-medium text-foreground transition hover:bg-muted"
                >
                  Retry
                </button>
              )}
            </div>
          ) : salesLoading ? (
            <p role="status" className="text-sm text-muted-foreground py-4 text-center">
              Loading sales analytics...
            </p>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No sales data for this period.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            title: "Revenue",
            value: formatNaira(stats?.totalRevenue || 0),
            icon: DollarSign,
            color: "text-green-600",
          },
          {
            title: "Orders",
            value: String(stats?.totalOrders || 0),
            icon: ShoppingCart,
            color: "text-blue-600",
          },
          {
            title: "Customers",
            value: String(stats?.totalCustomers || 0),
            icon: Users,
            color: "text-purple-600",
          },
          {
            title: "Avg Order Value",
            value: formatNaira(avgOrderValue),
            icon: Package,
            color: "text-orange-600",
          },
        ].map((stat) => (
          <Card key={stat.title} className="bg-white dark:bg-[#0F0F12]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">{stat.title}</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                    {stat.value}
                  </p>
                </div>
                <stat.icon className={`h-8 w-8 ${stat.color} opacity-50`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-white dark:bg-[#0F0F12]">
          <CardHeader>
            <CardTitle className="text-sm text-gray-900 dark:text-white">Sales Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={analytics?.monthlySales || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip formatter={(v: number) => [`₦${v.toLocaleString()}`, ""]} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                  name="Revenue (₦)"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-[#0F0F12]">
          <CardHeader>
            <CardTitle className="text-sm text-gray-900 dark:text-white">
              Revenue by Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={analytics?.monthlySales || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip formatter={(v: number) => [`₦${v.toLocaleString()}`, "Revenue"]} />
                <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-white dark:bg-[#0F0F12]">
          <CardHeader>
            <CardTitle className="text-sm text-gray-900 dark:text-white">Order Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Pending", count: stats?.pendingOrders || 0, color: "bg-yellow-500" },
              { label: "Paid", count: stats?.paidOrders || 0, color: "bg-blue-500" },
              { label: "Processing", count: stats?.processingOrders || 0, color: "bg-purple-500" },
              { label: "Shipped", count: stats?.shippedOrders || 0, color: "bg-orange-500" },
              { label: "Delivered", count: stats?.deliveredOrders || 0, color: "bg-green-500" },
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${s.color}`} />
                  <span className="text-sm text-gray-600 dark:text-gray-400">{s.label}</span>
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{s.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-[#0F0F12]">
          <CardHeader>
            <CardTitle className="text-sm text-gray-900 dark:text-white">Content</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Products", count: stats?.activeProducts || 0 },
              { label: "Reviews", count: stats?.totalReviews || 0 },
              { label: "Messages", count: stats?.totalMessages || 0 },
              { label: "Subscribers", count: stats?.totalSubscribers || 0 },
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">{s.label}</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{s.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-[#0F0F12]">
          <CardHeader>
            <CardTitle className="text-sm text-gray-900 dark:text-white">Inventory</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Total Products", count: stats?.totalProducts || 0 },
              { label: "Active Products", count: stats?.activeProducts || 0 },
              { label: "Low Stock", count: stats?.lowStockCount || 0 },
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">{s.label}</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{s.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
