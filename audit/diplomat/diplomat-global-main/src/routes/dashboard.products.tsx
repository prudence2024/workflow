import { useRouteSearchInput } from "@/hooks/use-route-search-input";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Package, Search, Plus, Edit, Trash2, Star } from "lucide-react";
import { adminListProducts, adminDeleteProduct } from "@/lib/products-admin.server";
import { formatNaira } from "@/lib/products";
import { resolveInventoryState } from "@/lib/inventory-lifecycle";
import { ProductForm } from "@/components/admin/product-form";
import { Pagination } from "@/components/admin/pagination";
import { toast } from "sonner";

import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

const searchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).catch(1),
  search: z.string().optional().default(""),
  status: z.string().optional().default("all"),
  detail: z.string().optional(),
});

export const Route = createFileRoute("/dashboard/products")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Products — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  loaderDeps: ({ search }) => ({
    page: search.page,
    search: search.search,
    status: search.status,
    detail: search.detail,
  }),
  loader: async ({ deps }) => {
    try {
      const { adminListProducts } = await import("@/lib/products-admin.server");
      const res = await adminListProducts({
        data: {
          product_id: deps.detail,
          search: deps.search || "",
          status: deps.status || "all",
          page: deps.page,
          pageSize: 10,
        },
      });
      if (res.error) throw new Error(res.error);
      return { products: res.products ?? [], total: res.total ?? 0 };
    } catch {
      throw new Error("Unable to load products. Please retry.");
    }
  },
  component: ProductsPage,
});

function ProductsPage() {
  const router = useRouter();
  const { page: urlPage, search: urlSearch, status: urlStatus } = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard/products" });
  const match = Route.useMatch();

  // URL search params + the route loader are the single source of truth for
  // the products list; Refresh re-runs it via router.invalidate().
  const { products, total } = Route.useLoaderData();
  const listLoading = match.isFetching !== false;
  const page = urlPage;

  // Transient search input commits to the URL after a short debounce.
  const [searchInput, setSearchInput] = useRouteSearchInput(urlSearch);
  const statusFilter = urlStatus;
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteProduct = useServerFn(adminDeleteProduct);

  // Search debounce: commit the input to the URL; the loader re-runs once.
  useEffect(() => {
    if (searchInput === urlSearch) return;
    const t = setTimeout(() => {
      navigate({
        search: { page: 1, search: searchInput, status: urlStatus },
        replace: true,
      });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, urlSearch, urlStatus, navigate]);

  // Status filter: commit immediately with a single page reset.
  const setStatusFilter = useCallback(
    (s: string) => {
      navigate({ search: { page: 1, search: urlSearch, status: s }, replace: true });
    },
    [urlSearch, navigate],
  );

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    const res = await deleteProduct({ data: { product_id: id } });
    if (res.ok) {
      await router.invalidate({ sync: true });
      toast.success("Product deleted");
      // If deleted last item on last page, navigate to the previous page
      const newTotal = total - 1;
      const newTotalPages = Math.max(1, Math.ceil(newTotal / 10));
      if (page > newTotalPages && newTotalPages > 0) {
        navigate({
          search: { page: newTotalPages, search: urlSearch, status: urlStatus },
          replace: true,
        });
      }
    } else {
      toast.error(res.message);
    }
    setDeletingId(null);
  };

  return (
    <div className="space-y-6" aria-busy={listLoading}>
      {listLoading && <p role="status">Loading current products...</p>}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Products</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{total} products</p>
        </div>
        <Button
          onClick={() => {
            setFormMode("create");
            setEditingProduct(null);
            setFormOpen(true);
          }}
          className="mt-4 sm:mt-0 bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Plus className="h-4 w-4 mr-2" /> Add Product
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search products..."
            aria-label="Search products"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          {["all", "active", "draft", "archived"].map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(s)}
              className={
                statusFilter === s ? "bg-gray-900 dark:bg-white dark:text-gray-900 text-white" : ""
              }
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <Card className="bg-white dark:bg-[#1a1a1e] border-gray-200 dark:border-[#2a2a2e]">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Product
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden lg:table-cell">
                    SKU
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden sm:table-cell">
                    Category
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Price
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden lg:table-cell">
                    Stock
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {!listLoading &&
                  products.map((product: any) => (
                    <tr
                      key={product.id}
                      className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {(() => {
                            const imgs = product.product_images;
                            const img =
                              Array.isArray(imgs) && imgs.length > 0
                                ? imgs.sort(
                                    (a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0),
                                  )[0]
                                : null;
                            return img ? (
                              <img
                                src={img.secure_url}
                                alt={product.name}
                                className="h-10 w-10 rounded-lg object-cover ring-1 ring-gray-200 dark:ring-gray-700 flex-shrink-0"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                                <Package className="h-5 w-5 text-gray-400" />
                              </div>
                            );
                          })()}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {product.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              Created by: {product.creator?.name ?? "Not recorded"}
                            </p>
                            {product.created_at && (
                              <p className="text-xs text-gray-500">
                                Created:{" "}
                                <time dateTime={product.created_at}>
                                  {product.created_at.slice(0, 10)}
                                </time>
                              </p>
                            )}
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {product.sku ? (
                                <span className="font-mono">{product.sku}</span>
                              ) : (
                                product.tagline
                              )}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                          {product.sku || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {product.categories?.name || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {formatNaira(product.price)}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <Badge
                          className={
                            product.status === "active"
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                              : product.status === "draft"
                                ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                          }
                        >
                          {product.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {(() => {
                          const stock = resolveInventoryState(product.inventory, product.in_stock);
                          const badge =
                            stock.state === "out_of_stock"
                              ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                              : stock.state === "low_stock"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                                : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
                          const label =
                            stock.state === "out_of_stock"
                              ? "Sold out"
                              : stock.state === "low_stock"
                                ? `Low — ${stock.quantity}`
                                : `${stock.quantity}`;
                          return (
                            <Badge className={badge} aria-label={`Stock: ${label}`}>
                              {label}
                            </Badge>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => {
                              setFormMode("edit");
                              setEditingProduct(product);
                              setFormOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                            aria-label={"Delete " + product.name}
                            disabled={deletingId === product.id}
                            onClick={() => handleDelete(product.id, product.name)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                {products.length === 0 && !listLoading && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-gray-500 dark:text-gray-400"
                    >
                      <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>Product unavailable or no matching products</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalItems={total}
            pageSize={10}
            onPageChange={(p: number) =>
              navigate({ search: { page: p, search: urlSearch, status: urlStatus }, replace: true })
            }
          />
        </CardContent>
      </Card>

      {formOpen && (
        <ProductForm
          mode={formMode}
          product={editingProduct}
          onClose={() => setFormOpen(false)}
          onSuccess={async () => {
            await router.invalidate({ sync: true });
            setFormOpen(false);
            toast.success(formMode === "create" ? "Product created!" : "Product updated!");
          }}
        />
      )}
    </div>
  );
}
