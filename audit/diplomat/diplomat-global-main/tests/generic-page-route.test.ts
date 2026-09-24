import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Security + truthfulness contract for /pages/$slug (src/routes/pages.$slug.tsx).
 * The route file defines the guard/normalization logic inline, so these tests
 * pin the route source against regressions (a removed guard, a raw HTML sink,
 * a fabricated-content path) rather than re-implementing the regex.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const routeSource = fs.readFileSync(path.join(here, "../src/routes/pages.$slug.tsx"), "utf8");

describe("/pages/$slug — slug safety", () => {
  it("rejects traversal-like slugs before any database query", () => {
    // Must reject dots entirely (covers ../, ..%2F, "..."-style payloads).
    const guard = /\/\^\[a-z0-9\]\+\(\?:-\[a-z0-9\]\+\)\*\$\/\.test\(slug\)/;
    expect(routeSource).toMatch(guard);
    expect(routeSource).toMatch(/slug\.length <= 120/);
  });

  it("normalizes case/whitespace once, then validates the normalized value", () => {
    expect(routeSource).toMatch(/toLowerCase\(\)\.trim\(\)/);
    expect(routeSource).toMatch(/if \(!isSafeSlug\(slug\)\)/);
  });

  it("queries only published pages and by exact slug", () => {
    const serverFn =
      /export const getPublicPageBySlug[\s\S]*?\}\);/.exec(
        fs.readFileSync(path.join(here, "../src/lib/admin/server-fns.ts"), "utf8"),
      )?.[0] ?? "";
    expect(serverFn).toMatch(/\.eq\("slug", data\.slug\)/);
    expect(serverFn).toMatch(/\.eq\("status", "published"\)/);
  });
});

describe("/pages/$slug — content safety", () => {
  it("strips HTML tags from stored content before rendering as text", () => {
    expect(routeSource).toContain('.replace(/<[^>]*>/g, "")');
  });

  it("renders paragraphs as React text children (no dangerouslySetInnerHTML)", () => {
    expect(routeSource).not.toContain("dangerouslySetInnerHTML");
  });
});

describe("/pages/$slug — truthful failure states", () => {
  it("unknown/unpublished slugs render the not-found state, never fabricated content", () => {
    expect(routeSource).toMatch(/if \(!page\) return \{ found: false/);
  });

  it("serverFn failure surfaces the not-found state in production", () => {
    expect(routeSource).toMatch(/if \(import\.meta\.env\.PROD\)/);
    expect(routeSource).toMatch(/return \{ found: false as const/);
  });

  it("marks unknown pages noindex", () => {
    expect(routeSource).toMatch(/name: "robots", content: "noindex"/);
  });
});
