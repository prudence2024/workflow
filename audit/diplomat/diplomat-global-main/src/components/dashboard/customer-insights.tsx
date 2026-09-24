"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

export function CustomerInsights() {
  return (
    <Card className="bg-white dark:bg-gray-800">
      <CardHeader>
        <CardTitle className="flex items-center text-gray-900 dark:text-white">
          <Users className="mr-2 h-5 w-5" />
          Customers
        </CardTitle>
        <p className="text-sm text-gray-500 dark:text-gray-400">Customer activity and insights</p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Users className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No customers yet</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Customer data will appear after first orders
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
