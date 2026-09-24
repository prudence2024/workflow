import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Calendar, ExternalLink, Share2, Copy, Check, Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { OptimizedImage } from "@/components/optimized-image";
import { blogImage } from "@/lib/cloudinary-utils";
import { formatPostDate, getBlogPost } from "@/lib/content";

const siteUrl = (import.meta.env.VITE_SITE_URL || "https://diplomatglobal.com").replace(/\/+$/, "");

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params }) => {
    try {
      const { getPublicBlogPostBySlug: fetchPost } = await import("@/lib/admin/server-fns");
      const result = await fetchPost({ data: { slug: params.slug } });
      if (result.post) {
        const post = result.post;

        // Fetch only 4 latest posts for related section (current + 3 related)
        let relatedPosts: any[] = [];
        try {
          const { getPublicBlogPosts: fetchPosts } = await import("@/lib/admin/server-fns");
          const allPosts = await fetchPosts({ data: { page: 1, pageSize: 4 } });
          relatedPosts = (allPosts.posts || [])
            .filter((p: any) => p.slug !== post.slug)
            .slice(0, 3)
            .map((p: any) => ({
              slug: p.slug,
              title: p.title,
              excerpt: p.excerpt || "",
              image: p.image || "/content/blog/top-5-phones-under-200k.jpg",
              category: p.category || "News",
              date: p.published_at || p.created_at || "",
              isVideo: p.type === "video" || !!p.youtube_url,
            }));
        } catch {
          // Related posts are non-critical
        }

        return {
          post: {
            slug: post.slug,
            title: post.title,
            excerpt: post.excerpt || "",
            image: post.image || "/content/blog/top-5-phones-under-200k.jpg",
            category: post.category || "News",
            date: post.published_at || post.created_at || "",
            readTime: post.read_time || "5 min read",
            videoUrl: post.youtube_url || undefined,
            isVideo: post.type === "video" || !!post.youtube_url,
            content: (() => {
              try {
                const parsed = JSON.parse(post.content);
                if (Array.isArray(parsed)) return parsed.map((b: any) => b.text || String(b));
              } catch {
                /* not JSON */
              }
              return post.content ? [post.content] : [];
            })(),
          },
          relatedPosts,
        };
      }
    } catch (err) {
      console.error("[blog loader] DB fetch failed:", err);
    }
    const staticPost = getBlogPost(params.slug);
    if (staticPost)
      return {
        post: {
          ...staticPost,
          isVideo: !!staticPost.videoUrl,
        },
        relatedPosts: [],
      };
    throw notFound();
  },
  head: ({ loaderData }) => {
    const post = loaderData?.post;
    if (!post) return { meta: [{ title: "Post not found" }] };
    const url = `${siteUrl}/blog/${post.slug}`;
    const image = post.image?.startsWith("http") ? post.image : new URL(post.image, siteUrl).href;
    return {
      meta: [
        { title: `${post.title} — Diplomat Global` },
        { name: "description", content: post.excerpt },
        { property: "og:title", content: post.title },
        { property: "og:description", content: post.excerpt },
        { property: "og:type", content: "article" },
        { property: "og:image", content: image },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: post.title },
        { name: "twitter:description", content: post.excerpt },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.title,
            description: post.excerpt,
            image,
            url,
            author: { "@type": "Organization", name: "Diplomat Global" },
            publisher: { "@type": "Organization", name: "Diplomat Global" },
            datePublished: post.date,
            dateModified: post.date,
          }),
        },
      ],
    };
  },
  component: BlogDetail,
});

/* ─── Share Buttons ─── */

