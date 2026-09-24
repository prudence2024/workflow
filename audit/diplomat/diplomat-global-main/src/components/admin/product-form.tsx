"use client";

import { useState, useEffect, useRef } from "react";
import { X, Plus, Trash2, Upload, Image as ImageIcon } from "lucide-react";
import { CustomSelect } from "@/components/ui/custom-select";
import { useServerFn } from "@tanstack/react-start";
import {
  adminCreateProduct,
  adminUpdateProduct,
  adminListCategories,
  getCloudinaryUploadSignature,
  reportCloudinaryUploadFailure,
  verifyCloudinaryImageUpload,
} from "@/lib/products-admin.server";

interface ProductFormProps {
  mode: "create" | "edit";
  product?: any;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}

interface UploadedImage {
  cloudinary_public_id: string;
  secure_url: string;
  width: number;
  height: number;
  alt_text: string;
  sort_order: number;
}

export function ProductForm({ mode, product, onClose, onSuccess }: ProductFormProps) {
  const createProduct = useServerFn(adminCreateProduct);
  const updateProduct = useServerFn(adminUpdateProduct);
  const listCategories = useServerFn(adminListCategories);
  const getUploadSignature = useServerFn(getCloudinaryUploadSignature);
  const verifyUpload = useServerFn(verifyCloudinaryImageUpload);

  const [categories, setCategories] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: product?.name || "",
    slug: product?.slug || "",
    sku: product?.sku || "",
    tagline: product?.tagline || "",
    description: product?.description || "",
    category_id: product?.category_id || "",
    price: product?.price != null ? String(product.price) : "",
    compare_at_price: product?.compare_at_price != null ? String(product.compare_at_price) : "",
    condition: product?.condition || "new",
    status: product?.status || "draft",
    featured: product?.featured || false,
    is_new: product?.is_new || false,
    in_stock: product?.in_stock ?? true,
  });

  // Stock state lives on the authoritative inventory row. In create mode the
  // admin sets the opening quantity; in edit mode both fields are prefilled
  // from the existing row.
  const inventoryRow = Array.isArray(product?.inventory)
    ? product?.inventory?.[0]
    : product?.inventory;
  const [quantity, setQuantity] = useState(
    inventoryRow?.quantity != null ? String(inventoryRow.quantity) : "0",
  );
  const [lowStockThreshold, setLowStockThreshold] = useState(
    inventoryRow?.low_stock_threshold != null ? String(inventoryRow.low_stock_threshold) : "",
  );

  const [specs, setSpecs] = useState<Array<{ label: string; value: string }>>(
    product?.specifications
      ? typeof product.specifications === "string"
        ? JSON.parse(product.specifications)
        : product.specifications
      : [],
  );

  const [images, setImages] = useState<UploadedImage[]>(
    product?.product_images?.map((img: any) => ({
      cloudinary_public_id: img.cloudinary_public_id,
      secure_url: img.secure_url,
      width: img.width || 0,
      height: img.height || 0,
      alt_text: img.alt_text || "",
      sort_order: img.sort_order || 0,
    })) || [],
  );

  useEffect(() => {
    listCategories().then((res) => setCategories(res.categories || []));
  }, []);

  const addSpec = () => setSpecs([...specs, { label: "", value: "" }]);
  const removeSpec = (i: number) => setSpecs(specs.filter((_, idx) => idx !== i));
  const updateSpec = (i: number, field: "label" | "value", val: string) => {
    const next = [...specs];
    next[i] = { ...next[i], [field]: val };
    setSpecs(next);
  };

  const generateSlug = (name: string) =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  const parseStockValue = (value: string, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    // Validate all files before starting upload using shared utility
    const { validateImageFiles } = await import("@/lib/upload-validation");
    const { errors, validFiles } = await validateImageFiles(files);
    if (errors.length > 0) {
      setError(errors.join(" "));
      e.target.value = "";
      return;
    }
    if (validFiles.length === 0) return;

    setUploading(true);
    setError("");

    try {
      // The signed provider allowlist is authoritative for format. Browser
      // validation remains an early, friendly failure path.
      const sig = await getUploadSignature();
      if (!sig.ok) {
        setError(sig.message);
        return;
      }
      if (!sig.allowedFormatsParam) {
        setError("The upload policy could not be loaded. Please try again.");
        return;
      }

      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        const formData = new FormData();
        formData.append("file", file);
        formData.append("api_key", sig.apiKey);
        formData.append("timestamp", String(sig.timestamp));
        formData.append("folder", sig.folder);
        formData.append("allowed_formats", sig.allowedFormatsParam);
        formData.append("signature", sig.signature);

        const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "unknown error");
          setError(`Failed to upload ${file.name}`);
          try {
            await reportCloudinaryUploadFailure({
              data: {
                context: `product ${file.name}`,
                reason: `${res.status}: ${errText.slice(0, 200)}`,
              },
            });
          } catch {
            /* upload failure reporting is best-effort */
          }
          continue;
        }

        const providerData = await res.json();
        const verification = await verifyUpload({
          data: { folder: "products", publicId: providerData.public_id },
        });
        if (!verification.ok) {
          setError(verification.message);
          continue;
        }
        const data = verification.asset;
        setImages((prev) => [
          ...prev,
          {
            cloudinary_public_id: data.publicId,
            secure_url: data.secureUrl,
            width: data.width,
            height: data.height,
            alt_text: "",
            sort_order: prev.length,
          },
        ]);
      }
    } catch (err: any) {
      setError("Image upload failed. Please try again.");
      try {
        await reportCloudinaryUploadFailure({
          data: { context: "product image batch", reason: err?.message || "unknown" },
        });
      } catch {
        /* upload failure reporting is best-effort */
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setImages(next.map((img, i) => ({ ...img, sort_order: i })));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.price) {
      setError("Name and price are required.");
      return;
    }
    setSubmitting(true);
    setError("");

    const slug = form.slug || generateSlug(form.name);
    // Server handles SKU generation/validation
    const payload = {
      ...form,
      sku: form.sku.trim() || "",
      slug,
      price: Number(form.price),
      compare_at_price: form.compare_at_price ? Number(form.compare_at_price) : null,
      category_id: form.category_id || null,
      specifications: specs.filter((s) => s.label && s.value),
      quantity:
        mode === "edit" && quantity === String(inventoryRow?.quantity ?? 0)
          ? undefined
          : parseStockValue(quantity, 0),
      low_stock_threshold:
        mode === "edit" && lowStockThreshold === String(inventoryRow?.low_stock_threshold ?? "")
          ? undefined
          : lowStockThreshold.trim() === ""
            ? null
            : parseStockValue(lowStockThreshold, 0),
      images,
    };

    try {
      const result =
        mode === "create"
          ? await createProduct({ data: payload })
          : await updateProduct({ data: { ...payload, product_id: product.id } });

      if (result.ok) {
        await onSuccess();
      } else {
        setError(result.message);
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-canvas p-6 shadow-xl ring-1 ring-border max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-xl font-semibold">
            {mode === "create" ? "Add Product" : "Edit Product"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-surface transition"
          >
            <X className="size-5 text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Images */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Product Images</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-xs text-brand hover:underline flex items-center gap-1"
              >
                <Upload className="size-3" />
                {uploading ? "Uploading…" : "Upload Image"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>
            {images.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {images.map((img, i) => (
                  <div
                    key={i}
                    className="relative group rounded-lg overflow-hidden bg-surface ring-1 ring-border"
                  >
                    <img
                      src={img.secure_url}
                      alt={img.alt_text}
                      className="aspect-square w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                      {i > 0 && (
                        <button
                          type="button"
                          onClick={() => moveImage(i, i - 1)}
                          className="p-1 bg-white/20 rounded text-white text-xs"
                        >
                          ←
                        </button>
                      )}
                      {i < images.length - 1 && (
                        <button
                          type="button"
                          onClick={() => moveImage(i, i + 1)}
                          className="p-1 bg-white/20 rounded text-white text-xs"
                        >
                          →
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="p-1 bg-red-500/80 rounded text-white text-xs"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="flex flex-col items-center justify-center py-8 rounded-lg border-2 border-dashed border-border bg-surface/50 cursor-pointer hover:border-brand/50 transition"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon className="size-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Click to upload images</p>
                <p className="text-xs text-muted-foreground/60 mt-1">PNG, JPG up to 5MB</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
              Product Name *
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="min-h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Slug
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="auto-generated"
                className="min-h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              SKU
              <input
                type="text"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })}
                placeholder={mode === "create" ? "Auto-generated if blank" : ""}
                className="min-h-10 rounded-xl border border-border bg-surface px-3 text-sm font-mono outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
              <span className="text-xs text-muted-foreground">
                Format: DG-[CODE]-SN[NUMBER], e.g. DG-CMP-SN10
              </span>
            </label>
          </div>

          <label className="grid gap-1.5 text-sm font-medium">
            Tagline
            <input
              type="text"
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              className="min-h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          </label>

          <label className="grid gap-1.5 text-sm font-medium">
            Description
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 resize-none"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CustomSelect
              label="Category"
              value={form.category_id}
              onChange={(v) => setForm({ ...form, category_id: v })}
              options={[
                { value: "", label: "None" },
                ...categories.map((c: any) => ({ value: c.id, label: c.name })),
              ]}
              placeholder="Select category"
              searchable
            />
            <CustomSelect
              label="Status"
              value={form.status}
              onChange={(v) => setForm({ ...form, status: v as any })}
              options={[
                { value: "draft", label: "Draft" },
                { value: "active", label: "Active" },
                { value: "archived", label: "Archived" },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="grid gap-1.5 text-sm font-medium">
              Price (₦) *
              <input
                type="text"
                required
                inputMode="numeric"
                placeholder="Enter price"
                value={form.price}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.]/g, "");
                  if (v === "" || !isNaN(Number(v))) setForm({ ...form, price: v });
                }}
                className="min-h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Compare at (₦)
              <input
                type="text"
                inputMode="numeric"
                placeholder="Optional"
                value={form.compare_at_price}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.]/g, "");
                  if (v === "" || !isNaN(Number(v))) setForm({ ...form, compare_at_price: v });
                }}
                className="min-h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </label>
            <CustomSelect
              label="Condition"
              value={form.condition}
              onChange={(v) => setForm({ ...form, condition: v as any })}
              options={[
                { value: "new", label: "New" },
                { value: "refurbished", label: "Refurbished" },
                { value: "used", label: "Used" },
              ]}
            />
          </div>

          {/* Authoritative stock state (inventory row) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm font-medium">
              Stock Available (Quantity)
              <input
                type="text"
                inputMode="numeric"
                required
                value={quantity}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  setQuantity(v);
                }}
                className="min-h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
              <span className="text-xs text-muted-foreground">
                Total units on hand. Reserved units are subtracted from public availability.
              </span>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Low Stock Threshold
              <input
                type="text"
                inputMode="numeric"
                placeholder="Use Settings default"
                value={lowStockThreshold}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  setLowStockThreshold(v);
                }}
                className="min-h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
              <span className="text-xs text-muted-foreground">
                Leave blank to save the current Settings default. A saved value, including 0,
                overrides Settings. Alerts follow the Settings toggle.
              </span>
            </label>
          </div>

          {/* Checkboxes */}
          <div className="flex gap-5 text-sm">
            {[
              ["featured", "Featured"],
              ["is_new", "New"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(form as any)[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                  className="accent-[color:var(--brand)]"
                />
                {label}
              </label>
            ))}
          </div>

          {/* Specifications */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Specifications</span>
              <button
                type="button"
                onClick={addSpec}
                className="text-xs text-brand hover:underline flex items-center gap-1"
              >
                <Plus className="size-3" /> Add
              </button>
            </div>
            {specs.map((spec, i) => (
              <div key={i} className="flex flex-col sm:flex-row gap-2 mb-2">
                <input
                  type="text"
                  value={spec.label}
                  onChange={(e) => updateSpec(i, "label", e.target.value)}
                  placeholder="Label"
                  className="flex-1 min-h-9 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand"
                />
                <input
                  type="text"
                  value={spec.value}
                  onChange={(e) => updateSpec(i, "value", e.target.value)}
                  placeholder="Value"
                  className="flex-1 min-h-9 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand"
                />
                <button
                  type="button"
                  onClick={() => removeSpec(i)}
                  className="p-1.5 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 min-h-11 rounded-xl bg-inverse px-5 text-sm font-semibold text-inverse-foreground transition hover:bg-brand hover:text-brand-foreground disabled:opacity-50"
            >
              {submitting ? "Saving…" : mode === "create" ? "Create Product" : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-xl border border-border px-5 text-sm font-semibold hover:bg-surface transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
