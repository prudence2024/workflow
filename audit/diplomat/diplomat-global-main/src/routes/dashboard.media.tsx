import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Camera, Upload, Trash2, Search, ExternalLink, Copy, Check } from "lucide-react";
import { adminListMedia, adminDeleteMedia } from "@/lib/admin/server-fns";
import { getCloudinaryUploadSignature } from "@/lib/products-admin.server";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/media")({
  head: () => ({
    meta: [
      { title: "Media — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: MediaPage,
});

function MediaPage() {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // §10: server-backed Cloudinary cursor pagination — one bounded page per
  // request, never the whole collection.
  const PAGE_SIZE = 30;
  const [pageCursors, setPageCursors] = useState<string[]>([]); // next_cursor per loaded page
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const listMedia = useServerFn(adminListMedia);
  const deleteMedia = useServerFn(adminDeleteMedia);
  const getSignature = useServerFn(getCloudinaryUploadSignature);

  // In-flight dedupe: the media page's mount/search effect can fire twice in a
  // row (dev double-invoke), which the live audit captured as two concurrent
  // identical adminListMedia calls. A repeated request for the SAME page joins
  // the request already in flight instead of issuing a second one.
  const inFlight = useRef<{ key: string; promise: Promise<void> } | null>(null);

  const load = async (opts?: { targetPage?: number }) => {
    const target = opts?.targetPage ?? page;
    const key = `${target}|${search}`;
    if (inFlight.current && inFlight.current.key === key) return inFlight.current.promise;
    const run = doLoad(target);
    inFlight.current = { key, promise: run };
    try {
      await run;
    } finally {
      if (inFlight.current && inFlight.current.key === key) inFlight.current = null;
    }
  };

  const doLoad = async (target: number) => {
    setLoading(true);
    // cursor to SEND for the target page: page 1 sends none; page N sends the
    // next_cursor recorded when page N-1 was loaded.
    const sendCursor = target > 1 ? pageCursors[target - 2] : undefined;
    const res = await listMedia({
      data: {
        search: search || undefined,
        pageSize: PAGE_SIZE,
        cursor: sendCursor,
      },
    });
    setAssets(res.assets || []);
    if (!res.error) {
      setPageCursors((prev) => {
        const next = [...prev];
        next[target - 1] = res.nextCursor ?? "";
        return next;
      });
      setHasNext(Boolean(res.nextCursor));
      setPage(target);
    }
    setError(res.error || null);
    setLoading(false);
  };

  useEffect(() => {
    // A changed search must restart at page 1. Page N's cursor was issued for
    // the previous, differently-filtered result set, so carrying it forward is
    // a stale keyset that returns the wrong slice (verified live: searching
    // while on Page 2 re-sent Page 2 and left the indicator on Page 2).
    setPage(1);
    setPageCursors([]);
    load({ targetPage: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const goToPage = (p: number) => {
    if (p < 1 || p === page || loading) return;
    if (p > 1 && !pageCursors[p - 2]) return; // can't skip into unloaded ranges
    load({ targetPage: p });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side format check (server enforcement is in the signed upload)
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Only JPG, PNG, and WebP images are allowed.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    // Client-side size check (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 5MB.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const sig = await getSignature({ data: { folder: "media" } });
      if (!sig.ok) {
        toast.error(sig.message);
        setUploading(false);
        return;
      }
      if (!sig.allowedFormatsParam) {
        toast.error("The upload policy could not be loaded. Please try again.");
        setUploading(false);
        return;
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", sig.apiKey);
      formData.append("timestamp", String(sig.timestamp));
      formData.append("folder", sig.folder);
      formData.append("allowed_formats", sig.allowedFormatsParam);
      formData.append("signature", sig.signature);
      formData.append("resource_type", "image");

      const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, {
        method: "POST",
        body: formData,
      });
      const result = await res.json();
      if (result.error) {
        toast.error(result.error.message);
      } else {
        toast.success("Image uploaded!");
        load();
      }
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDelete = async (publicId: string) => {
    if (!confirm("Delete this media?")) return;
    const res = await deleteMedia({ data: { public_id: publicId } });
    if (res.ok) {
      toast.success("Deleted");
      setSelectedAsset(null);
      load();
    } else toast.error(res.message);
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Media Library</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Page {page}
            {hasNext ? "+" : ""} • {assets.length} files • Cloudinary storage
          </p>
        </div>
        <div className="flex gap-2 mt-4 sm:mt-0">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Upload className="h-4 w-4 mr-2" /> {uploading ? "Uploading..." : "Upload"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-sm text-amber-800 dark:text-amber-300 flex items-center justify-between gap-3">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => load()}>
            Retry
          </Button>
        </div>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          aria-label="Search media..."
          placeholder="Search media..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {assets.map((asset: any) => (
          <div
            key={asset.public_id}
            className={`group relative rounded-lg border overflow-hidden cursor-pointer transition-all ${selectedAsset?.public_id === asset.public_id ? "border-blue-500 ring-2 ring-blue-500/20" : "border-gray-200 dark:border-gray-700 hover:border-gray-400"}`}
            onClick={() => setSelectedAsset(asset)}
          >
            <div className="aspect-square bg-gray-100 dark:bg-gray-800">
              <img
                src={asset.secure_url}
                alt={asset.context?.alt || asset.public_id.split("/").pop()}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <p className="text-xs text-white truncate">{asset.public_id.split("/").pop()}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="col-span-full text-center py-12 text-sm text-gray-500 dark:text-gray-400">
            Loading media…
          </div>
        )}
        {assets.length === 0 && !loading && !error && (
          <div className="col-span-full text-center py-12">
            <Camera className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-900 dark:text-white">No media uploaded</p>
            <p className="text-xs text-gray-500 mt-1">Upload images to Cloudinary from here</p>
          </div>
        )}
      </div>

      {/* §10: server-backed pagination — Next fetches the following bounded
          page from Cloudinary via cursor; Previous re-fetches from the last
          recorded cursor. The whole collection is never loaded. */}
      {(page > 1 || hasNext) && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => goToPage(page - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
            Page {page}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasNext || loading}
            onClick={() => goToPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* Asset Detail Panel */}
      {selectedAsset && (
        <Card className="bg-white dark:bg-[#1a1a1e] border-gray-200 dark:border-[#2a2a2e]">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="w-full sm:w-48 h-48 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                <img src={selectedAsset.secure_url} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 space-y-2">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">Asset Details</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <span className="text-gray-500">Public ID</span>
                  <span className="text-gray-900 dark:text-white font-mono truncate">
                    {selectedAsset.public_id}
                  </span>
                  <span className="text-gray-500">Format</span>
                  <span className="text-gray-900 dark:text-white">{selectedAsset.format}</span>
                  <span className="text-gray-500">Size</span>
                  <span className="text-gray-900 dark:text-white">
                    {(selectedAsset.bytes / 1024).toFixed(1)} KB
                  </span>
                  <span className="text-gray-500">Dimensions</span>
                  <span className="text-gray-900 dark:text-white">
                    {selectedAsset.width} × {selectedAsset.height}
                  </span>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyUrl(selectedAsset.secure_url)}
                  >
                    {copiedUrl === selectedAsset.secure_url ? (
                      <Check className="h-3 w-3 mr-1" />
                    ) : (
                      <Copy className="h-3 w-3 mr-1" />
                    )}
                    {copiedUrl === selectedAsset.secure_url ? "Copied" : "Copy URL"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(selectedAsset.secure_url, "_blank")}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" /> Open
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => handleDelete(selectedAsset.public_id)}
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Delete
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
