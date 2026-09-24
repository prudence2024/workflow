/**
 * Cloudinary ORPHAN CENSUS — DRY RUN ONLY (§15).
 *
 * ZERO DELETIONS. Builds the DB reference census (products, blog_posts,
 * hero_slides, site_settings, product_images), lists provider assets via the
 * Cloudinary Admin API, and reports orphan CANDIDATES with reason + age for
 * Owner review. A candidate is NOT necessarily deletable — it is merely
 * unreferenced by the database. Any future enforcement version must add the
 * shared-reference check, grace period and audit trail, and stays Owner-gated.
 *
 * Usage: node scripts/cloudinary-orphan-census.mjs
 * Env:   CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
 *        plus SUPABASE_URL + SUPABASE_SECRET_KEY (or service key env).
 * Never prints secrets.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME?.trim();
const KEY = process.env.CLOUDINARY_API_KEY?.trim();
const SECRET = process.env.CLOUDINARY_API_SECRET?.trim();  const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const SUPABASE_KEY = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

const DRY_RUN = true; // hard-coded: this tool NEVER deletes
const GRACE_DAYS = 30; // candidates younger than this are flagged "within grace"

if (!CLOUD || !KEY || !SECRET || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing configuration (names checked only):", {
    CLOUDINARY_CLOUD_NAME: Boolean(CLOUD),
    CLOUDINARY_API_KEY: Boolean(KEY),
    CLOUDINARY_API_SECRET: Boolean(SECRET),
    SUPABASE_URL: Boolean(SUPABASE_URL),
    SUPABASE_SECRET_KEY: Boolean(SUPABASE_KEY),
  });
  process.exit(1);
}

// Project ships the official SDK (package.json: cloudinary ^2.10.0) — its
// Admin-API client handles signing/paging correctly; a hand-rolled fetch 404s.
const { v2: cloudinary } = require("cloudinary");
cloudinary.config({ cloud_name: CLOUD, api_key: KEY, api_secret: SECRET });

/** Extract the Cloudinary public_id (with folder, without version/extension). */
function publicIdFromUrl(url) {
  if (typeof url !== "string" || !url.includes("cloudinary.com")) return null;
  const m = url.match(/\/upload\/(?:[^/]*\/)*?v\d+\/(.+?)\.(?:[a-zA-Z0-9]+)(?:\?.*)?$/) ||
    url.match(/\/upload\/(?:[^/]*\/)*?(.+?)\.(?:[a-zA-Z0-9]+)(?:\?.*)?$/);
  return m ? m[1] : null;
}

async function main() {
  // ── 1. DB reference census ────────────────────────────────────────────
  const dbBase = `${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1`;
  const dbHeaders = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  const referenced = new Set();
  const census = {};

  async function collect(table, columns) {
    const res = await fetch(`${dbBase}/${table}?select=${columns.join(",")}&limit=10000`, { headers: dbHeaders });
    if (!res.ok) {
      console.error(`DB census ${table} failed: ${res.status}`);
      return [];
    }
    const rows = await res.json();
    let count = 0;
    for (const row of rows) {
      for (const col of columns) {
        const v = row[col];
        const urls = Array.isArray(v) ? v : [v];
        for (const u of urls) {
          const pid = publicIdFromUrl(typeof u === "string" ? u : u?.url);
          if (pid) {
            referenced.add(pid);
            count++;
          }
        }
      }
    }
    census[table] = { columns, rows: rows.length, references: count };
    return rows;
  }

  // Column names verified against the live schema (2026-09-16):
  //   products carry their images ONLY via product_images
  //   (cloudinary_public_id + secure_url); blog_posts.image, hero_slides.image,
  //   product_images.secure_url, testimonials.photo_url, site_settings.value.
  await collect("product_images", ["cloudinary_public_id", "secure_url"]);
  await collect("blog_posts", ["image"]);
  await collect("hero_slides", ["image"]);
  await collect("testimonials", ["photo_url"]);
  await collect("site_settings", ["value"]);

  // ── 2. Provider asset listing (all image uploads, SDK-paged) ──────────
  const assets = [];
  let nextCursor;
  do {
    const page = await cloudinary.api.resources({
      resource_type: "image",
      type: "upload",
      max_results: 500,
      ...(nextCursor ? { next_cursor: nextCursor } : {}),
    });
    assets.push(...(page.resources ?? []));
    nextCursor = page.next_cursor;
  } while (nextCursor);

  // ── 3. Candidate report (DRY RUN — no deletion calls exist in this file) ──
  const now = Date.now();
  const candidates = assets
    .filter((a) => !referenced.has(a.public_id))
    .map((a) => {
      const ageDays = Math.floor((now - new Date(a.created_at).getTime()) / 86400000);
      return {
        public_id: a.public_id,
        created_at: a.created_at,
        age_days: ageDays,
        bytes: a.bytes,
        within_grace: ageDays < GRACE_DAYS,
        reason: "unreferenced_by_db_census",
      };
    })
    .sort((x, y) => y.age_days - x.age_days);

  const report = {
    DRY_RUN,
    deletions_performed: 0,
    generated_at: new Date().toISOString(),
    db_census: census,
    provider_assets_total: assets.length,
    db_referenced_total: referenced.size,
    orphan_candidates_total: candidates.length,
    candidates_within_grace: candidates.filter((c) => c.within_grace).length,
    grace_period_days: GRACE_DAYS,
    candidates,
  };

  console.log(JSON.stringify(report, null, 2));
  console.error(
    `\nDRY RUN ONLY — ${report.orphan_candidates_total} candidate(s), ${report.candidates_within_grace} within ${GRACE_DAYS}-day grace. No deletions performed (deletions are Owner-gated).`,
  );
}

main().catch((err) => {
  console.error("Census failed:", err.message);
  process.exit(1);
});
