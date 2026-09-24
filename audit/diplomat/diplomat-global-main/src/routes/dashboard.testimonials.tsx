import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Star,
  Trash2,
  Plus,
  Edit,
  X,
  Link2,
  Check,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import {
  adminListTestimonials,
  adminCreateTestimonial,
  adminUpdateTestimonial,
  adminDeleteTestimonial,
} from "@/lib/admin/server-fns";
import { Pagination } from "@/components/admin/pagination";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/testimonials")({
  head: () => ({
    meta: [
      { title: "Testimonials — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: TestimonialsPage,
});

function TestimonialsPage() {
  const [testimonials, setTestimonials] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [form, setForm] = useState({
    name: "",
    role: "",
    message: "",
    rating: 5,
    sort_order: 0,
    active: true,
  });
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  const reviewUrl =
    typeof window !== "undefined" ? `${window.location.origin}/reviews` : "/reviews";
  const handleCopyLink = () => {
    navigator.clipboard
      .writeText(reviewUrl)
      .then(() => {
        setCopied(true);
        toast.success("Review link copied!");
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => toast.error("Failed to copy"));
  };

  const fetchTestimonials = useServerFn(adminListTestimonials);
  const createTestimonial = useServerFn(adminCreateTestimonial);
  const updateTestimonial = useServerFn(adminUpdateTestimonial);
  const deleteTestimonial = useServerFn(adminDeleteTestimonial);

  const load = async () => {
    setLoading(true);
    const res = await fetchTestimonials({ data: { page, pageSize: 10 } });
    setTestimonials(res.testimonials || []);
    setTotal(res.total || 0);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [page]);

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditingItem(null);
    setForm({
      name: "",
      role: "",
      message: "",
      rating: 5,
      sort_order: testimonials.length,
      active: true,
    });
    setShowForm(true);
  };

  const openEdit = (item: any) => {
    setEditingItem(item);
    setForm({
      name: item.name || "",
      role: item.role || "",
      message: item.message || "",
      rating: item.rating || 5,
      sort_order: item.sort_order || 0,
      active: item.active ?? true,
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.message) {
      toast.error("Name and message are required");
      return;
    }
    if (editingItem) {
      const res = await updateTestimonial({ data: { testimonial_id: editingItem.id, ...form } });
      if (res.ok) {
        toast.success("Testimonial updated");
        setShowForm(false);
        load();
      } else toast.error(res.message);
    } else {
      const res = await createTestimonial({ data: form });
      if (res.ok) {
        toast.success("Testimonial created");
        setShowForm(false);
        load();
      } else toast.error(res.message);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete testimonial from "${name}"?`)) return;
    const res = await deleteTestimonial({ data: { testimonial_id: id } });
    if (res.ok) {
      toast.success("Testimonial deleted");
      load();
    } else toast.error(res.message);
  };

  const moderate = async (id: string, status: "approved" | "rejected") => {
    const res = await updateTestimonial({
      data: { testimonial_id: id, moderation_status: status },
    });
    if (res.ok) {
      toast.success(status === "approved" ? "Testimonial approved" : "Testimonial rejected");
      load();
    } else {
      toast.error(res.message);
    }
  };

  const toggleActive = async (item: any) => {
    const res = await updateTestimonial({
      data: { testimonial_id: item.id, active: !item.active },
    });
    if (res.ok) {
      toast.success(item.active ? "Hidden from frontend" : "Now visible on frontend");
      load();
    } else toast.error(res.message);
  };

  const filtered = testimonials.filter((t) => {
    if (filter === "all") return true;
    return t.moderation_status === filter;
  });

  const pendingCount = testimonials.filter((t) => t.moderation_status === "pending").length;

  const statusBadge = (t: any) => {
    const ms = t.moderation_status;
    if (ms === "approved")
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle className="h-3 w-3 mr-1" /> Approved
        </Badge>
      );
    if (ms === "rejected")
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
          <XCircle className="h-3 w-3 mr-1" /> Rejected
        </Badge>
      );
    return (
      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
        <Clock className="h-3 w-3 mr-1" /> Pending
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Testimonials</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {testimonials.length} total
            {pendingCount > 0 && (
              <span className="ml-2 text-amber-600 dark:text-amber-400 font-medium">
                {pendingCount} pending review
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Link2 className="h-4 w-4" />}
            {copied ? "Copied!" : "Copy Review Link"}
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0891b2] text-white rounded-lg text-sm font-medium hover:opacity-90 transition"
          >
            <Plus className="h-4 w-4" /> Add Testimonial
          </button>
        </div>
      </div>

      {/* Moderation Filter */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "pending", "approved", "rejected"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${filter === f ? "bg-[#0891b2] text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === "pending" && pendingCount > 0 && (
              <span className="ml-1 bg-amber-500 text-white text-xs rounded-full px-1.5">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {showForm && (
        <Card className="bg-white dark:bg-[#1a1a1e]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingItem ? "Edit Testimonial" : "New Testimonial"}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                Name *
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Customer name"
                  className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                Role / Title
                <input
                  type="text"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  placeholder="e.g. Business owner"
                  className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 sm:col-span-2">
                Message *
                <textarea
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  rows={3}
                  placeholder="What the customer said..."
                  className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 resize-y"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                Rating
                <div className="flex gap-1 pt-1">
                  {[1, 2, 3, 4, 5].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setForm({ ...form, rating: r })}
                      className="transition hover:scale-110"
                    >
                      <Star
                        className={`h-6 w-6 ${r <= form.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300 dark:text-gray-600"}`}
                      />
                    </button>
                  ))}
                </div>
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                Sort Order
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                  min="0"
                  className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
              <div className="flex items-center gap-3 pt-6">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="accent-brand"
                  />
                  Visible on frontend
                </label>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={handleSubmit} className="bg-[#0891b2] text-white hover:opacity-90">
                {editingItem ? "Update" : "Create"}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((t: any) => (
          <Card key={t.id} className="bg-white dark:bg-[#0F0F12]">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-semibold text-sm">
                    {t.name
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{t.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t.role}</p>
                    <div className="flex gap-0.5 mt-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`h-3 w-3 ${i < (t.rating || 0) ? "text-yellow-400 fill-yellow-400" : "text-gray-300 dark:text-gray-600"}`}
                        />
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 line-clamp-3">
                      {t.message}
                    </p>
                    {t.email && (
                      <p className="mt-1 text-xs text-gray-400 italic">Contact: {t.email}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {statusBadge(t)}
                  {t.moderation_status === "pending" && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                        onClick={() => moderate(t.id, "approved")}
                        title="Approve"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        onClick={() => moderate(t.id, "rejected")}
                        title="Reject"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                    onClick={() => openEdit(t)}
                    title="Edit"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    onClick={() => handleDelete(t.id, t.name)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && !loading && (
          <div className="col-span-full text-center py-12 text-gray-500">
            <Star className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">
              {filter === "all" ? "No testimonials yet" : `No ${filter} testimonials`}
            </p>
          </div>
        )}
      </div>
      <Pagination page={page} totalItems={total} pageSize={10} onPageChange={setPage} />
    </div>
  );
}
