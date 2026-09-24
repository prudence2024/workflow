"use client";

import { TrendingUp } from "lucide-react";
import { useDashboardData } from "@/components/dashboard/dashboard-data-provider";

const formatNaira = (n: number) => "₦" + n.toLocaleString("en-NG");

export default function TopProducts() {
  const { analytics } = useDashboardData();
  const products = analytics?.topProducts || [];

  return (
    <div className="bg-white dark:bg-[#1a1a1e] rounded-xl p-6 border border-gray-200 dark:border-[#2a2a2e]">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Top Products</h3>
      </div>
      <div className="space-y-4">
        {products.map(
          (product: {
            id: string;
            rank: number;
            name: string;
            category: string;
            revenue: number;
            qty: number;
          }) => (
            <div
              key={product.id}
              className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-[#222226] rounded-lg transition-colors"
            >
              <div className="flex items-center space-x-4">
                <div className="flex items-center justify-center w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-full text-sm font-medium text-gray-600 dark:text-gray-400">
                  {product.rank}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {product.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{product.category}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {formatNaira(product.revenue)}
                </p>
                <span className="text-xs text-gray-500 dark:text-gray-400">{product.qty} sold</span>
              </div>
            </div>
          ),
        )}
        {products.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">No order data yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
