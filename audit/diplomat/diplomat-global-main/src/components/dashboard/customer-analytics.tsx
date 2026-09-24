"use client";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useDashboardData } from "@/components/dashboard/dashboard-data-provider";

const COLORS = ["rgba(59, 130, 246, 0.8)", "rgba(16, 185, 129, 0.8)", "rgba(245, 158, 11, 0.8)"];
const BORDER_COLORS = ["rgb(59, 130, 246)", "rgb(16, 185, 129)", "rgb(245, 158, 11)"];

export default function CustomerAnalytics() {
  const { stats } = useDashboardData();

  const totalCustomers = stats?.totalCustomers || 0;
  // Without a returning vs new breakdown, show single-segment or empty state
  const customerData = totalCustomers > 0 ? [{ name: "Customers", value: totalCustomers }] : [];

  return (
    <div className="bg-white dark:bg-[#1a1a1e] rounded-xl p-3 sm:p-6 border border-gray-200 dark:border-[#2a2a2e] w-full min-w-0">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
          Customers
        </h3>
        <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Total</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:gap-6">
        <div className="h-32 sm:h-48 w-full flex justify-center items-center">
          {customerData.length > 0 ? (
            <div className="w-32 sm:w-48 h-32 sm:h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={customerData}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={60}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {customerData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index]}
                        stroke={BORDER_COLORS[index]}
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No customer data yet</p>
          )}
        </div>
        <div className="space-y-3 sm:space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white">
              Total Customers
            </span>
            <span className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
              {totalCustomers}
            </span>
          </div>
          {stats?.totalSubscribers > 0 && (
            <div className="flex justify-between items-center pt-3 border-t border-gray-200 dark:border-gray-700">
              <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                Newsletter Subscribers
              </span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {stats.totalSubscribers}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
