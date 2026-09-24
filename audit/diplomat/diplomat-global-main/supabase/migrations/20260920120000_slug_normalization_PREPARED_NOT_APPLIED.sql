-- =====================================================================
-- SLUG NORMALIZATION — PREPARED, NOT APPLIED (Owner-gated)
-- Generated from the §8 read-only audit, re-verified live 2026-09-21.
-- Owner approval required before running against the shared database.
--
-- WHAT THIS CHANGES
--   Trailing spaces are stripped from 18 of 40 product slugs, and the one
--   hero CTA that points at such a slug is rewritten to the trimmed value.
--   Nothing else is touched: case and INNER spaces are preserved (they are
--   legitimate stored data and a pre-existing site-wide convention).
--
-- AUDIT SUMMARY (service_role read, 2026-09-21):
--   products        40 rows | 18 slugs with leading/trailing whitespace
--                   | 24 with inner whitespace, 38 uppercase (NOT changed)
--   blog_posts       3 rows | clean
--   categories       5 rows | clean
--   site_pages       5 rows | clean
--   collision groups after lower(trim(slug)): 0
--   collision groups after trim(slug) (case-sensitive): 0
--   slugs containing unsafe chars (< > " ' \ ? # %) or empty: 0
--
-- WHY IT IS SAFE FOR EXISTING LINKS
--   The storefront resolver (src/lib/product-slug.ts, shipped in b828648) looks
--   up the canonical slug PLUS its single leading/trailing-space variants, so
--   the clean and the %20-encoded forms resolve to the SAME product both
--   before and after this migration. Without that resolver, applying this
--   migration would 404 every previously shared %20 link.
--
-- IDEMPOTENT / RE-RUN SAFE
--   The UPDATE ... WHERE slug <> btrim(slug) predicates become false once the
--   rows are trimmed, so a second run affects 0 rows and changes nothing.
--
-- VERIFIED BY EXECUTION (2026-09-21, throwaway PostgreSQL 17 cluster seeded with
--   the live schema shape and the exact 18 dirty rows + 4 hero slides):
--     preflight   dirty 18 | collision groups 0 | hero whitespace CTAs 1
--     first run   18 slugs trimmed; 1 hero CTA repaired (Samsung); the already
--                 clean LG CTA was left untouched; 0 mismatches against the
--                 recorded before/after table in §2
--     second run  'nothing to do (already normalized) — no rows changed'
--     rollback    restores all 18 dirty slugs and the 1 dirty CTA exactly
--     collision   with an injected post-normalization collision the guard
--                 aborts before any UPDATE and changes nothing
--
-- TOPOLOGY: Preview and Production share this database.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. PREFLIGHT — run first, read-only. Record the output before applying.
--    (The previous version of this file used LIKE '%\_%' ESCAPE '\\', which
--     raises "invalid escape string" because standard_conforming_strings
--     makes '\\' a two-character string. btrim() comparisons replace it.)
-- ---------------------------------------------------------------------
--   -- P1. exact dirty set — EXPECT 18 rows (the recorded set in §2)
--   SELECT id, slug, btrim(slug) AS normalized
--     FROM public.products WHERE slug <> btrim(slug) ORDER BY slug;
--
--   -- P2. collision check after normalization — EXPECT 0 rows
--   --     (case-insensitive, strictly stronger than the DB's own
--   --      case-sensitive UNIQUE constraint on products.slug)
--   SELECT lower(btrim(slug)) AS k, count(*)
--     FROM public.products GROUP BY 1 HAVING count(*) > 1;
--
--   -- P3. hero CTAs carrying edge whitespace — EXPECT exactly 1 row
--   --     (24bf1df6-eb62-4f32-8eac-a8b70575693d, '/products/Ls32a700nwnxza ')
--   SELECT id, cta_link
--     FROM public.hero_slides WHERE cta_link <> btrim(cta_link);
--
--   -- P4. any hero CTA pointing at a still-dirty product slug — EXPECT 1
--   SELECT count(*) FROM public.hero_slides h
--    WHERE btrim(h.cta_link) IN (
--      SELECT '/products/' || btrim(slug) FROM public.products WHERE slug <> btrim(slug));
--
--   -- P5. recovery snapshot — copy the output into the Owner's records
--   SELECT jsonb_agg(to_jsonb(p)) FROM public.products p WHERE slug <> btrim(p.slug);
--   SELECT jsonb_agg(to_jsonb(h)) FROM public.hero_slides h WHERE h.cta_link <> btrim(h.cta_link);
--
--   STOP if P2, P3 or P4 differ from the expected counts above — the database
--   has changed since approval and this file must be re-reviewed, not run.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 2. RECORDED BEFORE / AFTER — all 18 rows, captured live 2026-09-21.
--    Every dirty value is exactly ONE trailing space (no leading space, tab,
--    newline or non-breaking space: a whitespace-class strip also returned 18).
--    This table is also the rollback source for §6.
--
--    id                                    before (JSON)                 after
--    40789a57-304e-4fc6-b7b4-195475c66491  "182N "                        "182N"
--    2550467e-2802-4d39-9797-79a106a4cd76  "27M2N3201A "                  "27M2N3201A"
--    29c78b1b-58e4-4de0-b450-a5daf29d3972  "34wr50qk "                    "34wr50qk"
--    3a013b1e-bb76-493f-98cd-7cad1e9622b0  "E24i G4 "                     "E24i G4"
--    1a8c6475-8f65-464d-8121-0b9408a6c51f  "G32c4w "                      "G32c4w"
--    24ea1464-6a3f-48f2-92ab-cfd53811d77b  "Gtheos Captain 300 "          "Gtheos Captain 300"
--    2b1aec4d-6478-476d-8795-46111ace4d4b  "Hp E23 G4 "                   "Hp E23 G4"
--    4d9a6e98-8387-4344-8a1c-5e0ed2295a31  "Hp U28 "                      "Hp U28"
--    5566e5db-0988-4139-880f-eb5525faea75  "LG 29u511a "                  "LG 29u511a"
--    14c1798b-e730-49b4-9987-b3d3ffc09e79  "Ls32a700nwnxza "              "Ls32a700nwnxza"
--    b144a580-3ad1-4145-9c4b-87ac3292dd0e  "M107w "                       "M107w"
--    cafa38f7-fdee-4bd9-b82b-d5b8bbb41185  "M255dw "                      "M255dw"
--    6b58c243-0809-423e-861d-c8e2c8e4723c  "Philips Evnia 34m2c5501a "    "Philips Evnia 34m2c5501a"
--    1b50204b-baec-44fa-a793-a7645e219e65  "Redragon Gs817 "              "Redragon Gs817"
--    b8213806-383d-45c1-85b1-fb57e56d9bb2  "Tm27fhd120ips "               "Tm27fhd120ips"
--    b8fe6032-d17b-4791-9783-bdbc78fed474  "TP-Link LS1008 "              "TP-Link LS1008"
--    301699d7-6c55-4512-b7c3-a1f4f90bcd09  "UHM G1000 "                   "UHM G1000"
--    123d33a9-be20-44aa-b1c0-b7bcdd9d7e60  "V2COM D1 "                    "V2COM D1"
--
--    Hero CTA repaired by step 2 (1 row):
--    24bf1df6-eb62-4f32-8eac-a8b70575693d  "/products/Ls32a700nwnxza "    "/products/Ls32a700nwnxza"
--
--    NOTE the other product-bound hero CTA, 75d1dff9-c043-4b48-8c5c-cb02c54c0bf1
--    ('/products/LG 34wp75c-b'), is CLEAN: its product slug is the clean
--    'LG 34wp75c-b' (743a9c00-d6a5-4bb1-813b-bd04cee2b0dd) and it is NOT in the
--    18-row dirty set, so step 2 must not — and does not — rewrite it.
-- ---------------------------------------------------------------------


BEGIN;

DO $$
DECLARE
  dirty_count integer;
  collision_groups integer;
  cta_repaired integer;
  remaining_dirty integer;
BEGIN
  -- Guard 1: never apply into a state that would collide after normalization.
  SELECT count(*) INTO collision_groups FROM (
    SELECT lower(btrim(slug)) FROM public.products GROUP BY 1 HAVING count(*) > 1
  ) c;

  IF collision_groups > 0 THEN
    RAISE EXCEPTION
      'slug normalization aborted: % collision group(s) after normalization — see preflight P2',
      collision_groups;
  END IF;

  SELECT count(*) INTO dirty_count FROM public.products WHERE slug <> btrim(slug);
  RAISE NOTICE 'slug normalization: % dirty product slug(s) at start', dirty_count;

  IF dirty_count = 0 THEN
    RAISE NOTICE 'slug normalization: nothing to do (already normalized) — no rows changed';
  ELSE
    -- STEP 1 — trim (btrim removes leading AND trailing spaces; case and inner
    -- spaces are deliberately untouched). products.slug is UNIQUE, so a
    -- collision would abort the whole transaction rather than lose data.
    UPDATE public.products
       SET slug = btrim(slug),
           updated_at = now()
     WHERE slug <> btrim(slug);

    -- STEP 2 — align hero CTAs with the trimmed slugs. Only links whose
    -- btrim()ed value equals a product's canonical '/products/<slug>' are
    -- touched, and clean links are excluded by the second predicate, so this
    -- cannot rewrite any CTA that is already correct.
    UPDATE public.hero_slides h
       SET cta_link = '/products/' || p.slug,
           updated_at = now()
      FROM public.products p
     WHERE btrim(h.cta_link) = '/products/' || p.slug
       AND h.cta_link <> '/products/' || p.slug;

    GET DIAGNOSTICS cta_repaired = ROW_COUNT;
    RAISE NOTICE 'slug normalization: hero CTA link(s) repaired: %', cta_repaired;

    -- Guard 2: fail loudly rather than commit a half-normalized state.
    SELECT count(*) INTO remaining_dirty FROM public.products WHERE slug <> btrim(slug);
    IF remaining_dirty <> 0 THEN
      RAISE EXCEPTION
        'slug normalization post-condition failed: % product slug(s) still untrimmed',
        remaining_dirty;
    END IF;
  END IF;
END $$;

COMMIT;


-- ---------------------------------------------------------------------
-- 3. POSTFLIGHT — run after applying; all four must come back as shown.
-- ---------------------------------------------------------------------
--   SELECT count(*) FROM public.products WHERE slug <> btrim(slug);        -- 0
--   SELECT count(*) FROM public.hero_slides WHERE cta_link <> btrim(cta_link); -- 0
--   SELECT count(*) FROM public.products WHERE slug = '' OR slug IS NULL;  -- 0
--   SELECT lower(btrim(slug)), count(*) FROM public.products
--     GROUP BY 1 HAVING count(*) > 1;                                      -- 0 rows
--
--   Samsung PDP must resolve on the CLEAN canonical URL, with no query-string
--   workaround (this is the §5 acceptance case):
--     GET /products/Ls32a700nwnxza                   -> 200, product renders
--     GET /products/Ls32a700nwnxza?category=Monitor  -> 200 (unchanged)
--     GET /products/Ls32a700nwnxza%20                -> 200 (old shared link still resolves)
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 4. AFFECTED REFERENCES — complete list, each verified live 2026-09-21.
--
--   products.slug                 40 rows; 18 rewritten by step 1.
--   hero_slides.cta_link           4 rows; exactly 1 references a dirty slug
--                                  (24bf1df6…, repaired by step 2). The other
--                                  product CTA is already clean.
--   order_items                    product_id + sku + name snapshots; there is
--                                  NO slug column (columns: id, order_id,
--                                  product_id, sku, name, quantity, unit_price,
--                                  line_total, cost_price) -> historical order
--                                  history is structurally unaffected.
--   orders                         no slug column (reference, payment_reference,
--                                  shipping_address JSON, …) -> unaffected.
--   blog_posts.slug                3 rows, all clean -> not touched.
--   categories.slug, site_pages.slug  clean -> not touched.
--   sitemap.xml                    server-generated; src/server.ts already emits
--                                  trimmed slugs, so it produced 18 malformed
--                                  `<loc>` values ending in a raw space before
--                                  that fix and 0 now (verified live).
--   PDP canonical URL              src/routes/products.$slug.tsx already emits
--                                  the trimmed value, so no canonical URL then
--                                  carries a raw trailing space.
--   src/lib/product-slug.ts        the tolerant resolver — reads, not data;
--                                  keeps %20 links working after the trim.
--   Cloudinary false positives     hero_slides.image and
--                                  product_images.secure_url (68 rows) contain
--                                  '/products/' as a Cloudinary FOLDER path
--                                  (…/diplomat-global/products/<id>.jpg), not a
--                                  product-page link. Not affected; do not chase.
--   No FK couples products <-> hero_slides: the link is free text only.
--   A full scan of every link-bearing text column across all 34 exposed tables
--   found no other reference to a dirty slug.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 5. ROLLBACK / RECOVERY
--
--   Values are exactly restorable because every change in this file is
--   "remove one trailing space" (products) or "remove one trailing space"
--   (the single hero CTA). updated_at is NOT restorable (it is set to now()).
--
--   Full-value rollback (run only for the 18 ids recorded in §2):
--     UPDATE public.products SET slug = slug || ' ' WHERE id IN (
--       '40789a57-304e-4fc6-b7b4-195475c66491','2550467e-2802-4d39-9797-79a106a4cd76',
--       '29c78b1b-58e4-4de0-b450-a5daf29d3972','3a013b1e-bb76-493f-98cd-7cad1e9622b0',
--       '1a8c6475-8f65-464d-8121-0b9408a6c51f','24ea1464-6a3f-48f2-92ab-cfd53811d77b',
--       '2b1aec4d-6478-476d-8795-46111ace4d4b','4d9a6e98-8387-4344-8a1c-5e0ed2295a31',
--       '5566e5db-0988-4139-880f-eb5525faea75','14c1798b-e730-49b4-9987-b3d3ffc09e79',
--       'b144a580-3ad1-4145-9c4b-87ac3292dd0e','cafa38f7-fdee-4bd9-b82b-d5b8bbb41185',
--       '6b58c243-0809-423e-861d-c8e2c8e4723c','1b50204b-baec-44fa-a793-a7645e219e65',
--       'b8213806-383d-45c1-85b1-fb57e56d9bb2','b8fe6032-d17b-4791-9783-bdbc78fed474',
--       '301699d7-6c55-4512-b7c3-a1f4f90bcd09','123d33a9-be20-44aa-b1c0-b7bcdd9d7e60'
--     );
--     UPDATE public.hero_slides SET cta_link = cta_link || ' '
--      WHERE id = '24bf1df6-eb62-4f32-8eac-a8b70575693d';
--
--   Exact-value recovery (stronger): the §1 P5 jsonb snapshot and the §2 table
--   above hold the precise pre-migration values for every touched row.
--   Last resort: restore from the pre-migration database backup.
--
--   Re-running this file after a rollback re-applies the trim (idempotent and
--   guarded); it is a supported round trip.
-- ---------------------------------------------------------------------
