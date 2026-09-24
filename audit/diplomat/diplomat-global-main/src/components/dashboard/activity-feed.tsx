"use client";

import { useState, useEffect } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, User, Package, CreditCard, Star, Shield } from "lucide-react";
import { useDashboardData } from "@/components/dashboard/dashboard-data-provider";

const activityIcons: Record<string, any> = {
  order: ShoppingCart,
  user: User,
  product: Package,
  payment: CreditCard,
  review: Star,
  audit: Shield,
};
const activityColors: Record<string, string> = {
  order: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  user: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  product: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400",
  payment: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  review: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
  audit: "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400",
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ActivityFeed() {
  const { stats, loading } = useDashboardData();
  const activities = (stats?.recentOrders || []).map((o: any) => {
    const name = o.customers
      ? `${o.customers.first_name || ""} ${o.customers.last_name || ""}`.trim() || "Not provided"
      : "Not provided";
    return {
      id: o.id,
      type: "order",
      title: "New order placed",
      description: `Order ${o.reference}`,
      time: o.created_at,
      user: { name },
      metadata: { amount: o.total },
    };
  });

  return (
    <div className="bg-white dark:bg-[#1a1a1e] rounded-xl p-6 border border-gray-200 dark:border-[#2a2a2e] overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Activity</h3>
      </div>
      <div className="space-y-4 overflow-hidden">
        {activities.map(
          (activity: {
            id: string;
            type: string;
            title: string;
            description: string;
            time: string;
            user?: { name: string };
            metadata?: { amount: number };
          }) => {
            const Icon = activityIcons[activity.type] || Package;
            const colorClass = activityColors[activity.type] || activityColors.audit;
            return (
              <div
                key={activity.id}
                className="flex items-start space-x-4 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors"
              >
                <div className={`p-2 rounded-full ${colorClass}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {activity.title}
                    </p>
                    <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                      {timeAgo(activity.time)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {activity.description}
                  </p>
                  <div className="flex items-center mt-2 space-x-2">
                    {activity.user && (
                      <div className="flex items-center space-x-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">
                            {activity.user.name
                              .split(" ")
                              .map((n: string) => n[0])
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {activity.user.name}
                        </span>
                      </div>
                    )}
                    {activity.metadata?.amount && (
                      <Badge variant="outline" className="text-xs shrink-0">
                        ₦{Number(activity.metadata.amount).toLocaleString()}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            );
          },
        )}
        {activities.length === 0 && !loading && (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">No recent activity</p>
          </div>
        )}
      </div>
    </div>
  );
}
