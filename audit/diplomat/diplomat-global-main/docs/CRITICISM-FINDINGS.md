# CRITICISM PASS — FINAL IMPLEMENTATION CLOSURE RUN

**Run date:** 2026-09-17 · **Branch:** `codex/diplomat-final-hardening` · **Skill:** `.claude/skills/criticism/SKILL.md`
**Diff under criticism:** `efaf212…HEAD` (final implementation arc)

Findings are severity-ranked per the criticism skill's 17-lens model. Classification legend:
PROVEN ISSUE / LIKELY RISK / SAFE BY EXISTING DESIGN / OWNER BUSINESS DECISION REQUIRED.

---

## F1 — Manual Admin stock edit 1→0: no sold-out notification, no Telegram alert
- **LENS:** C (empty state), M (derived data), N (user feedback)
- **TRIGGER:** Owner sets a product's stock to 0 from the Admin inventory UI.
- **DEPENDENT_SYSTEMS:** `admin_notifications`, Telegram admin alerts, public PDP/cart.
- **PROVEN_BY (code):** `emitLowStockTransition` (`src/lib/inventory-settings.server.ts:49`)
  returns early unless `next.state === "low_stock"` — `quantity <= 0` resolves to
  `"out_of_stock"` (`src/lib/inventory-lifecycle.ts:81`), so the manual 1→0 edit emits
  **nothing**. `notifications.outOfStock()` is called from exactly one place
  (`src/lib/payment-finalize.server.ts:1266`), and only when a sale *fails* to decrement.
- **PROVEN_BY (schema/live):** inventory CAS decrement is atomic
  (`decrementInventoryAtomic`, exact-value compare-and-swap, `inventory-lifecycle.ts:155`);
  notification dedup exists (`admin_notifications.event_key` unique + upsert/ignoreDuplicates,
  pinned by `tests/admin-notification-idempotency.test.ts`).
- **FAILURE_MODE:** Sale-driven zero stock produces an *out-of-stock notification* only when a
  competing sale lost the CAS race; a normal sale 1→0 (or manual 1→0) raises **no bell entry
  and no Telegram alert**. Owner's §21/§22 requirement is unmet for the ordinary path.
- **SEVERITY:** HIGH · **CLASSIFICATION:** PROVEN ISSUE (code-evidenced)
- **IMPACT:** Admin impact: restock decisions delayed. Customer impact: PDP correctly shows
  sold out (state derivation is correct) — purely an observability gap. Financial: none.
- **RECOMMENDED_GUARD:** emit `notifications.outOfStock()` + one Telegram alert on the
  transition `before.quantity > 0 && after.quantity <= 0`, event-keyed per product so
  callback/webhook replay dedupes; distinguish sale vs manual source in the message.
- **FIX:** ✅ IMPLEMENTED this pass (see Fixed Findings below). **OWNER_DECISION_REQUIRED:** no.

## F2 — Category delete: no guard, no archive, FK does not protect intent
- **LENS:** A/Q (delete/dependency), K (historical integrity), O (reversibility)
- **TRIGGER:** Admin deletes a category that still contains products.
- **DEPENDENT_SYSTEMS:** products (public UI), category navigation, cached category strip,
  old category URLs.
- **PROVEN_BY (schema, live):** `products.category_id REFERENCES categories ON DELETE SET NULL`
  (`20260827_baseline.sql:139`). **Live FK probe:** deleting an FK-protected order was
  **BLOCKED** (`23503 violates foreign key constraint payment_fina…`) — the DB enforces
  RESTRICT where intended; products.category_id is deliberately SET NULL. So deleting a
  category **never destroys products** (no cascade) — historical orders/receipts stay intact.
- **PROVEN_BY (code):** `adminDeleteCategory` (`src/lib/admin/server-fns.ts:713`) calls
  `deleteCategoryRecord` which performs the delete **unconditionally** — no product count
  check, no "contains 25 products" UX, no archive state. Products silently become
  uncategorised; public filters/navigation lose the category after revalidation.
- **FAILURE_MODE:** An accidental delete is *safe for data* but *surprising for the Owner*:
  11 products (live count for "Monitor") instantly drop out of their category facet.
