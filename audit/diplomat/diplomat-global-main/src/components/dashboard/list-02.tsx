"use client";

import { cn } from "@/lib/utils";
import { ArrowDownLeft, ShoppingCart, CreditCard, ArrowRight } from "lucide-react";
import { useDashboardData } from "@/components/dashboard/dashboard-data-provider";

const formatNaira = (n: number) => "₦" + n.toLocaleString("en-NG");

export default function List02({ className }: { className?: string }) {
  const { stats } = useDashboardData();
  const orders = stats?.recentOrders || [];

  return (
    <div
      className={cn(
        "w-full max-w-full mx-auto bg-white dark:bg-zinc-900/70 border border-zinc-100 dark:border-zinc-800 rounded-lg sm:rounded-xl shadow-sm backdrop-blur-xl",
        className,
      )}
    >
      <div className="p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-1">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Recent Orders{" "}
            <span className="text-xs font-normal text-zinc-600 dark:text-zinc-400 ml-1">
              ({orders.length})
            </span>
          </h2>
          <a
            href="/dashboard/orders"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            View all
          </a>
        </div>
        <div className="space-y-1">
          {orders.map((order: any) => {
            const name = order.customers
              ? `${order.customers.first_name || ""} ${order.customers.last_name || ""}`.trim() ||
                "Not provided"
              : "Not provided";
            const isPaid = ["paid", "processing", "shipped", "delivered"].includes(order.status);
            const timeAgo = (() => {
              const diff = Date.now() - new Date(order.created_at).getTime();
              const mins = Math.floor(diff / 60000);
              if (mins < 60) return `${mins}m ago`;
              const hrs = Math.floor(mins / 60);
              if (hrs < 24) return `${hrs}h ago`;
              return `${Math.floor(hrs / 24)}d ago`;
            })();

            return (
              <div
                key={order.id}
                className="group flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-all duration-200"
              >
                <div className="p-2 rounded-lg flex-shrink-0 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                  <ShoppingCart className="w-4 h-4 text-zinc-900 dark:text-zinc-100" />
                </div>
                <div className="flex-1 flex items-center justify-between min-w-0">
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <h3 className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {name}
                    </h3>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 truncate">
                      {order.reference} · {timeAgo}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 pl-3 flex-shrink-0">
                    <span
                      className={cn(
                        "text-xs font-medium",
                        isPaid
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-orange-600 dark:text-orange-400",
                      )}
                    >
                      {formatNaira(Number(order.total))}
                    </span>
                    <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                </div>
              </div>
            );
          })}
          {orders.length === 0 && (
            <div className="text-center py-4 text-xs text-gray-400">No orders yet</div>
          )}
        </div>
      </div>
      <div className="p-2 border-t border-zinc-100 dark:border-zinc-800">
        <a
          href="/dashboard/transactions"
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium bg-gradient-to-r from-zinc-900 to-zinc-800 dark:from-zinc-50 dark:to-zinc-200 text-zinc-50 dark:text-zinc-900 hover:from-zinc-800 hover:to-zinc-700 dark:hover:from-zinc-200 dark:hover:to-zinc-300 shadow-sm hover:shadow transform transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
        >
          <span>View All Transactions</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
