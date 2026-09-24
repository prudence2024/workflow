import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tag, Plus, Edit, Trash2, FolderOpen, X } from "lucide-react";
import {
  adminListCategoriesForDashboard,
  adminCreateCategory,
  adminUpdateCategory,
  adminDeleteCategory,
} from "@/lib/admin/server-fns";
import { Pagination } from "@/components/admin/pagination";
import { toast } from "sonner";
import type { CategoryView } from "@/lib/category-lifecycle";

export const Route = createFileRoute("/dashboard/categories")({
  head: () => ({
    meta: [
      { title: "Categories — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState<CategoryView[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", description: "" });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<CategoryView | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    slug: "",
    description: "",
    sort_order: 0,
    active: true,
  });
  const latestLoad = useRef(0);

  const fetchCategories = useServerFn(adminListCategoriesForDashboard);
  const createCategory = useServerFn(adminCreateCategory);
  const updateCategory = useServerFn(adminUpdateCategory);
  const deleteCategory = useServerFn(adminDeleteCategory);

  const load = useCallback(
    async (requested?: { search?: string; page?: number }) => {
      const requestId = ++latestLoad.current;
      setLoading(true);
      try {
        const res = await fetchCategories({
          data: {
            search: requested?.search ?? search,
            page: requested?.page ?? page,
            pageSize: 10,
          },
        });
        if (requestId !== latestLoad.current) return false;
        if (!res.ok) {
          setLoadError(res.message);
          return false;
        }
        setCategories(res.categories);
        setTotal(res.total);
        setLoadError("");
        return true;
      } catch (error) {
        if (requestId === latestLoad.current) {
          console.error("[categories] List refresh failed:", error);
          setLoadError("Categories could not be loaded. Please retry.");
        }
        return false;
      } finally {
        if (requestId === latestLoad.current) setLoading(false);
      }
    },
    [fetchCategories, page, search],
  );

  useEffect(() => {
    setPage(1);
  }, [search]);
  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    if (creating) return;
    if (!form.name || !form.slug) {
      toast.error("Name and slug are required");
      return;
    }
    setCreating(true);
    try {
      const res = await createCategory({ data: form });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }

      // The committed row returned by the server is shown immediately. A failed
      // follow-up refresh cannot make a successful create appear to disappear.
      setCategories((current) => [
        res.category,
        ...current.filter((c) => c.id !== res.category.id),
      ]);
      setTotal((current) => current + 1);
      setForm({ name: "", slug: "", description: "" });
      setShowForm(false);
      setSearch("");
      setPage(1);
      toast.success("Category created");
      await load({ search: "", page: 1 });
    } catch (error) {
      console.error("[categories] Create failed:", error);
      toast.error("Category could not be created. Please retry.");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete category "${name}"?`)) return;
    setDeletingId(id);
    try {
      const res = await deleteCategory({ data: { category_id: id } });
      if (res.ok) {
        setCategories((current) => current.filter((category) => category.id !== id));
        setTotal((current) => Math.max(0, current - 1));
        toast.success("Category deleted");
        await load();
      } else toast.error(res.message);
    } catch (error) {
      console.error("[categories] Delete failed:", error);
      toast.error("Category could not be deleted. Please retry.");
    } finally {
      setDeletingId(null);
    }
  };

  const openEdit = (cat: CategoryView) => {
    setEditModal(cat);
    setEditForm({
      name: cat.name,
      slug: cat.slug,
      description: cat.description || "",
      sort_order: cat.sort_order,
      active: cat.active !== false,
    });
  };

  const handleUpdate = async () => {
    if (!editModal || updating) return;
    if (!editForm.name || !editForm.slug) {
      toast.error("Name and slug are required");
      return;
    }
    setUpdating(true);
    try {
      const res = await updateCategory({ data: { category_id: editModal.id, ...editForm } });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setCategories((current) =>
        current
          .map((category) => (category.id === res.category.id ? res.category : category))
          .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
      );
      toast.success("Category updated");
      setEditModal(null);
      await load();
    } catch (error) {
      console.error("[categories] Update failed:", error);
      toast.error("Category could not be updated. Please retry.");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Categories</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{total} categories</p>
        </div>
        <Button
          onClick={() => setShowForm(!showForm)}
          className="mt-4 sm:mt-0 bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Plus className="h-4 w-4 mr-2" /> Add Category
        </Button>
      </div>

      {showForm && (
        <Card className="bg-white dark:bg-[#1a1a1e] border-gray-200 dark:border-[#2a2a2e]">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                placeholder="Category name"
                value={form.name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    name: e.target.value,
                    slug: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, ""),
                  })
                }
              />
              <Input
                placeholder="slug"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
              <Input
                placeholder="Description (optional)"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={creating}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {creating ? "Creating…" : "Create"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="relative max-w-md">
        <Input
          placeholder="Search categories..."
          aria-label="Search categories"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
      </div>

      {loadError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
        >
          <span>{loadError}</span>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            Retry
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((cat) => (
          <Card key={cat.id} className="bg-white dark:bg-[#0F0F12]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                    <FolderOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{cat.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {cat.productCount} products
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Badge
                    variant="default"
                    className={
                      cat.active !== false
                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-gray-100 text-gray-600"
                    }
                  >
                    {cat.active !== false ? "Active" : "Inactive"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-blue-500"
                    onClick={() => openEdit(cat)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-red-500"
                    disabled={deletingId === cat.id}
                    onClick={() => handleDelete(cat.id, cat.name)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {categories.length === 0 && !loading && !loadError && (
          <div className="col-span-full text-center py-12 text-gray-500">
            <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No categories found</p>
          </div>
        )}
      </div>

      {/* Edit Category Modal */}
      {editModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setEditModal(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0F0F12] p-6 shadow-xl ring-1 ring-gray-200 dark:ring-gray-800 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Edit Category</h3>
              <button
                type="button"
                onClick={() => setEditModal(null)}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name
                </label>
                <Input
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      name: e.target.value,
                      slug: e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-|-$/g, ""),
                    })
                  }
                  placeholder="Category name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Slug
                </label>
                <Input
                  value={editForm.slug}
                  onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                  placeholder="slug"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <Input
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="Optional description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Display order
                </label>
                <Input
                  type="number"
                  min={0}
                  max={1000000}
                  value={editForm.sort_order}
                  onChange={(e) =>
                    setEditForm({ ...editForm, sort_order: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Visible on storefront
                </label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={editForm.active}
                  onClick={() => setEditForm({ ...editForm, active: !editForm.active })}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${editForm.active ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${editForm.active ? "translate-x-5" : "translate-x-0"}`}
                  />
                </button>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {editForm.active
                    ? "Active — shown on Homepage, Shop, Footer"
                    : "Inactive — hidden from storefront"}
                </span>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button
                onClick={handleUpdate}
                disabled={updating}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {updating ? "Saving…" : "Save Changes"}
              </Button>
              <Button variant="outline" onClick={() => setEditModal(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
      <Pagination page={page} totalItems={total} pageSize={10} onPageChange={setPage} />
    </div>
  );
}
