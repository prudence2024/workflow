import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Database, AlertTriangle, Search, Save } from "lucide-react";
import { adminListInventory, adminUpdateInventory } from "@/lib/admin/server-fns";
import { joinInFlight } from "@/lib/in-flight-dedupe";
import { Pagination } from "@/components/admin/pagination";
import { toast } from "sonner";
import { resolveInventoryState } from "@/lib/inventory-lifecycle";

export const Route = createFileRoute("/dashboard/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editThreshold, setEditThreshold] = useState("");

  const fetchInventory = useServerFn(adminListInventory);
  const updateInventory = useServerFn(adminUpdateInventory);

  const load = async () => {
    setLoading(true);
    try {
      // The page component mounts twice (verified live), so the same request
      // would otherwise be issued twice concurrently. Same key joins it.
      const res = await joinInFlight(`inventory|${search}|${page}`, () =>
        fetchInventory({ data: { search, page, pageSize: 10 } }),
      );
      if ("error" in res && res.error) throw new Error(res.error);
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Inventory could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [search]);
  useEffect(() => {
    load();
  }, [page, search]);

  const handleSave = async (productId: string) => {
    const qty = Number(editQty);
    const threshold = Number(editThreshold);
    if (!Number.isInteger(qty) || qty < 0) {
      toast.error("Quantity must be a whole number of zero or more.");
      return;
    }
    if (!Number.isInteger(threshold) || threshold < 0) {
      toast.error("Low-stock threshold must be a whole number of zero or more.");
      return;
    }
    const res = await updateInventory({
      data: { product_id: productId, quantity: qty, low_stock_threshold: threshold },
    });
    if (res.ok) {
      await router.invalidate();
      toast.success("Inventory updated");
      setEditingId(null);
      await load();
    } else toast.error(res.message);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Inventory</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{total} products tracked</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search products..."
          aria-label="Search inventory"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <Card className="bg-white dark:bg-[#0F0F12]">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Product
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    SKU
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Stock
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Low-Stock Threshold
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Status
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any) => {
                  const product = item.products;
                  const inventoryState = resolveInventoryState(item, false).state;
                  const isEditing = editingId === item.product_id;
                  return (
                    <tr
                      key={item.product_id}
                      className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {(() => {
                            const imgs = product?.product_images;
                            const img =
                              Array.isArray(imgs) && imgs.length > 0
                                ? imgs.sort(
                                    (a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0),
                                  )[0]
                                : null;
                            return img ? (
                              <img
                                src={img.secure_url}
                                alt={product?.name || ""}
                                className="h-8 w-8 rounded-lg object-cover ring-1 ring-gray-200 dark:ring-gray-700 flex-shrink-0"
                              />
                            ) : null;
                          })()}
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {product?.name || "Unknown"}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                          {product?.sku || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              value={editQty}
                              onChange={(e) => setEditQty(e.target.value)}
                              className="w-20 h-8 text-xs"
                              min={0}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              onClick={() => handleSave(item.product_id)}
                            >
                              <Save className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {item.quantity}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <Input
                            type="number"
                            value={editThreshold}
                            onChange={(e) => setEditThreshold(e.target.value)}
                            className="w-20 h-8 text-xs"
                            min={0}
                            title="When stock reaches this level, the product is flagged as Low Stock"
                          />
                        ) : (
                          <span
                            className="text-sm text-gray-500"
                            title="When stock reaches this quantity or lower, the product is flagged as Low Stock"
                          >
                            {item.low_stock_threshold}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {inventoryState === "out_of_stock" ? (
                          <Badge className="bg-gray-100 text-gray-600">Out of Stock</Badge>
                        ) : inventoryState === "low_stock" ? (
                          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                            <AlertTriangle className="h-3 w-3 mr-1" /> Low Stock
                          </Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            In Stock
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!isEditing && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => {
                              setEditingId(item.product_id);
                              setEditQty(String(item.quantity));
                              setEditThreshold(String(item.low_stock_threshold));
                            }}
                          >
                            Edit
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-gray-500 dark:text-gray-400"
                    >
                      <Database className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">No inventory records</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalItems={total} pageSize={10} onPageChange={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}
