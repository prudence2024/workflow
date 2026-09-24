import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { BlogPostSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect } from "react";
import { Calendar, Play, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { OptimizedImage } from "@/components/optimized-image";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { z } from "zod";
import { blogImage } from "@/lib/cloudinary-utils";
import { formatPostDate } from "@/lib/content";
import { RESILIENCE_COPY, createLkgCache, failureCopy } from "@/lib/public-resilience";

const PAGE_SIZE = 10;

const searchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).catch(1),
});

function BlogSkeletonGrid() {
  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <Skeleton className="mx-auto h-10 w-28" />
          <Skeleton className="mx-auto mt-4 h-5 w-80 max-w-full" />
        </div>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <BlogPostSkeleton key={i} />
          ))}
        </div>
      </main>
    </div>
  );
}

export const Route = createFileRoute("/blog/")({
  validateSearch: searchSchema,
  pendingComponent: () => <BlogSkeletonGrid />,
  head: () => ({
    meta: [
      { title: "Tech guides & reviews — Diplomat Global" },
      {
        name: "description",
        content:
          "Practical product reviews, buying guides and technology advice for Nigerian buyers.",
      },
    ],
  }),
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: async ({ deps }) => {
    const page = deps.page;
    try {
      const { getPublicBlogPosts } = await import("@/lib/admin/server-fns");
      const result = await getPublicBlogPosts({ data: { page, pageSize: PAGE_SIZE } });
      if (result.posts) {
        return {
          posts: result.posts.map((p: any) => ({
            slug: p.slug,
            title: p.title,
            excerpt: p.excerpt || "",
            // Missing image → empty string → OptimizedImage branded fallback.
            // Never substitute a static sample asset that may not exist.
            image: p.image || "",
            category: p.category || "News",
            date: p.published_at || p.created_at || "",
            readTime: p.read_time || "5 min read",
            watchTime: p.youtube_url ? "Watch" : undefined,
            videoUrl: p.youtube_url || undefined,
            content: p.content ? [p.content] : [],
          })),
          total: result.total ?? 0,
          page: result.page ?? page,
          totalPages: result.totalPages ?? 1,
        };
      }
    } catch (err) {
      console.error("[blog loader] DB fetch failed:", err);
      return { posts: [], total: 0, page: 1, totalPages: 1, loadError: failureCopy(err) };
    }
    return {
      posts: [],
      total: 0,
      page: 1,
      totalPages: 1,
      loadError: RESILIENCE_COPY.contentUnavailable,
    };
  },
  component: BlogIndex,
});

/** Last-known-good blog pages, keyed by page number. */
const blogLkg = createLkgCache<{
  posts: {
    slug: string;
    title: string;
    excerpt: string;
    image: string;
    category: string;
    date: string;
    readTime: string;
    watchTime?: string;
    videoUrl?: string;
    content: string[];
  }[];
  total: number;
  page: number;
  totalPages: number;
  loadError?: string;
}>();

function BlogIndex() {
  const loaderData = Route.useLoaderData();
  // Last-known-good: a failed revalidation keeps the previous successful
  // blog page visible instead of wiping the grid.
  const cached = blogLkg.get(`page=${loaderData.page}`);
  const failed = Boolean(loaderData.loadError);
  const effective = failed && cached ? cached : loaderData;
  useEffect(() => {
    if (!failed) blogLkg.set(`page=${loaderData.page}`, loaderData);
  }, [failed, loaderData]);
  const { posts, total, page, totalPages, loadError } = effective;
  const router = useRouter();
  const navigate = useNavigate();

  const getVisiblePages = (): (number | "...")[] => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">Blog</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Tech guides, reviews and buying advice for Nigerian buyers.
          </p>
        </div>

        {posts.length > 0 && loadError ? (
          <div
            className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
            role="alert"
          >
            <span>{RESILIENCE_COPY.stale}</span>
            <button
              type="button"
              onClick={() => void router.invalidate()}
              className="inline-flex min-h-9 items-center rounded-lg border border-destructive/40 bg-card px-3 text-xs font-semibold text-foreground transition hover:border-brand"
            >
              {RESILIENCE_COPY.retry}
            </button>
          </div>
        ) : null}
        {posts.length > 0 ? (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post: any) => (
              <Link
                key={post.slug}
                to="/blog/$slug"
                params={{ slug: post.slug }}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:shadow-md"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  <OptimizedImage
                    src={blogImage(post.image)}
                    alt={post.title}
                    aspectRatio="16/10"
                    className="transition group-hover:scale-105"
                  />
                  {post.videoUrl && (
                    <div
                      className="absolute inset-0 flex items-center justify-center bg-black/40"
                      aria-label="Video post"
                    >
                      <Play aria-hidden="true" className="h-12 w-12 text-white" />
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full bg-brand/10 px-2.5 py-0.5 font-medium text-brand">
                      {post.category}
                    </span>
                    <Calendar className="h-3 w-3" />
                    <span>{post.date ? formatPostDate(post.date) : "Draft"}</span>
                  </div>
                  <h3 className="mt-3 line-clamp-2 text-lg font-semibold leading-snug text-foreground group-hover:text-brand transition">
                    {post.title}
                  </h3>
                  {post.excerpt && (
                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                      {post.excerpt}
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    {post.videoUrl ? (
                      <Play aria-hidden="true" className="h-3 w-3" />
                    ) : (
                      <FileText aria-hidden="true" className="h-3 w-3" />
                    )}
                    <span>{post.videoUrl ? post.watchTime || "Watch" : post.readTime}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : loadError ? (
          <div
            className="rounded-2xl border border-dashed border-destructive/40 py-16 text-center px-6"
            role="alert"
          >
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">{loadError}</p>
            <p className="text-sm mt-1">This is a loading problem, not an empty blog.</p>
            <button
              type="button"
              onClick={() => void router.invalidate()}
              className="mt-6 inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-5 text-sm font-semibold transition hover:border-brand"
            >
              {RESILIENCE_COPY.retry}
            </button>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No blog posts yet</p>
            <p className="text-sm mt-1">Check back soon for guides and reviews.</p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <nav
            className="mt-12 flex items-center justify-center gap-1"
            aria-label="Blog pagination"
          >
            <button
              onClick={() => navigate({ search: { page: page - 1 } as any })}
              disabled={page <= 1}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {getVisiblePages().map((p, i) =>
              p === "..." ? (
                <span key={`dots-${i}`} className="px-2 text-gray-400">
                  ...
                </span>
              ) : (
                <button
                  key={p}
                  onClick={() => navigate({ search: { page: p } as any })}
                  className={`min-w-[2rem] h-8 rounded-lg text-sm font-medium transition ${
                    p === page
                      ? "bg-brand text-white"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  {p}
                </button>
              ),
            )}
            <button
              onClick={() => navigate({ search: { page: page + 1 } as any })}
              disabled={page >= totalPages}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </nav>
        )}

        {total > 0 && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Showing {Math.min((page - 1) * PAGE_SIZE + 1, total)}–
            {Math.min(page * PAGE_SIZE, total)} of {total} posts
          </p>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
