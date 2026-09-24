"use client";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useDashboardData } from "@/components/dashboard/dashboard-data-provider";

const lightTooltipStyle = {
  backgroundColor: "white",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  fontSize: "12px",
};
const darkTooltipStyle = {
  backgroundColor: "#1a1a1e",
  border: "1px solid #2a2a2e",
  borderRadius: "8px",
  fontSize: "12px",
  color: "#e5e5e5",
};

function useIsDark() {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

const emptyLine = [
  { month: "Jan", revenue: 0, orders: 0 },
  { month: "Feb", revenue: 0, orders: 0 },
  { month: "Mar", revenue: 0, orders: 0 },
  { month: "Apr", revenue: 0, orders: 0 },
  { month: "May", revenue: 0, orders: 0 },
  { month: "Jun", revenue: 0, orders: 0 },
  { month: "Jul", revenue: 0, orders: 0 },
  { month: "Aug", revenue: 0, orders: 0 },
  { month: "Sep", revenue: 0, orders: 0 },
  { month: "Oct", revenue: 0, orders: 0 },
  { month: "Nov", revenue: 0, orders: 0 },
  { month: "Dec", revenue: 0, orders: 0 },
];
const emptyBar = [
  { day: "Mon", revenue: 0 },
  { day: "Tue", revenue: 0 },
  { day: "Wed", revenue: 0 },
  { day: "Thu", revenue: 0 },
  { day: "Fri", revenue: 0 },
  { day: "Sat", revenue: 0 },
  { day: "Sun", revenue: 0 },
];

export function SalesChart() {
  const isDark = useIsDark();
  const { analytics } = useDashboardData();
  const data =
    analytics?.monthlySales?.map((m: any) => ({
      month: m.month,
      revenue: m.revenue,
      orders: m.orders,
    })) || emptyLine;

  return (
    <div className="bg-white dark:bg-[#1a1a1e] rounded-xl p-3 sm:p-6 border border-gray-200 dark:border-[#2a2a2e] w-full min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
          Sales Overview
        </h3>
        <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Last 12 months</span>
      </div>
      <div className="h-64 sm:h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#2a2a2e" : "rgba(0,0,0,0.1)"} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: isDark ? "#a3a3a3" : undefined }}
              stroke={isDark ? "#2a2a2e" : "rgba(0,0,0,0.1)"}
            />
            <YAxis
              tick={{ fontSize: 11, fill: isDark ? "#a3a3a3" : undefined }}
              stroke={isDark ? "#2a2a2e" : "rgba(0,0,0,0.1)"}
            />
            <Tooltip
              contentStyle={isDark ? darkTooltipStyle : lightTooltipStyle}
              formatter={(v: number) => [`₦${v.toLocaleString()}`, ""]}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="rgb(59, 130, 246)"
              fill="rgba(59, 130, 246, 0.1)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              name="Revenue (₦)"
            />
            <Line
              type="monotone"
              dataKey="orders"
              stroke="rgb(16, 185, 129)"
              fill="rgba(16, 185, 129, 0.1)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              name="Orders"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function RevenueChart() {
  const isDark = useIsDark();
  const { analytics } = useDashboardData();
  const data = analytics?.weeklyRevenue || emptyBar;

  return (
    <div className="bg-white dark:bg-[#1a1a1e] rounded-xl p-3 sm:p-6 border border-gray-200 dark:border-[#2a2a2e] w-full min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
          Weekly Revenue
        </h3>
        <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">This week</span>
      </div>
      <div className="h-48 sm:h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#2a2a2e" : "rgba(0,0,0,0.1)"} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: isDark ? "#a3a3a3" : undefined }}
              stroke={isDark ? "#2a2a2e" : "rgba(0,0,0,0.1)"}
            />
            <YAxis
              tick={{ fontSize: 11, fill: isDark ? "#a3a3a3" : undefined }}
              stroke={isDark ? "#2a2a2e" : "rgba(0,0,0,0.1)"}
            />
            <Tooltip
              contentStyle={isDark ? darkTooltipStyle : lightTooltipStyle}
              formatter={(v: number) => [`₦${v.toLocaleString()}`, "Revenue"]}
            />
            <Bar
              dataKey="revenue"
              fill="rgba(139, 92, 246, 0.8)"
              stroke="rgb(139, 92, 246)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
