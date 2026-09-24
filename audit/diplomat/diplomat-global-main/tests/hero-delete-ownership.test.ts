import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Hero delete-ownership contract (Owner §9).
 *
 * Hero slides REFERENCE content; they must never own or delete it. Deleting a
 * product-bound or blog-bound slide removes only the hero_slides row — the
 * underlying product/blog record (and unrelated records) must survive, and no
 * foreign key may couple slide deletion to source deletion.
 *
 * These are contract tests over the migration DDL and the delete code paths;
 * they run without a database and fail if the ownership boundary regresses.
 */

const BASELINE = readFileSync(
  join("supabase", "migrations", "20260827_baseline.sql"),
  "utf8",
);

const SERVER_FNS = readFileSync(
  join("src", "lib", "admin", "server-fns.ts"),
  "utf8",
);

const HERO_PAGE = readFileSync(
  join("src", "routes", "dashboard.hero-slides.tsx"),
  "utf8",
);

describe("hero delete ownership: database boundary", () => {
  test("no table references hero_slides via foreign key", () => {
    expect(BASELINE).not.toMatch(/REFERENCES\s+public\.hero_slides/);
    expect(BASELINE.toLowerCase()).not.toMatch(
      /foreign\s+key[^;]*hero_slides/,
    );
  });

  test("hero_slides DDL declares no foreign keys at all", () => {
    const ddl = BASELINE.slice(
      BASELINE.indexOf("CREATE TABLE IF NOT EXISTS public.hero_slides"),
      BASELINE.indexOf("ALTER TABLE public.hero_slides"),
    );
    expect(ddl).not.toMatch(/REFERENCES/i);
  });
});

describe("hero delete ownership: server delete path", () => {
  const fn = SERVER_FNS.slice(
    SERVER_FNS.indexOf('export const adminDeleteHeroSlide'),
    SERVER_FNS.indexOf('export const adminDeleteHeroSlide') + 1200,
  );

  test("adminDeleteHeroSlide deletes only from hero_slides", () => {
    expect(fn).toMatch(/\.from\("hero_slides"\)\.delete\(\)/);
    expect(fn).not.toMatch(/\.from\("(products|blog_posts)"\)/);
  });

  test("hero CRUD never mutates products or blog_posts", () => {
    for (const name of [
      "adminCreateHeroSlide",
      "adminUpdateHeroSlide",
      "adminDeleteHeroSlide",
    ]) {
      const start = SERVER_FNS.indexOf(`export const ${name}`);
      const body = SERVER_FNS.slice(start, start + 1400);
      expect(body, name).not.toMatch(/\.from\("(products|blog_posts)"\)/);
    }
  });
});

describe("hero delete ownership: admin UI delete path", () => {
  test("handleDelete issues only the slide delete then reloads", () => {
    const start = HERO_PAGE.indexOf("const handleDelete");
    const body = HERO_PAGE.slice(start, start + 500);
    expect(body).toMatch(/deleteSlide\(/);
    expect(body).not.toMatch(
      /(deleteProduct|deleteBlog|adminDeleteProduct|adminDeleteBlog)/,
    );
  });
});