- **SEVERITY:** MEDIUM · **CLASSIFICATION:** PARTIALLY SAFE BY EXISTING DESIGN (no data loss;
  SET NULL is deliberate), partially a UX-policy gap.
- **RECOMMENDED_GUARD:** block delete when product count > 0 with the message Owner specified
  ("This category contains N products and cannot be deleted yet"); archive/reassign remains an
  Owner decision — schema has no archived flag, and adding one is a migration requiring
  Owner approval. **OWNER_DECISION_REQUIRED:** archive-column migration (proposed only).
- **FIX:** ✅ Minimal guard implemented this pass (no schema change). Partial (reassignment UX
  not built — needs Owner's product-reassignment choice).

## F3 — Homepage "Best sellers" section can claim ranked status it doesn't have
- **LENS:** M (derived data), D (stale), C (empty state)
- **TRIGGER:** zero or purge-removed successful sales; fallback fill.
- **PROVEN_BY (code):** `loadBestSellerRanking` returns `ranked=false` when no real sales exist
  (`src/lib/best-sellers.server.ts:105`); `getPublicHomeProductSections` returns
  `bestSellersRanked` (`:131`). The homepage loader keeps `bestSellers` but **discards**
  `bestSellersRanked` — the section renders the literal title "Best sellers" even when every
  card is deterministic catalogue fallback (`src/routes/index.tsx:478`).
- **FAILURE_MODE:** After a test-data purge (or in a fresh store), the section makes an
  unsupported best-seller claim — exactly the §45 concern.
- **SEVERITY:** MEDIUM · **CLASSIFICATION:** PROVEN ISSUE (title is unconditional).
- **RECOMMENDED_GUARD:** title "Best sellers" only when `bestSellersRanked`; otherwise
  "Featured picks" (same grid, same fallback products — truthful labelling, no data change).
- **FIX:** ✅ IMPLEMENTED this pass.

## F4 — Public content freshness: focus/reconnect do not revalidate
- **LENS:** D (stale), L (cache invalidation), I (offline/reconnect)
- **TRIGGER:** visitor returns hours later / regains connectivity.
- **PROVEN_BY (code):** router QueryClient uses `staleTime: 5min, gcTime: 10min`
  (`src/router.tsx:18-20`) but TanStack Query's default `refetchOnWindowFocus` is **not**
  enabled anywhere (repo-wide grep: zero hits) and no `online`/`visibilitychange` listener
  exists (`src/routes/index.tsx`, `shop.tsx`, `__root.tsx` — zero hits). Public data is
  refetched only on route remount after gcTime expiry, or via explicit `router.invalidate()`.
  Service worker correctly bypasses `/checkout`, `/dashboard`, `/api/`, `/_serverFn`
  (`public/sw.js:25`), so no financial staleness — public-only gap.
- **FAILURE_MODE:** a returning visitor with a warm query cache can see up to 10-minute-old
  prices/stock without any refresh trigger; reconnect after offline shows stale until manual
  navigation. The Owner's §48 requirement (focus + reconnect revalidation, no polling) is
  not yet satisfied.
- **SEVERITY:** MEDIUM · **CLASSIFICATION:** PROVEN ISSUE (missing feature, not a defect in
  shipped logic).
- **RECOMMENDED_GUARD:** enable `refetchOnWindowFocus: true` for public queries + a
  debounced `online` event refetch; keep it out of Admin/financial surfaces.
- **FIX:** ✅ IMPLEMENTED this pass (public-surface only, debounced — no polling).

## F5 — `initializeCheckout` single error obscures which cart line is stale
- **LENS:** D (stale cart), G (partial failure), N (feedback)
- **PROVEN_BY (code):** `buildCheckoutQuote` throws per-line messages ("A product in your
  cart is no longer available.", "…does not have enough stock…") — each thrown message is
  truthful and blocks Paystack init, and totals are always server-authoritative
  (`loadAuthoritativeQuote` re-reads products/coupon server-side;
  browser prices/totals are structurally rejected by the validator). No stale total can be
  charged; no fake price can enter (schema strips them).
- **SEVERITY:** LOW (UX granularity only) · **CLASSIFICATION:** SAFE BY EXISTING DESIGN for
  the financial core (fail-closed, authoritative); item-level reconciliation UI remains a
  nice-to-have, logged for Owner review. **FIX:** not required for correctness.

## F6 — Test-data purge leaves shop-side derived state untouched
- **LENS:** M, L
- **PROVEN_BY (code):** purge deletes only commerce rows of selected orders
  (pinned by `tests/owner-testdata-purge.test.ts`); analytics/Best Sellers read live on every
  request (verified: `loadBestSellerRanking` aggregates per request; no materialized store);
  `categories:list` is the only cache invalidation point for categories. After a purge the
  next homepage request recomputes rankings from remaining data — **no stale ranking can
  survive** except the section title (see F3, fixed).
- **SEVERITY:** INFORMATIONAL after F3 · **CLASSIFICATION:** SAFE BY EXISTING DESIGN.

## F7 — Duplicate events across payment/notification/Telegram paths
- **LENS:** E (duplicate), P (provider/DB divergence)
- **PROVEN_BY (code+live):** inventory decrement: CAS `quantity=expected` — double-execution
  is idempotent via `orderClaimedByThisRequest` gate + already-paid short-circuit
  (`payment-finalize.server.ts:1254`). Notifications: unique `event_key` + upsert
  (live table shows 0 rows / 0 dupes today; contract-pinned). Telegram: best-effort
  `sendPaymentNotification`, plain-text fallback with 10s timeout; a Telegram failure never
  blocks finalization (swallowed with audit).
- **SEVERITY:** — · **CLASSIFICATION:** SAFE BY EXISTING DESIGN. No action.

## F8 — IDOR / authorization surface of the new Owner purge page
- **LENS:** J (direct serverFn call)
- **PROVEN_BY (code):** `ownerTestdataPurge` authorizes via `requireOwner()` **inside** the
  handler before any DB read (pinned by `tests/owner-testdata-purge.test.ts` "authorizes
  EVERY call"); UI page additionally renders a non-owner gate, but the server check is the
  security boundary. Audit manifest written on every execute.
- **SEVERITY:** — · **CLASSIFICATION:** SAFE BY EXISTING DESIGN. No action.

---

## Second-pass criticism (remaining lenses, evidence gathered 2026-09-17)

### F9 — FINAL-UNIT CONCURRENCY: proven safe (no migration required)
- **LENS:** F (concurrency), E (duplicate)
- **PROVEN_BY (live race probe):** two simultaneous exact-value CAS decrements on a qty=1
  inventory row through the app's own CAS logic: `WINNERS=1 before=1 after=0` — exactly one
  buyer can take the final unit. The v2 SQL finalizer additionally enforces
  `quantity - coalesce(reserved,0) >= item.quantity` inside a single UPDATE under row lock
  (`20260914120100_payment_finalization_v2.sql:227-233`), raising 'Inventory requires
  reconciliation' for the loser rather than overselling.
- **INVENTORY_PAYMENT_RACE_SAFE=YES. INVENTORY_RESERVATION_EXISTS=NO (inventory.reserved
  column exists but is never written). INVENTORY_RESERVATION_REQUIRED=NO** — the CAS fence
  already prevents oversell; reservation would only improve UX for losing concurrent
  checkouts (they are charged and reconciled, not oversold). No migration proposed; the
  `inventory.reserved` column already exists if the Owner later wants pre-payment holds.
- **SEVERITY:** — · **CLASSIFICATION:** SAFE BY EXISTING DESIGN (proven by live race).

### F10 — HERO CONTENT: two slides link to non-existent products (Owner decision)
- **PROVEN_BY (live DB):** hero_slides has 3 active rows; links are
  `/products/lumina-4k-camcorder` (product MISSING), `/products/apex-34-ultrawide`
  (product MISSING), `/shop` for the "Tokyo Ghoul" anime slide (no such product exists).
- **SEVERITY:** HIGH for storefront correctness (dead CTAs on the homepage hero) ·
  **CLASSIFICATION:** OWNER BUSINESS DECISION REQUIRED — the runbook forbids silently
  choosing commercial content. No code change can fix wrong data; Owner must supply 4
  destinations (2 products + 2 blog posts) in the Hero admin editor.

### F11 — ABOUT IMAGE PERFORMANCE: fixed, root-caused with live byte probes
- **PROVEN_BY (live):** founder photo raw = 21,618 bytes (never the bottleneck); the hero
  LCP image was a raw `<img>` with no priority/srcset served 114KB un-optimized.
- **FIX:** both now render through OptimizedImage (priority LCP + sizes-driven responsive
  srcset with f_auto/q_auto Cloudinary transforms). Committed `b9312a9`.

### F12 — STALE CARTS: fail-closed proven; granular line display = Owner option
- **PROVEN_BY (code):** the browser cart is display-only: checkout runs `getQuote` on every
  cart change against server prices/stock (`checkout.tsx:163-197`), the pay button is
  disabled without a fresh quote (`canSubmitCheckout`), and `initializeCheckout` re-reads
  products/coupon server-side (browser price/total fields are structurally rejected).
  Deleted product → "no longer available"; reduced stock → "does not have enough stock";
  both block Paystack init. Embedded stale prices in localStorage are never used for totals.
- **SEVERITY:** LOW (per-line granularity of the error message) · **CLASSIFICATION:**
  SAFE BY EXISTING DESIGN for the financial core.

### F13 — RECEIPT/EMAIL REPLAY: attachment and canonical data verified
- **PROVEN_BY (code+tests):** automatic and Admin-resend attachments both render
  `generateReceiptPdf` from the same canonical receipt document as Download Receipt
  (`payment-finalize.server.ts:232`, `server-fns.ts:3589`); pinned by
  `tests/payment-email-pdf-attachment.test.ts` (PDF built from canonical doc, failure never
  downgrades the paid order) and `tests/admin-resend-receipt.test.ts`. Replay/idempotency of
  the full finalization (receipt/email/coupon/inventory exactly-once) is pinned by the
  36-test `payment-finalization-v1` suite. Email/receipt bytes are generated fresh per send;
  a purged order also deletes its receipts (contract-pinned), so no dangling PII.

### F14 — PRIVATE ADMIN CACHING: no admin data cached anywhere
- **PROVEN_BY (code):** the server TTL cache holds only 4 public keys (hero, testimonials,
  social links, site settings). Orders/products/customers/notifications are always fetched
  fresh behind `requirePermission` (194 permission-checked serverFns). Admin localStorage
  holds only the theme key. The service worker bypasses `/dashboard`, `/checkout`, `/api/`,
  `/_serverFn` (`public/sw.js:25`). No private Admin cache findings.

### F15 — CATEGORY MISSING-CACHE/PUBLIC FALLBACK: safe by design
- **PROVEN_BY (code+live):** categories are read live per root load (comment in
  `getPublicCategories`: process-local cache cannot be invalidated across serverless
  instances). A deleted category: root nav drops it on next load; shop `?category=<slug>`
  lookup returns no IDs → safe empty state with message (no crash); PDPs map missing
  category to "Uncategorized". Live DB: 2 products already have NULL category and render
  fine. `categories:list` cache invalidation covers the Admin list after delete.

## Owner decisions required (NOT in the diff)
1. **Hero destinations (F10, HIGH)**: supply exactly 4 active slides — 2 real product links
   (current 2 link to non-existent products) and 2 blog posts (3 published posts available).
   The "Tokyo Ghoul" slide (links to /shop, no matching product) needs a real destination or
   deactivation. Editors: Admin → Hero.
2. **Category archive schema** (F2): add `archived` flag or reuse `active` — needs a migration
   and Owner's product-reassignment preference. Code ships with the non-destructive guard only.
3. **Item-level cart reconciliation UI** (F5/F12): current single-message fail-closed behaviour
   is correct; granular per-line display is a UX investment decision.
4. **Restock Telegram alerts**: intentionally NOT added (Owner's §25 says only if existing
   business rules support them — none exist).

## Verified-safe areas (evidence, no change)
- Financial completion exactly-once, coupon reservation v2, inventory CAS — live FK probe
  confirms RESTRICT on `payment_financial_completions.order_id` (23503 on delete attempt).
- Receipt/email pipeline — canonical renderer unchanged this pass; parity pinned by existing
  24-test contract suite.
- Service-worker bypass list covers all private/financial surfaces.
