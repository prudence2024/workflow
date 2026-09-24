import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  FileText,
  Plus,
  Search,
  Edit,
  Trash2,
  ExternalLink,
  X,
  Video,
  Type,
  Upload,
  Image as ImageIcon,
} from "lucide-react";
import {
  adminListBlogPosts,
  adminCreateBlogPost,
  adminUpdateBlogPost,
  adminDeleteBlogPost,
} from "@/lib/admin/server-fns";
import { Pagination } from "@/components/admin/pagination";
import { joinInFlight } from "@/lib/in-flight-dedupe";
import { toast } from "sonner";
import { useRef } from "react";
import { getCloudinaryUploadSignature } from "@/lib/products-admin.server";

const searchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).catch(1),
  search: z.string().optional().default(""),
});

export const Route = createFileRoute("/dashboard/blog")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Blog — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: BlogPage,
});

const CATEGORIES_LIST = ["Buying guides", "Reviews", "Advice", "Gadgets", "How-to", "News"];

function BlogPage() {
  const { page: urlPage, search: urlSearch } = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard/blog" });
  const [search, setSearch] = useState(urlSearch || "");
  const [posts, setPosts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(urlPage || 1);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPost, setEditingPost] = useState<any>(null);
  const [form, setForm] = useState({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    category: "Buying guides",
    image: "",
    youtube_url: "",
    read_time: "5 min read",
    status: "draft" as "draft" | "published" | "archived",
    post_type: "text" as "text" | "video",
  });
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
      const sig = await getSignature({ data: { folder: "blogs" } });
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

  const fetchPosts = useServerFn(adminListBlogPosts);
  const createPost = useServerFn(adminCreateBlogPost);
  const updatePost = useServerFn(adminUpdateBlogPost);
  const deletePost = useServerFn(adminDeleteBlogPost);

  const load = async () => {
    setLoading(true);
    // The page component mounts twice (verified live), so the same request
    // would otherwise be issued twice concurrently. Same key joins it.
    const res = await joinInFlight(`blog-posts|${search}|${page}`, () =>
      fetchPosts({ data: { search, page, pageSize: 10 } }),
    );
    setPosts(res.posts || []);
    setTotal(res.total || 0);
    setLoading(false);
  };

  useEffect(() => {
    setPage(1);
    navigate({ search: { page: 1, search }, replace: true });
  }, [search]);
  useEffect(() => {
    if (page !== urlPage) navigate({ search: { page, search }, replace: true });
  }, [page]);
  useEffect(() => {
    load();
  }, [page, search]);

  const openCreate = () => {
    setEditingPost(null);
    setForm({
      title: "",
      slug: "",
      excerpt: "",
      content: "",
      category: "Buying guides",
      image: "",
      youtube_url: "",
      read_time: "5 min read",
      status: "draft",
      post_type: "text",
    });
    setShowForm(true);
  };

  const openEdit = (post: any) => {
    setEditingPost(post);
    setForm({
      title: post.title || "",
      slug: post.slug || "",
      excerpt: post.excerpt || "",
      content: (() => {
        try {
          const parsed = JSON.parse(post.content);
          if (Array.isArray(parsed))
            return parsed
              .map((b: any) => b.text || b)
              .join(String.fromCharCode(10) + String.fromCharCode(10));
        } catch {
          /* best-effort: use fallback */
        }
        return post.content || "";
      })(),
      category: post.category || "Buying guides",
      image: post.image || "",
      youtube_url: post.youtube_url || "",
      read_time: post.read_time || "5 min read",
      status: post.status || "draft",
      post_type: post.youtube_url ? "video" : "text",
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.title || !form.slug) {
      toast.error("Title and slug are required");
      return;
    }
    if (form.post_type === "video" && !form.youtube_url) {
      toast.error("Video URL is required for video posts");
      return;
    }

    const contentToSend = form.content.trim()
      ? JSON.stringify(
          form.content
            .split(String.fromCharCode(10) + String.fromCharCode(10))
            .filter(Boolean)
            .map((text: string) => ({ type: "paragraph", text: text.trim() })),
        )
      : "";
    if (editingPost) {
      const res = await updatePost({
        data: {
          post_id: editingPost.id,
          ...form,
          content: contentToSend,
          youtube_url: form.post_type === "video" ? form.youtube_url : undefined,
        },
      });
      if (res.ok) {
        toast.success("Post updated");
        setShowForm(false);
        load();
      } else toast.error(res.message);
    } else {
      const res = await createPost({
        data: {
          ...form,
          content: contentToSend,
          youtube_url: form.post_type === "video" ? form.youtube_url : undefined,
        },
      });
      if (res.ok) {
        toast.success("Post created");
        setShowForm(false);
        load();
      } else toast.error(res.message);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return;
    const res = await deletePost({ data: { post_id: id } });
    if (res.ok) {
      toast.success("Post deleted");
      load();
    } else toast.error(res.message);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Blog Posts</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{total} posts</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0891b2] text-white rounded-lg text-sm font-medium hover:opacity-90 transition"
        >
          <Plus className="h-4 w-4" /> New Post
        </button>
      </div>

      {showForm && (
        <Card className="bg-white dark:bg-[#1a1a1e]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingPost ? "Edit Post" : "New Post"}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mb-4 flex gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, post_type: "text" })}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${form.post_type === "text" ? "bg-[#0891b2] text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"}`}
              >
                <Type className="h-4 w-4" /> Text Post
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, post_type: "video" })}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${form.post_type === "video" ? "bg-[#0891b2] text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"}`}
              >
                <Video className="h-4 w-4" /> Video Post
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                Title
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    setForm({
                      ...form,
                      title,
                      slug: title
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/(^-|-$)/g, "")
                        .slice(0, 80),
                    });
                  }}
                  className="appearance-none px-3 py-2.5 pr-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                Slug
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
              <CustomSelect
                label="Category"
                value={form.category}
                onChange={(v) => setForm({ ...form, category: v })}
                options={CATEGORIES_LIST.map((c) => ({ value: c, label: c }))}
              />
              <CustomSelect
                label="Status"
                value={form.status}
                onChange={(v) => setForm({ ...form, status: v as any })}
                options={[
                  { value: "draft", label: "Draft" },
                  { value: "published", label: "Published" },
                  { value: "archived", label: "Archived" },
                ]}
              />
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                Featured Image
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
                    className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4" /> {uploadingImage ? "..." : "Upload"}
                  </button>
                </div>
                {form.image && (
                  <div className="mt-2">
                    <img
                      src={form.image}
                      alt="Preview"
                      className="h-24 w-40 rounded-lg object-cover border border-gray-200 dark:border-gray-700"
                    />
                  </div>
                )}
              </label>
              {form.post_type === "video" && (
                <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                  YouTube / Video URL
                  <input
                    type="url"
                    value={form.youtube_url}
                    onChange={(e) => setForm({ ...form, youtube_url: e.target.value })}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="appearance-none px-3 py-2.5 pr-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                </label>
              )}
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                Read Time
                <input
                  type="text"
                  value={form.read_time}
                  onChange={(e) => setForm({ ...form, read_time: e.target.value })}
                  placeholder="5 min read"
                  className="appearance-none px-3 py-2.5 pr-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 sm:col-span-2">
                Excerpt
                <input
                  type="text"
                  value={form.excerpt}
                  onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                  placeholder="Short description..."
                  className="appearance-none px-3 py-2.5 pr-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 sm:col-span-2">
                Content (Body)
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {form.content
                      ? form.content
                          .split(String.fromCharCode(10) + String.fromCharCode(10))
                          .filter(Boolean).length + " paragraph(s)"
                      : "0 paragraphs"}
                  </span>
                </div>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  rows={10}
                  placeholder="Paragraph 1

Paragraph 2

Paragraph 3"
                  className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 resize-y"
                />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                onClick={handleSubmit}
                className="bg-[#0891b2] hover:bg-[#0e7490] text-white border-none"
              >
                {editingPost ? "Update Post" : "Create Post"}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          aria-label="Search posts..."
          placeholder="Search posts..."
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
                    Title
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden sm:table-cell">
                    Type
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden sm:table-cell">
                    Category
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">
                    Status
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post: any) => (
                  <tr
                    key={post.id}
                    className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {post.title}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {post.read_time || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <Badge variant={post.youtube_url ? "default" : "outline"}>
                        {post.youtube_url ? (
                          <>
                            <Video className="h-3 w-3 mr-1" />
                            Video
                          </>
                        ) : (
                          <>
                            <Type className="h-3 w-3 mr-1" />
                            Text
                          </>
                        )}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <Badge variant="outline">{post.category || "—"}</Badge>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <Badge
                        className={
                          post.status === "published"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : post.status === "draft"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-gray-100 text-gray-600"
                        }
                      >
                        {post.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => openEdit(post)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-500"
                          onClick={() => handleDelete(post.id, post.title)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {posts.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-12 text-center text-gray-500 dark:text-gray-400"
                    >
                      <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">No blog posts found</p>
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
