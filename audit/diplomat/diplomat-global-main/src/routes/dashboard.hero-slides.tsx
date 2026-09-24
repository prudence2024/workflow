import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CustomSelect } from "@/components/ui/custom-select";
import { ImageIcon, Trash2, Plus, Edit, Eye, EyeOff, X, GripVertical, Upload } from "lucide-react";
import {
  adminListHeroSlides,
  adminCreateHeroSlide,
  adminUpdateHeroSlide,
  adminDeleteHeroSlide,
  adminListCategoriesForDashboard,
  adminHeroProductOptions,
  adminHeroBlogOptions,
  adminHeroSlideDiagnostics,
} from "@/lib/admin/server-fns";
import { parseHeroSourceLink, sanitizeStaticHeroLink } from "@/lib/hero-source";
import { Pagination } from "@/components/admin/pagination";
import { joinInFlight } from "@/lib/in-flight-dedupe";
import { HeroDiagnosticsPanel } from "@/components/admin/hero-diagnostics";
import { toast } from "sonner";
import { useRef } from "react";
import { getCloudinaryUploadSignature } from "@/lib/products-admin.server";

export const Route = createFileRoute("/dashboard/hero-slides")({
  head: () => ({
    meta: [
      { title: "Hero Slides — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: HeroSlidesPage,
});

function HeroSlidesPage() {
  const [slides, setSlides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSlide, setEditingSlide] = useState<any>(null);
  const [form, setForm] = useState({
    eyebrow: "",
    title: "",
    body: "",
    price_context: "",
    category: "",
    cta_text: "Shop now",
    cta_link: "/shop",
    image: "",
    sort_order: 0,
    active: true,
  });

  const fetchSlides = useServerFn(adminListHeroSlides);
  const createSlide = useServerFn(adminCreateHeroSlide);
  const updateSlide = useServerFn(adminUpdateHeroSlide);
  const deleteSlide = useServerFn(adminDeleteHeroSlide);
  // Source pickers (§2): searchable product/blog lists for binding slides.
  // Options load once per type; CustomSelect's built-in search narrows them.
  const [sourceType, setSourceType] = useState<"" | "product" | "blog">("");
  const [productOptions, setProductOptions] = useState<
    Array<{ slug: string; name: string; sku: string; tagline: string; image: string }>
  >([]);
  const [blogOptions, setBlogOptions] = useState<
    Array<{ slug: string; title: string; kind: string; excerpt: string; image: string }>
  >([]);
  const fetchProductOptions = useServerFn(adminHeroProductOptions);
  const fetchBlogOptions = useServerFn(adminHeroBlogOptions);
  const productLoadedRef = useRef(false);
  const blogLoadedRef = useRef(false);
  useEffect(() => {
    if (sourceType === "product" && !productLoadedRef.current) {
      productLoadedRef.current = true;
      fetchProductOptions({}).then(
        (res) => setProductOptions(res?.options ?? []),
        () => setProductOptions([]),
      );
    }
    if (sourceType === "blog" && !blogLoadedRef.current) {
      blogLoadedRef.current = true;
      fetchBlogOptions({}).then(
        (res) => setBlogOptions(res?.options ?? []),
        () => setBlogOptions([]),
      );
    }
  }, [sourceType, fetchProductOptions, fetchBlogOptions]);

  /**
   * Selecting a source auto-fills the full presentation set from the source
   * record (Owner addendum §8): title, body/description, image, CTA label and
   * canonical destination — all editable afterwards, and the live resolver
   * keeps public content derived from the source on every read.
   */
  const applySourceDefaults = (kind: "product" | "blog", slug: string) => {
    if (kind === "product") {
      const p = productOptions.find((o) => o.slug === slug);
      if (!p) return;
      setForm((f) => ({
        ...f,
        title: p.name,
        body: p.tagline || f.body,
        image: p.image || f.image,
        cta_text: "Shop now",
        cta_link: `/products/${p.slug}`,
      }));
    } else {
      const b = blogOptions.find((o) => o.slug === slug);
      if (!b) return;
      setForm((f) => ({
        ...f,
        title: b.title,
        body: b.excerpt || f.body,
        image: b.image || f.image,
        cta_text: b.kind === "video" ? "Watch now" : "Read more",
        cta_link: `/blog/${b.slug}`,
      }));
    }
  };
  const imageFileRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const getSignature = useServerFn(getCloudinaryUploadSignature);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Client-side validation before upload
    const { validateImageFile } = await import("@/lib/upload-validation");
    const err = await validateImageFile(file);
    if (err) {
      toast.error(err);
      if (imageFileRef.current) imageFileRef.current.value = "";
      return;
    }
    setUploadingImage(true);
    try {
      const sig = await getSignature({ data: { folder: "hero" } });
      if (!sig.ok) {
        toast.error(sig.message);
        setUploadingImage(false);
        return;
      }
      if (!sig.allowedFormatsParam) {
        toast.error("The upload policy could not be loaded. Please try again.");
        setUploadingImage(false);
        return;
      }
      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", sig.apiKey);
      formData.append("timestamp", String(sig.timestamp));
      formData.append("folder", sig.folder);
      formData.append("allowed_formats", sig.allowedFormatsParam);
      formData.append("signature", sig.signature);
      const res = await fetch(
        "https://api.cloudinary.com/v1_1/" + sig.cloudName + "/image/upload",
        { method: "POST", body: formData },
      );
      const result = await res.json();
      if (result.error) {
        toast.error(result.error.message);
      } else {
        setForm({ ...form, image: result.secure_url });
        toast.success("Image uploaded!");
      }
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    }
    setUploadingImage(false);
    if (imageFileRef.current) imageFileRef.current.value = "";
  };

  const load = async () => {
    setLoading(true);
    // The page component mounts twice (verified live), so the same request
    // would otherwise be issued twice concurrently. Same key joins it.
    const res = await joinInFlight("hero-slides", () => fetchSlides());
    setSlides(res.slides || []);
    setLoading(false);
  };

  const [categoryOptions, setCategoryOptions] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    load();
    // Authoritative ACTIVE DB categories drive the slide category selector.
    // Never free-text: stored values that no longer match an active category
    // still appear (marked inactive) so existing slides remain editable.
    joinInFlight("hero-slide-categories", () => adminListCategoriesForDashboard()).then(
      (res: any) => {
        const active = (res?.categories ?? []).map((c: any) => ({
          value: c.name,
          label: c.name,
        }));
        setCategoryOptions(active);
      },
      () => setCategoryOptions([]),
    );
  }, []);

  const openCreate = () => {
    setEditingSlide(null);
    setForm({
      eyebrow: "",
      title: "",
      body: "",
      price_context: "",
      category: "",
      cta_text: "Shop now",
      cta_link: "/shop",
      image: "",
      sort_order: slides.length,
      active: true,
    });
    setShowForm(true);
  };

  const openEdit = (slide: any) => {
    setEditingSlide(slide);
    const existing = parseHeroSourceLink(slide?.cta_link);
    setSourceType(existing ? existing.kind : "");
    setForm({
      eyebrow: slide.eyebrow || "",
      title: slide.title || "",
      body: slide.body || "",
      price_context: slide.price_context || "",
      category: slide.category || "",
      cta_text: slide.cta_text || "Shop now",
      cta_link: slide.cta_link || "/shop",
      image: slide.image || "",
      sort_order: slide.sort_order || 0,
      active: slide.active ?? true,
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.title) {
      toast.error("Title is required");
      return;
    }
    // §2/§4 guard: a product/blog-looking link must point at a valid source
    // from the picker, so a bound slide is never created with a dead link.
    // Whitespace-collapsed comparison keeps a stored slug that contains
    // spaces (e.g. "LG 34wp75c-b") usable — matching the resolver.
    const src = parseHeroSourceLink(form.cta_link);
    const collapsed = (s: string) => s.replace(/\s+/g, "");
    if (
      src?.kind === "product" &&
      !productOptions.some((o) => collapsed(o.slug) === collapsed(src.slug))
    ) {
      toast.error("Select a valid product from the list for this Shop Now link.");
      return;
    }
    if (
      src?.kind === "blog" &&
      !blogOptions.some((o) => collapsed(o.slug) === collapsed(src.slug))
    ) {
      toast.error("Select a valid blog post from the list for this Read More link.");
      return;
    }
    if (!src) {
      // Static/custom slide: destination must be a same-origin relative route
      // or https: (§7 scheme allowlist). The resolver enforces the same rule.
      const link = form.cta_link.trim();
      const safe = /^\/(?!\/)/.test(link) || /^https:\/\//i.test(link);
      if (!safe) {
        toast.error("Use an internal route (starting with /) or an https:// URL for the CTA link.");
        return;
      }
    }
    if (editingSlide) {
      const res = await updateSlide({ data: { slide_id: editingSlide.id, ...form } });
      if (res.ok) {
        toast.success("Slide updated");
        setShowForm(false);
        load();
      } else toast.error(res.message);
    } else {
      const res = await createSlide({ data: form });
      if (res.ok) {
        toast.success("Slide created");
        setShowForm(false);
        load();
      } else toast.error(res.message);
    }
  };

  // Optimistic toggle: non-financial, instantly reversible — flip UI first,
  // roll back on server rejection.
  const toggleActive = async (slide: any) => {
    const previous = slides;
    const nextActive = !slide.active;
    setSlides((current) =>
      current.map((s) => (s.id === slide.id ? { ...s, active: nextActive } : s)),
    );
    const res = await updateSlide({ data: { slide_id: slide.id, active: nextActive } });
    if (res.ok) {
      toast.success(nextActive ? "Slide activated" : "Slide deactivated");
    } else {
      setSlides(previous);
      toast.error(res.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this slide?")) return;
    const res = await deleteSlide({ data: { slide_id: id } });
    if (res.ok) {
      toast.success("Slide deleted");
      load();
    } else toast.error(res.message);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Hero Slides</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{slides.length} slides</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0891b2] text-white rounded-lg text-sm font-medium hover:opacity-90 transition"
        >
          <Plus className="h-4 w-4" /> Add Slide
        </button>
      </div>

      <HeroDiagnosticsPanel />

      {showForm && (
        <Card className="bg-white dark:bg-[#1a1a1e]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingSlide ? "Edit Slide" : "New Slide"}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Source binding (§2): pick PRODUCT or BLOG and choose the exact
                  record; title/CTA/destination derive from it. Leave on "Static
                  slide" for free-form content. */}
              <CustomSelect
                label="Source type"
                value={sourceType}
                onChange={(v) => setSourceType(v as "" | "product" | "blog")}
                placeholder="Static slide (no source binding)"
                options={[
                  { value: "product", label: "Product — derive from a product page" },
                  { value: "blog", label: "Blog post — derive from a blog page" },
                ]}
              />
              {sourceType === "product" && (
                <CustomSelect
                  label="Source product"
                  value={
                    parseHeroSourceLink(form.cta_link)?.kind === "product"
                      ? parseHeroSourceLink(form.cta_link)!.slug
                      : ""
                  }
                  onChange={(slug) => applySourceDefaults("product", slug)}
                  placeholder="Search products…"
                  searchable
                  options={productOptions.map((o) => ({
                    value: o.slug,
                    label: `${o.name} (${o.sku})`,
                  }))}
                />
              )}
              {sourceType === "blog" && (
                <CustomSelect
                  label="Source blog post"
                  value={
                    parseHeroSourceLink(form.cta_link)?.kind === "blog"
                      ? parseHeroSourceLink(form.cta_link)!.slug
                      : ""
                  }
                  onChange={(slug) => applySourceDefaults("blog", slug)}
                  placeholder="Search blog posts…"
                  searchable
                  options={blogOptions.map((o) => ({
                    value: o.slug,
                    label: `${o.kind === "video" ? "Video: " : "Article: "}${o.title}`,
                  }))}
                />
              )}
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                Eyebrow text
                <input
                  type="text"
                  value={form.eyebrow}
                  onChange={(e) => setForm({ ...form, eyebrow: e.target.value })}
                  placeholder="e.g. New arrival"
                  className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                Title *
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Main heading"
                  className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 sm:col-span-2">
                Body / Subtitle
                <textarea
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  rows={2}
                  placeholder="Subtitle text"
                  className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 resize-y"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 sm:col-span-2">
                Slide Image
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={form.image}
                    onChange={(e) => setForm({ ...form, image: e.target.value })}
                    placeholder="Upload or paste image URL"
                    className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                  <input
                    ref={imageFileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                  <button
                    type="button"
                    onClick={() => imageFileRef.current?.click()}
                    disabled={uploadingImage}
                    className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-[#0891b2] text-white text-sm font-medium hover:bg-[#0e7490] transition disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4" /> {uploadingImage ? "..." : "Upload"}
                  </button>
                </div>
                {form.image && (
                  <div className="mt-2">
                    <img
                      src={form.image}
                      alt="Preview"
                      className="h-28 w-48 rounded-lg object-cover border border-gray-200 dark:border-gray-700"
                    />
                  </div>
                )}
              </label>
              <CustomSelect
                label="Category"
                value={form.category}
                onChange={(v) => setForm({ ...form, category: v })}
                placeholder="Select active category"
                options={
                  form.category.trim() &&
                  !categoryOptions.some(
                    (o) => o.value.toLowerCase() === form.category.trim().toLowerCase(),
                  )
                    ? [
                        ...categoryOptions,
                        { value: form.category, label: `${form.category} (inactive)` },
                      ]
                    : categoryOptions
                }
              />
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                CTA Text
                <input
                  type="text"
                  value={form.cta_text}
                  onChange={(e) => setForm({ ...form, cta_text: e.target.value })}
                  className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                CTA Link
                <input
                  type="text"
                  value={form.cta_link}
                  onChange={(e) => setForm({ ...form, cta_link: e.target.value })}
                  className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
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
                  Active on frontend
                </label>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                onClick={handleSubmit}
                className="bg-[#0891b2] text-white hover:bg-[#0e7490] border-none font-medium"
              >
                {editingSlide ? "Update Slide" : "Create Slide"}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {slides.map((slide: any) => (
          <Card key={slide.id} className="bg-white dark:bg-[#0F0F12]">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className="h-12 w-20 shrink-0 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                    {slide.image ? (
                      <img src={slide.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-gray-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-blue-600 dark:text-blue-400 truncate">
                      {slide.eyebrow}
                    </p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white whitespace-pre-line truncate">
                      {slide.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {slide.category} • Order: {slide.sort_order}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <Badge
                    className={
                      slide.active
                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-gray-100 text-gray-600"
                    }
                  >
                    {slide.active ? (
                      <>
                        <Eye className="h-3 w-3 mr-1" /> Active
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-3 w-3 mr-1" /> Inactive
                      </>
                    )}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label={`Edit slide: ${slide.title || slide.id}`}
                    onClick={() => openEdit(slide)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label={slide.active ? "Deactivate slide" : "Activate slide"}
                    onClick={() => toggleActive(slide)}
                  >
                    {slide.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-red-500"
                    aria-label={`Delete slide: ${slide.title || slide.id}`}
                    onClick={() => handleDelete(slide.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {slides.length === 0 && !loading && (
          <Card className="bg-white dark:bg-[#0F0F12]">
            <CardContent className="p-8 text-center">
              <ImageIcon className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-900 dark:text-white">No hero slides</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Create your first slide to get started
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
