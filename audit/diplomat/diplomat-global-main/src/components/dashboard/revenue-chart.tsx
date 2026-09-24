"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function RevenueChart() {
  return (
    <Card className="bg-white dark:bg-gray-800">
      <CardHeader>
        <CardTitle className="text-gray-900 dark:text-white">Revenue Trends</CardTitle>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Monthly revenue across all sales channels
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center h-[300px] text-gray-400 dark:text-gray-500">
          <div className="text-center">
            <DollarSign className="mx-auto h-12 w-12 mb-4 opacity-50" />
            <p className="text-sm">No revenue data yet</p>
            <p className="text-xs mt-1">Start receiving orders to see revenue trends</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DollarSign({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="12" x2="12" y1="2" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}
