"use client";

import { cn } from "@/lib/utils";
import { Wallet, TrendingUp, ShoppingCart, CreditCard } from "lucide-react";
import { useDashboardData } from "@/components/dashboard/dashboard-data-provider";

const formatNaira = (n: number) => "₦" + n.toLocaleString("en-NG");

export default function FinancialWidgets({ className }: { className?: string }) {
  const { stats } = useDashboardData();

  const accounts = [
    {
      id: "1",
      title: "Total Revenue",
      description: "From paid orders",
      balance: formatNaira(stats?.totalRevenue || 0),
      type: "savings" as const,
    },
    {
      id: "2",
      title: "Pending Payments",
      description: "Awaiting confirmation",
      balance: String(stats?.pendingOrders || 0) + " orders",
      type: "checking" as const,
    },
    {
      id: "3",
      title: "Delivered Orders",
      description: "Completed",
      balance: String(stats?.deliveredOrders || 0) + " orders",
      type: "investment" as const,
    },
    {
      id: "4",
      title: "Refunded",
      description: "Total refunds",
      balance: "₦0",
      type: "debt" as const,
    },
  ];

  return (
    <div
      className={cn(
        "w-full max-w-full mx-auto bg-white dark:bg-zinc-900/70 border border-zinc-100 dark:border-zinc-800 rounded-lg sm:rounded-xl shadow-sm backdrop-blur-xl",
        className,
      )}
    >
      <div className="p-3 sm:p-4 border-b border-zinc-100 dark:border-zinc-800">
        <p className="text-xs text-zinc-600 dark:text-zinc-400">Total Revenue</p>
        <h1 className="text-xl sm:text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          {formatNaira(stats?.totalRevenue || 0)}
        </h1>
      </div>
      <div className="p-2 sm:p-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Order Summary</h2>
        </div>
        <div className="space-y-1">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="group flex items-center justify-between p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-all duration-200"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div
                  className={cn("p-1.5 rounded-lg flex-shrink-0", {
                    "bg-emerald-100 dark:bg-emerald-900/30": account.type === "savings",
                    "bg-blue-100 dark:bg-blue-900/30": account.type === "checking",
                    "bg-purple-100 dark:bg-purple-900/30": account.type === "investment",
                    "bg-red-100 dark:bg-red-900/30": account.type === "debt",
                  })}
                >
                  {account.type === "savings" && (
                    <Wallet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  )}
                  {account.type === "checking" && (
                    <CreditCard className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  )}
                  {account.type === "investment" && (
                    <TrendingUp className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  )}
                  {account.type === "debt" && (
                    <Wallet className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {account.title}
                  </h3>
                  {account.description && (
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 truncate">
                      {account.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                  {account.balance}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
