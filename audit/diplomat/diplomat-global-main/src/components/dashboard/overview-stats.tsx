"use client";

import type React from "react";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Package,
  Users,
  Minus,
  Receipt,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardData } from "@/components/dashboard/dashboard-data-provider";

/* ── Helpers ────────────────────────────────────────────── */

function formatNaira(n: number): string {
  return "\u20A6" + n.toLocaleString("en-NG", { maximumFractionDigits: 0 });
}

function formatPct(n: number | null): string | null {
  if (n === null) return null;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function ComparisonBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  if (pct === 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-gray-400">
        <Minus className="h-2.5 w-2.5" />
        0%
      </span>
    );
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-medium",
        pct > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400",
      )}
    >
      {pct > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {formatPct(pct)}
    </span>
  );
}

/* ── Loading skeleton ───────────────────────────────────── */

function SkeletonPulse({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded bg-gray-200 dark:bg-gray-700", className)}
      aria-hidden="true"
    />
  );
}

function StatCardSkeleton() {
  return (
    <div className="bg-white dark:bg-[#1a1a1e] rounded-lg sm:rounded-xl p-3 sm:p-5 border border-gray-200 dark:border-[#2a2a2e]">
      <SkeletonPulse className="h-3 w-20 mb-2" />
      <SkeletonPulse className="h-6 w-28 mb-1" />
      <SkeletonPulse className="h-3 w-24" />
    </div>
  );
}

/* ── Single stat card ───────────────────────────────────── */

interface StatCardProps {
  title: string;
  value: string;
  vsLabel?: string;
  vsPct?: number | null;
  subtitle?: string;
  icon: React.ReactNode;
  accent?: "green" | "red" | "blue" | "amber" | "purple" | "gray";
  dataQuality?: "exact" | "partial" | "unknown";
}

