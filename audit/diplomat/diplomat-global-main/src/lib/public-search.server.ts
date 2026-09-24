// Server-only site-wide public search.
//
// One canonical bounded server function queries every public source in
// parallel; each source fails independently (Phase 4.5 isolation), and only
// published/active public rows are ever returned. Internal DB fields are not
// exposed — every row passes through the pure mappers in public-search.ts.

import { createServerFn } from "@tanstack/react-start";
import {
  LIMITS,
  NAV_SEARCH_ENTRIES,
  mapBlogRows,
  mapCategoryRows,
  mapProductRows,
  matchNavEntries,
  normalizeQuery,
  isSearchableQuery,
  toLikePattern,
  extractPageEntries,
  type GlobalSearchResult,
} from "./public-search";

export const globalPublicSearch = createServerFn({ method: "GET" })
  .validator((q: string) => q)
  .handler(
    async ({
      data: rawQuery,
    }): Promise<{
      results: GlobalSearchResult[];
      partial: boolean;
      query: string;
    }> => {
      const q = normalizeQuery(rawQuery);
      if (!isSearchableQuery(q)) return { results: [], partial: false, query: q };

      const { createDatabaseClient, getDatabaseConfig } =
        await import("@/lib/admin/admin-ops.server");
      if (!getDatabaseConfig()) {
        console.error("[globalPublicSearch] Database not configured");
        throw new Error("Search is temporarily unavailable. Please try again.");
      }
      const db = createDatabaseClient();
      const pattern = toLikePattern(q);

      // Every source resolves independently; a single failed source degrades
      // the response honestly (partial=true) instead of failing everything.
      const [nav, products, categories, blog, pages] = await Promise.allSettled([
        Promise.resolve(matchNavEntries(q, NAV_SEARCH_ENTRIES)),
        db
          .from("products")
          .select("id, slug, name, sku, categories(name)")
          .eq("status", "active")
          .or(`name.ilike.${pattern},sku.ilike.${pattern}`)
          .order("created_at", { ascending: false })
          .limit(LIMITS.products),
        db
          .from("categories")
          .select("id, name, slug")
          .eq("active", true)
          .or(`name.ilike.${pattern},slug.ilike.${pattern}`)
          .order("sort_order", { ascending: true })
          .limit(LIMITS.categories),
        db
          .from("blog_posts")
          .select("id, slug, title, excerpt, category")
          .eq("status", "published")
          .or(`title.ilike.${pattern},excerpt.ilike.${pattern}`)
          .order("published_at", { ascending: false })
          .limit(LIMITS.blog),
        db
          .from("site_pages")
          .select("id, slug, title, content")
          .eq("status", "published")
          .or(`title.ilike.${pattern},content.ilike.${pattern}`)
          .limit(LIMITS.pages),
      ]);

      const results: GlobalSearchResult[] = [];
      let partial = false;

      if (nav.status === "fulfilled") results.push(...nav.value);
      else partial = true;

      for (const settled of [products, categories, blog, pages]) {
        if (settled.status === "fulfilled") {
          const { data, error } = settled.value as {
            data: unknown[] | null;
            error: { message: string } | null;
          };
          if (error) {
            console.error("[globalPublicSearch] source query failed:", error.message);
            partial = true;
            continue;
          }
          if (settled === products) {
            results.push(...mapProductRows((data ?? []) as never, q));
          } else if (settled === categories) {
            results.push(...mapCategoryRows((data ?? []) as never));
          } else if (settled === blog) {
            results.push(...mapBlogRows((data ?? []) as never, q));
          } else if (settled === pages) {
            for (const page of (data ?? []) as never[]) {
              results.push(...extractPageEntries(page as never, q));
            }
          }
        } else {
          console.error("[globalPublicSearch] source rejected:", settled.reason);
          partial = true;
        }
      }

      return { results, partial, query: q };
    },
  );