function ShareButtons({ title, excerpt, url }: { title: string; excerpt: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const text = `${title}${excerpt ? " — " + excerpt : ""}`;

  const share = (platform: string) => {
    const encodedUrl = encodeURIComponent(url);
    const encodedText = encodeURIComponent(text);
    const links: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
      twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    };
    window.open(links[platform], "_blank", "noopener,noreferrer");
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <Share2 size={14} /> Share:
      </span>
      <button
        onClick={() => share("whatsapp")}
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#25D366] text-white transition-transform hover:scale-110"
        aria-label="Share on WhatsApp"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      </button>
      <button
        onClick={() => share("twitter")}
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground/10 text-foreground transition-transform hover:scale-110"
        aria-label="Share on X"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </button>
      <button
        onClick={() => share("facebook")}
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1877F2] text-white transition-transform hover:scale-110"
        aria-label="Share on Facebook"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      </button>
      <button
        onClick={copyLink}
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-foreground transition-transform hover:scale-110"
        aria-label="Copy link"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

/* ─── Related Post Card ─── */

function RelatedPostCard({
  slug,
  title,
  image,
  category,
  date,
  isVideo,
}: {
  slug: string;
  title: string;
  image: string;
  category: string;
  date: string;
  isVideo: boolean;
}) {
  return (
    <Link
      to="/blog/$slug"
      params={{ slug }}
      className="group block overflow-hidden rounded-xl border border-border bg-card transition hover:border-brand/40"
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <OptimizedImage
          src={blogImage(image)}
          alt={title}
          aspectRatio="16/10"
          className="transition group-hover:scale-105"
        />
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90">
              <Play size={16} className="ml-0.5 text-foreground" />
            </div>
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand">
            {category}
          </span>
          {date && <span className="text-xs text-muted-foreground">· {formatPostDate(date)}</span>}
        </div>
        <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug transition group-hover:text-brand">
          {title}
        </h3>
      </div>
    </Link>
  );
}

/* ─── Blog Detail ─── */

function BlogDetail() {
  const { post, relatedPosts } = Route.useLoaderData();
  const url = `${siteUrl}/blog/${post.slug}`;
  const image = post.image?.startsWith("http") ? post.image : new URL(post.image, siteUrl).href;
  const isVideo = post.isVideo;

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />

      <main className="mx-auto max-w-4xl px-5 pt-8 pb-20 sm:px-6 md:pt-14">
        {/* Back link */}
        <Link
          to="/blog"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-ink"
        >
          <ArrowLeft className="size-4" /> Back to blog
        </Link>

        <article className="mt-6">
          {/* Featured image / video cover */}
          {post.image && (
            <div className="relative overflow-hidden rounded-2xl">
              <OptimizedImage
                src={image}
                alt={post.title}
                className="aspect-[16/9] w-full object-cover"
                priority
                aspectRatio="16/9"
              />
              {isVideo && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/90 shadow-lg transition hover:scale-105">
                    <Play size={28} className="ml-1 text-white" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Category + date */}
          <div className="mt-6 flex items-center gap-3">
            <span className="rounded-full bg-brand/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-brand">
              {post.category}
            </span>
            {isVideo && (
              <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-red-500">
                <Play className="h-2.5 w-2.5" /> Video
              </span>
            )}
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              {formatPostDate(post.date)}
            </span>
          </div>

          {/* Title */}
          <h1 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
            {post.title}
          </h1>

          {/* Share buttons */}
          <div className="mt-5 max-w-[680px]">
            <ShareButtons title={post.title} excerpt={post.excerpt} url={url} />
          </div>

          {/* Excerpt */}
          {post.excerpt && (
            <p className="mt-6 max-w-[680px] text-lg leading-relaxed text-muted-foreground">
              {post.excerpt}
            </p>
          )}

          {/* Content — reading container */}
          <div className="mt-8 max-w-[680px]">
            {/* Video post: Watch CTA */}
            {isVideo && post.videoUrl && (
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <a
                  href={post.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-4 p-6 transition hover:bg-surface"
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand text-white transition group-hover:scale-105">
                    <ExternalLink size={22} />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Watch the full video</p>
                    <p className="text-sm text-muted-foreground">Opens in a new tab</p>
                  </div>
                </a>
              </div>
            )}

            {/* Text post: Article body */}
            {!isVideo && post.content?.length > 0 && (
              <div className="space-y-5 text-base leading-relaxed text-muted-foreground">
                {post.content.map((paragraph: string, i: number) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
            )}

            {/* Fallback if no content */}
            {!isVideo && (!post.content || post.content.length === 0) && post.excerpt && (
              <p className="text-base leading-relaxed text-muted-foreground">{post.excerpt}</p>
            )}
          </div>
        </article>

        {/* Related articles */}
        {relatedPosts && relatedPosts.length > 0 && (
          <section className="mt-16 border-t border-border/60 pt-10">
            <h2 className="font-display text-xl font-semibold tracking-tight">Latest articles</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {relatedPosts.map(
                (rp: {
                  slug: string;
                  title: string;
                  image: string;
                  category: string;
                  date: string;
                  isVideo: boolean;
                }) => (
                  <RelatedPostCard key={rp.slug} {...rp} />
                ),
              )}
            </div>
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