function StatCard({
  title,
  value,
  vsLabel,
  vsPct,
  subtitle,
  icon,
  accent = "gray",
  dataQuality,
}: StatCardProps) {
  const iconBg: Record<string, string> = {
    green: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
    red: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
    blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    amber: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
    purple: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
    gray: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };

  return (
    <div className="bg-white dark:bg-[#1a1a1e] rounded-lg sm:rounded-xl p-3 sm:p-5 border border-gray-200 dark:border-[#2a2a2e] hover:shadow-md transition-shadow min-w-0">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide leading-tight min-w-0">
          {title}
        </h3>
        <div className={cn("grid size-7 shrink-0 place-items-center rounded-lg", iconBg[accent])}>
          {icon}
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white truncate tabular-nums">
          {value}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {vsLabel && vsPct !== undefined && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              vs {vsLabel}
            </span>
          )}
          <ComparisonBadge pct={vsPct ?? null} />
        </div>
        {subtitle && (
          <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{subtitle}</p>
        )}
        {dataQuality === "partial" && (
          <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-amber-500 dark:text-amber-400 mt-0.5">
            <AlertTriangle className="h-2.5 w-2.5" />
            Partial cost data
          </span>
        )}
        {dataQuality === "unknown" && (
          <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-gray-400 dark:text-gray-500 mt-0.5">
            <AlertTriangle className="h-2.5 w-2.5" />
            Cost data unavailable
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Component ──────────────────────────────────────────── */

interface FinancialPeriod {
  sales: number;
  orders: number;
  units: number;
  cogs: number;
  refunds: number;
  expenses: number;
  cogsComplete: boolean;
  netSales: number;
  grossProfit: number | null;
  grossMargin: number | null;
  netProfit: number | null;
  aov: number;
  cogsDataComplete: boolean;
  vsPrev?: number | null;
}

interface FinancialSummary {
  thisWeek: FinancialPeriod;
  prevWeek: FinancialPeriod;
  thisMonth: FinancialPeriod;
  prevMonth: FinancialPeriod;
  yearToDate: FinancialPeriod;
  prevYear: FinancialPeriod;
}

export default function OverviewStats({
  initialFinancial,
}: {
  initialFinancial?: FinancialSummary | null;
}) {
  const { stats, loading } = useDashboardData();
  const financial = initialFinancial;

  if (loading && !financial) {
    return (
      <div
        className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
        role="status"
        aria-label="Loading dashboard statistics"
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
        <span className="sr-only">Loading statistics…</span>
      </div>
    );
  }

  if (!financial) {
    // Fallback to old stats-based cards if financial summary failed to load
    const cards: StatCardProps[] = [
      {
        title: "Total Revenue",
        value: stats ? formatNaira(stats.totalRevenue) : "\u20A60",
        subtitle: stats ? `${stats.totalOrders} total orders` : "No orders yet",
        icon: <DollarSign className="h-3.5 w-3.5" />,
        accent: "green",
      },
      {
        title: "Paid Orders",
        value: stats ? String(stats.totalOrders - stats.pendingOrders) : "0",
        subtitle: stats ? `${stats.pendingOrders} pending` : "\u2014",
        icon: <ShoppingCart className="h-3.5 w-3.5" />,
        accent: "blue",
      },
      {
        title: "Customers",
        value: stats ? String(stats.totalCustomers) : "0",
        subtitle: stats ? `${stats.totalSubscribers} subscribers` : "\u2014",
        icon: <Users className="h-3.5 w-3.5" />,
        accent: "purple",
      },
      {
        title: "Products",
        value: stats ? String(stats.activeProducts) : "0",
        subtitle: stats ? `${stats.totalProducts} total, ${stats.lowStockCount} low stock` : "\u2014",
        icon: <Package className="h-3.5 w-3.5" />,
        accent: stats?.lowStockCount ? "red" : "gray",
      },
    ];
    return (
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {cards.map((c) => (
          <StatCard key={c.title} {...c} />
        ))}
      </div>
    );
  }

  const tw = financial.thisWeek;
  const tm = financial.thisMonth;
  const yt = financial.yearToDate;

  const costDataForProfit = (p: FinancialPeriod): "exact" | "partial" | "unknown" => {
    if (p.cogsDataComplete) return "exact";
    if (p.cogs > 0) return "partial";
    return "unknown";
  };

  const cards: StatCardProps[] = [
    /* ── Row 1: Revenue ──────────────────────────── */
    {
      title: "This Week Sales",
      value: formatNaira(tw.sales),
      vsPct: tw.vsPrev,
      vsLabel: "last week",
      subtitle: `${tw.orders} orders \u00B7 ${tw.units} units`,
      icon: <DollarSign className="h-3.5 w-3.5" />,
      accent: "green",
    },
    {
      title: "This Month Sales",
      value: formatNaira(tm.sales),
      vsPct: tm.vsPrev,
      vsLabel: "last month",
      subtitle: `${tm.orders} orders \u00B7 ${tm.units} units`,
      icon: <DollarSign className="h-3.5 w-3.5" />,
      accent: "green",
    },
    {
      title: "Year-to-Date Sales",
      value: formatNaira(yt.sales),
      vsPct: yt.vsPrev,
      vsLabel: "same period last year",
      subtitle: `${yt.orders} orders \u00B7 ${yt.units} units`,
      icon: <TrendingUp className="h-3.5 w-3.5" />,
      accent: "blue",
    },

    /* ── Row 2: Operations ──────────────────────── */
    {
      title: "Paid Orders",
      value: String(tw.orders),
      subtitle: `This week \u00B7 ${tm.orders} this month`,
      icon: <ShoppingCart className="h-3.5 w-3.5" />,
      accent: "blue",
    },
    {
      title: "Units Sold",
      value: String(tw.units),
      subtitle: `This week \u00B7 ${tm.units} this month`,
      icon: <Package className="h-3.5 w-3.5" />,
      accent: "purple",
    },
    {
      title: "Avg Order Value",
      value: formatNaira(tw.aov),
      subtitle: `This week \u00B7 ${formatNaira(tm.aov)} this month`,
      icon: <DollarSign className="h-3.5 w-3.5" />,
      accent: "amber",
    },
    {
      title: "Refunds",
      value: formatNaira(tw.refunds),
      subtitle: `This week \u00B7 ${formatNaira(tm.refunds)} this month`,
      icon: <Receipt className="h-3.5 w-3.5" />,
      accent: tw.refunds > 0 ? "red" : "gray",
    },

    /* ── Row 3: Profitability ────────────────────── */
    {
      title: "Gross Profit",
      value: tw.grossProfit !== null ? formatNaira(tw.grossProfit) : "\u2014",
      subtitle: `This week \u00B7 COGS: ${formatNaira(tw.cogs)}`,
      icon: <TrendingUp className="h-3.5 w-3.5" />,
      accent: tw.grossProfit !== null && tw.grossProfit >= 0 ? "green" : "red",
      dataQuality: costDataForProfit(tw),
    },
    {
      title: "Gross Margin",
      value: tw.grossMargin !== null ? `${tw.grossMargin.toFixed(1)}%` : "\u2014",
      subtitle: `This week \u00B7 Net sales: ${formatNaira(tw.netSales)}`,
      icon: <TrendingUp className="h-3.5 w-3.5" />,
      accent: tw.grossMargin !== null && tw.grossMargin >= 0 ? "green" : "red",
      dataQuality: costDataForProfit(tw),
    },
    {
      title: "Expenses",
      value: formatNaira(tw.expenses),
      subtitle: `This week \u00B7 ${formatNaira(tm.expenses)} this month`,
      icon: <Receipt className="h-3.5 w-3.5" />,
      accent: tw.expenses > 0 ? "amber" : "gray",
    },
    {
      title: "Net Profit",
      value: tw.netProfit !== null ? formatNaira(tw.netProfit) : "\u2014",
      subtitle: `Gross profit - Expenses`,
      icon: tw.netProfit !== null && tw.netProfit >= 0 ? (
        <TrendingUp className="h-3.5 w-3.5" />
      ) : (
        <TrendingDown className="h-3.5 w-3.5" />
      ),
      accent: tw.netProfit !== null && tw.netProfit >= 0 ? "green" : "red",
      dataQuality: costDataForProfit(tw),
    },
  ];

  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {cards.map((c) => (
        <StatCard key={c.title} {...c} />
      ))}
    </div>
  );
}
