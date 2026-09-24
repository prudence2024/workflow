import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { DashboardDataProvider } from "@/components/dashboard/dashboard-data-provider";
import OverviewStats from "@/components/dashboard/overview-stats";
import { SalesChart, RevenueChart } from "@/components/dashboard/sales-chart";
import RecentOrders from "@/components/dashboard/recent-orders";
import TopProducts from "@/components/dashboard/top-products";
import CustomerAnalytics from "@/components/dashboard/customer-analytics";
import ActivityFeed from "@/components/dashboard/activity-feed";
import FinancialWidgets from "@/components/dashboard/financial-widgets";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  loader: async () => {
    try {
      const {
        adminGetDashboardStats,
        adminGetAnalyticsData,
        adminGetDashboardFinancialSummary,
      } = await import("@/lib/admin/server-fns");
      const [statsRes, analyticsRes, financialRes] = await Promise.allSettled([
        adminGetDashboardStats(),
        adminGetAnalyticsData(),
        adminGetDashboardFinancialSummary(),
      ]);
      return {
        stats: statsRes.status === "fulfilled" ? (statsRes.value?.stats ?? null) : null,
        analytics: analyticsRes.status === "fulfilled" ? (analyticsRes.value?.data ?? null) : null,
        financial:
          financialRes.status === "fulfilled" ? (financialRes.value?.summary ?? null) : null,
      };
    } catch {
      return { stats: null, analytics: null, financial: null };
    }
  },
  component: DashboardIndex,
});

function has(permissions: string[], key: string): boolean {
  return permissions.includes("*") || permissions.includes(key);
}

function DashboardIndex() {
  const { permissions = [] } = useRouteContext({ from: "/dashboard" }) as any;
  const { stats: loaderStats, analytics: loaderAnalytics, financial: loaderFinancial } =
    Route.useLoaderData();
  return (
    <DashboardDataProvider initialStats={loaderStats} initialAnalytics={loaderAnalytics}>
      <div className="space-y-4 sm:space-y-6 w-full min-w-0">
        {/* Overview Stats */}
        {has(permissions, "analytics.view") && (
          <OverviewStats initialFinancial={loaderFinancial} />
        )}

        {/* Charts Row - Stack on mobile, side by side on desktop */}
        {(has(permissions, "analytics.view") || has(permissions, "products.view")) && (
          <div className="grid gap-4 sm:gap-6 grid-cols-1 xl:grid-cols-2">
            {has(permissions, "analytics.view") && (
              <div className="w-full min-w-0">
                <SalesChart />
              </div>
            )}
            {has(permissions, "analytics.view") && (
              <div className="w-full min-w-0">
                <RevenueChart />
              </div>
            )}
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-3 overflow-hidden">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6 w-full min-w-0 overflow-hidden">
            {has(permissions, "orders.view") && <RecentOrders />}
            {has(permissions, "products.view") && <TopProducts />}
          </div>

          {/* Right Column */}
          <div className="space-y-4 sm:space-y-6 w-full min-w-0 overflow-hidden">
            {has(permissions, "customers.view") && <CustomerAnalytics />}
            <ActivityFeed />
          </div>
        </div>

        {/* Financial Overview Section */}
        <div className="mt-6 sm:mt-8">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6 px-1">
            Financial Overview
          </h2>
          <FinancialWidgets />
        </div>
      </div>
    </DashboardDataProvider>
  );
}
