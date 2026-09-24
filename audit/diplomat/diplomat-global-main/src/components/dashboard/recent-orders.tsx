"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useDashboardData } from "@/components/dashboard/dashboard-data-provider";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  paid: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  processing: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  shipped: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  delivered: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const formatNaira = (n: number) => "₦" + n.toLocaleString("en-NG");

export default function RecentOrders() {
  const { stats, loading } = useDashboardData();
  const orders = stats?.recentOrders || [];

  return (
    <div className="bg-white dark:bg-[#1a1a1e] rounded-xl p-6 border border-gray-200 dark:border-[#2a2a2e] overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Orders</h3>
        <a
          href="/dashboard/orders"
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          View all
        </a>
      </div>
      <div className="space-y-4 overflow-hidden">
        {orders.map((order: any) => {
          const name = order.customers
            ? `${order.customers.first_name || ""} ${order.customers.last_name || ""}`.trim() ||
              "Not provided"
            : "Not provided";
          const initials =
            name
              .split(" ")
              .map((n: string) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase() || "U";
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
              className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-[#222226] rounded-lg transition-colors"
            >
              <div className="flex items-center space-x-4 min-w-0">
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-2 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {name}
                    </p>
                    <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                      {order.reference}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {order.order_items?.length || 0} items
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
                <p className="text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">
                  {formatNaira(Number(order.total))}
                </p>
                <Badge
                  className={`${statusColors[order.status] || "bg-gray-100 text-gray-600"} border-0 text-[10px] px-1.5 py-0`}
                >
                  {order.status}
                </Badge>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">{timeAgo}</p>
              </div>
            </div>
          );
        })}
        {orders.length === 0 && !loading && (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">No orders yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
