# Phase 6 Interim Evidence — Safe Batch (pre-migration gates)

Branch: `codex/diplomat-final-hardening` · Base: Phase 5.1 closed at `3592a70`
Safe batch pushed through `8a6cef8`.

## 6A — Production-readiness preflight (local evidence)

| Item | Result |
|---|---|
| Approved payment-finalization artifacts | present (`docs/payment-finalization/`: PROPOSED.sql, preflight.sql (read-only SELECTs), postflight.sql, REVIEW.md, README.md) |
| Direct Postgres connection | none available locally → DDL is an Owner-side Supabase Dashboard action |
| Paystack / Clerk local keys | test-mode prefixes only (`pk_test` / `sk_test`) |
| Payment v1 runtime | OFF (no enablement flags in local env) |
| Vercel Production/Preview SHAs | OWNER_VERIFICATION_REQUIRED (no Vercel CLI locally) |
| Supabase shared-DB + backup/PITR posture | OWNER_VERIFICATION_REQUIRED (dashboard-only) |
| Sentry env classification | runtime localhost → `local`; deployed follows `VERCEL_ENV` unless overridden |

## 6B/6C — Performance + Cloudinary (all network/HTML-verified on fresh artifacts)

| Gate | Result |
|---|---|
| SSR critical path | Homepage/root loaders already parallel (`Promise.allSettled`); no sequential-await defect; no admin bootstrap on public pages |
| LOCAL_TTFB (diagnostic only) | cold 9.5s (local process init), warm 0.96s → 0.51s after blog cache |
| Blog cache | `blog:posts:{page}:{pageSize}` per-instance, TTL.BLOG, published-only; create/update/delete invalidate prefix; unit-proven in `tests/cache-invalidation.test.ts` |
| Categories | remain uncached by documented freshness decision — preserved |
| HERO_IS_LCP | YES (eager, fetchPriority=high, in SSR HTML) |
| Hero preloads in SSR HTML | 2 links, both PRELOAD_LINK class, byte-identical href (agent `head()` + React 19 auto-preload); browser dedupes to one cache entry |
| Hero duplicate transfers | NONE — one real transfer per unique hero asset (network-traced; preload consumed by rendered img) |
| Hero responsive | `imageSrcset` 400/800/1200w + `imageSizes` on preload, identical srcset/sizes on `<img>`; mobile chooses w_400 (8.4KB real transfer vs 39KB) |
| Below-fold priority misuse | first-4 product cards and first-3 blog cards previously `fetchPriority=high` → React 19 auto-preloaded them; removed, now lazy/`priority=auto` |
| Cloudinary pipeline | f_auto/q_auto + c_limit everywhere; measured AVIF: hero w_400 8KB / w_800 18KB / w_1200 39KB; product card w_400 23KB (vs w_200 6KB); blog w_800 62KB / w_400 25KB |
| Card srcset | previously dead `responsiveSrcSet` helper now wired into OptimizedImage via `sizes` presence; live-verified (149px card picks w_400, ~50% desktop saving) |
| SERVERFN_INTEGRITY | 150 resolver imports, 0 missing hashed targets (verified after every build) |

## 6D — Security pre-audit

| Gate | Result |
|---|---|
| CLIENT_PRIVILEGED_SECRET_COUNT | 0 — no secret patterns in any shipped static asset; 0 public source maps; only public-by-design VITE_* names in client env (DSN, publishable key, site URL) |
| sole pattern match | `TELEGRAM_BOT_TOKEN` inside admin help-page *instructions text* — documentation, not a credential |
| Webhooks | Paystack HMAC-SHA512 timing-safe; Telegram secret-token check; Brevo bearer-secret |
| Rate limits (Upstash) | contact 5/15m · newsletter 3/1h · reviews (contact bucket) · checkout 20/15m (added) · admin tiers |
| UNPROTECTED_HIGH_RISK_PUBLIC_MUTATIONS | 0 |
| Mass assignment | checkout schema rejects browser prices/totals; reviews fixed allowlist schema; staff invite resolves role server-side (requireOwner, owner-role blocked); payment status/`paid_at` never browser-set (RPC path) |

## Owner UX + delivery model

| Gate | Result |
|---|---|
| Product title clamp | 2-line `line-clamp-2` + reserved min-height (shared ProductCard, pre-existing) |
| Blog cards | 2-line title clamp, 3-line excerpt clamp, `h-full flex-col` grid-stretch equal heights (both surfaces); mobile verified live |
| PAGE_SIZE | 10 on /shop and /blog; server-side range queries, URL-authoritative `?page=`, Prev/numbers/Next, filter change resets to page 1, "Showing a–b of N" |
| Polling inventory | 6 `setInterval` hits: 5 legitimate UI timers (carousels, layout check); 1 real data poll (admin notifications 30s) → replaced with event-driven load-on-mount + visibility/focus refresh |
| Data delivery model | stable public content: cache+invalidate; search/pagination/checkout: request-driven; no Supabase Realtime subscriptions anywhere (public tables not exposed; admin surfaces reload on focus) |
| LAST_KNOWN_GOOD | Phase 4.5 semantics preserved (root shared LKG, shop/blog page LKG, search LKG) |
| CHECKOUT_CACHE_SAFETY | quote/price/stock validated server-authoritatively at initializeCheckout; caches are display-only |

## Honest limitations

- `GLOBAL_SEARCH_PARTIAL_BROWSER` = CODE_TEST_ARTIFACT_VERIFIED_BROWSER_NOT_AVAILABLE (per-source failure inside the serverFn transport is not deterministically simulatable in the browser without production test hacks)
- Authenticated Admin browser legs = PENDING_OWNER_SESSION
- Blog-cache browser-admin proof = unit + wiring-verified; real admin mutation flow PENDING_OWNER_SESSION
- Local TTFB numbers are diagnostic only; Vercel Lighthouse re-measure pending real Preview deployment

## Migration inspection (no DDL executed)

| Migration | Status |
|---|---|
| Payment finalization | OWNER_APPROVED=YES, APPROVE_AS_WRITTEN; requires Owner-side: backup/PITR confirm → preflight.sql → inspect → PROPOSED.sql → postflight.sql (Supabase SQL editor) |
| Durable outbox | OWNER_GATE=REQUIRED; additive single table `outbox_events` + RLS, idempotency-keyed, rollback = `drop table` (nothing references it) |
| Migration A (cost_price/expenses) | OWNER_GATE; additive columns/table, NULL=unknown preserved |
| Migration B (performance indexes) | OWNER_GATE; additive indexes, only AFTER Migration A |

Order: payment-finalization (approved) → outbox → A → B, each as a separate Owner event with its own preflight/postflight.

---

## Owner-batch #2 — safe application hardening (commits a97d5f6, 72d48c4, ffbd727)

| Area | Evidence |
|---|---|
| Upload allowlist | Provider-signed `allowed_formats=jpg,jpeg,png,webp`; SVG rejected; new test pins reject php/php3/php4/php5/phtml/phar/jsp/jspx/asp/aspx/cgi/exe/sh/html at the policy boundary; signed params proven minimal (no client public_id) — FOCUS 34/34 |
| Stored-URL boundary | NEW: shared `cloudinaryImageUrlSchema` (res.cloudinary.com https-only) applied to blog create/update, hero create/update, avatar validators |
| Optimistic UI | Hero-slide active toggle flips immediately + rollback on rejection; all financial/security actions remain server-confirm-first (no false-success paths) |
| Skeletons | Orphaned ProductCard/BlogPost skeletons wired as shop/blog route pendingComponents (dimension-matched grids, CLS-safe); public first-loads are SSR |
| Tap feedback | `.pressable` (transform/opacity 120ms) on shared Button; global reduced-motion override pre-existing |
| Consent | dg-cookie-consent store + banner (Accept all / Reject optional / Manage preferences) + footer reopen control; GA4 gtag + Meta Pixel inject only after consent, removed on withdrawal; 8 behavioral tests |
| Meta Pixel | `VITE_META_PIXEL_ID` env-configured; PageView from one route-change authority; Purchase fired exactly once, only after server-confirmed payment, reference/totals only |
| Offline | Security-first SW: same-origin GET only; /checkout, /dashboard, /api, /_serverFn, Set-Cookie docs never cached; docs network-first, hashed assets cache-first; verified live: doc cache holds only visited public pages, checkout/dashboard absent; truthful offline banner verified via onLine override |
| Runtime | srvx artifact server on 4203: ROOT 200, SW 200, SHOP 307→canonical; hero srcSet selects w_400 at mobile width; 6 responsive imgs; consent banner + footer control render |
| Gates | TSC PASS · FULL 505/505 · BUILD PASS · integrity 151/0 · lint changed-files clean · diff-check clean |

Owner gates unchanged: payment-finalization DDL, durable outbox, Migration A, Migration B — all pending Owner execution; Preview/Production SHAs + Supabase PITR remain Owner-verifications.

---

## Payment-migration state — live shared-DB verification (Phase 6 continuation)

Verified READ-ONLY via authenticated Supabase Management API (project `urorrrmyzsuwulfljvwm`, eu-west-1, ACTIVE_HEALTHY), 2026-09-11:

| Check | Result |
|---|---|
| `payment_financial_completions` table | **ABSENT** — full 30-table public-schema enumeration does not include it |
| `complete_verified_payment_v1` RPC | **ABSENT** (its owning table is absent; migration never applied) |
| Frozen historical reference `DG-MTLML9QG-WWA7` | Safe — payment-finalization still OFF end-to-end; nothing new reconciles history |
| SCHEMA_REGRESSION | NONE — orders/order_items/payment_transactions/inventory/coupons/receipts columns, constraints, FKs, RLS all match the documented baseline |
| Migration tracker | `list_migrations` empty (consistent with the project never using CLI migrations; not evidence of DDL) |
| Security advisor | Pre-existing only: `rls_auto_enable()` SECURITY DEFINER reachable by anon/authenticated (WARN — flag for independent security review); `normalize_marketing_suppression_email` search_path mutable (WARN); 27 tables RLS-on/no-policy (INFO — deliberate RLS-default posture, app uses service-role serverFns) |
| Backup/PITR posture | NOT retrievable via Management API — remains Owner-side verification |

CONCLUSION: Owner has NOT executed `docs/payment-finalization/PROPOSED.sql`. Payment v1 remains OFF end-to-end (code default `false`, no table, no RPC). Preview v1 enablement is correctly withheld pending the Owner gate.

---

## Payment migration — post-apply verification (Phase 6 continuation, live shared DB)

Owner executed preflight.sql → PROPOSED.sql → postflight.sql in Supabase SQL Editor (2026-09-11).
Owner-reported preflight: `missing_product_items = 3`, `forbidden_historical_completion = 0`.
Platform posture: PLAN=FREE, scheduled backups UNAVAILABLE, PITR UNAVAILABLE.

### Backup posture (release risk note)
No managed backup/PITR existed at DDL time. Recorded truthfully; no rollback was attempted
or needed (additive DDL verified safe). FUTURE MIGRATIONS: require a deliberate manual logical
export or a plan with managed backup/PITR before consequential shared-DB DDL.

### Schema verification (READ-ONLY, Supabase Management API + GET-only PostgREST)
| Check | Result |
|---|---|
| payment_financial_completions table | PRESENT, 0 rows, RLS enabled |
| Schema match vs PROPOSED.sql | EXACT: order_id uuid PK → orders ON-DELETE-RESTRICT; transaction_id uuid NOT NULL UNIQUE → payment_transactions ON-DELETE-RESTRICT; reference text NOT NULL UNIQUE; quote jsonb NOT NULL; provider_verified_at timestamptz NOT NULL; completed_at timestamptz NOT NULL DEFAULT now(); both FKs present; no extra columns |
| Ledger rows | 0 (expected — PROPOSED.sql seeds nothing) |
| Frozen DG-MTLML9QG-WWA7 | no ledger row (probe re-asserted); order still `pending`; guard RAISE runtime-proven |
| Business-data mutations | NONE — row counts identical pre/post DDL: orders 3, order_items 3, payment_transactions 7, inventory 2 (10/10, reserved 0), coupons 4 (uses=0), receipts 0; no new paid orders/transactions/receipts |

### RPC verification (runtime differential — strongest available read-only proof)
| Check | Result |
|---|---|
| existence + exact 5-arg signature | PASS — correctly-arity'd call reached the function body (400 P0001); wrong arity would return PGRST202 function-not-found |
| frozen guard ordering | PASS — first statement RAISEs for the frozen reference; call returned exactly that error; ledger unchanged after |
| service_role EXECUTE | PASS — 400 P0001 under service key |
| anon EXECUTE | PASS (false) — 401 code 42501 `permission denied for function complete_verified_payment_v1` under publishable key |
| authenticated EXECUTE | PASS (false) — inferred from PROPOSED.sql REVOKE ALL + no GRANT; anon positively proven; no contrary evidence |
| SECURITY INVOKER / search_path | PASS per DDL (SECURITY INVOKER, SET search_path = pg_catalog, public); not independently introspectable via available read tools |

### missing_product_items = 3 — blocker analysis (READ-ONLY row inspection)
Preflight query = order_items rows with `product_id IS NULL`. The three rows:
| ORDER_REFERENCE | ORDER_STATUS | ORDER_ITEM_ID | SKU / NAME snapshot | qty | unit_price | PRODUCT_CURRENTLY_EXISTS | INVENTORY | CREATED |
|---|---|---|---|---|---|---|---|---|
| DG-MTA2A541 | pending | 49840b9b…88fa | DG-CAM-LM4K / Lumina 4K Professional Camcorder | 1 | 820000.00 | NO (2-product catalogue lacks it) | none | 2026-08-26 |
| DG-MTBNON9M | pending | 31159d30…e03d | DG-MON-ZP15 / Zenith Pro Portable Monitor | 1 | 50000.00 | NO | none | 2026-08-27 |
| DG-MTBS6K5K | pending | 35198761…9001 | DG-MON-ZP15 / Zenith Pro Portable Monitor | 1 | 50000.00 | NO | none | 2026-08-27 |

Root cause: LEGITIMATE_HISTORICAL_DELETED_PRODUCT (classification A). Products were hard-deleted
after the orders were placed; `order_items.product_id` is nullable and the FK nulls the reference
on deletion — the schema's intended historical denormalization ("immutable purchase snapshots"),
not relational corruption. Snapshots (sku/name/qty/unit_price/line_total) remain intact.

V1 safety: **PASS — none of the three orders can reach the v1 path.**
- All 7 payment_transactions have EMPTY metadata (`metadata_keys: []`): no `financial_finalization_version`, no `quote_version`, no embedded `quote`.
- Cohort query: ZERO transactions carry `financial_finalization_version=1` repo-wide.
- The v1 RPC hard-fails closed on any transaction lacking the v1 marker + quote payload ('Payment binding rejected') and again on null product_id ('Order snapshot rejected'); it cannot even be reached (anon 42501) except by the service-role server.
- No NEW order can reference the deleted products (they no longer exist to quote).
- Frozen reference sits on a pending order; guard-first RAISE protects it.
- No inventory/coupon mutation is possible for these rows under v1 (v1 never engages; coupon_id NULL on all three anyway).
Disposition of the three stale pending orders (cancel/abandon) is an Owner decision; no mutation performed.

### rls_auto_enable security finding (Section 12 — read-only)
- Not defined anywhere in this repository (pre-existing platform-side helper; referenced only in evidence docs).
- Advisor: SECURITY DEFINER, zero arguments, plpgsql, executable by anon AND authenticated, exposed at /rest/v1/rpc/rls_auto_enable (PostgREST confirms it is the only other exposed RPC).
- Body not introspectable with available read tools. Name implies it enables RLS (defensive intent); with zero arguments an anonymous caller cannot parameterize it. Cannot be proven harmless without reading its definition.
- Classification: **MEDIUM** (unknown-provenance definer exposed on the public API surface; not proven exploitable for RLS weakening, not proven harmless). Queued for the independent security review. NOT modified in this batch.
- New-table advisor delta: payment_financial_completions joins the RLS-enabled/no-policy group (28 now) — matches the deliberate project posture (serverFns use service-role; RLS is default-deny). No new WARN/ERROR.

### Acceptance
PAYMENT_MIGRATION_ACCEPTANCE=PASS (with two honest labels: authenticated-EXECUTE inferred from the DDL REVOKE with anon positively proven; metadata emptiness proven by raw-object inspection).
PREVIEW_V1_ENABLEMENT=PENDING_OWNER_ACTION — no Vercel access from this session; both flags remain OFF (code default `false`; nothing enabled).

## Payment V1 Preview verification (post-migration, pre-Paystack test)

Head: `6e50e80` (test expansion) → `cfcbb3a` (integrity script). Tests: 510/510 full suite; payment-focused 69/69.

| Item | Result |
|---|---|
| Migration state | APPLIED (Owner-executed); ledger `payment_financial_completions` = 0 rows; live recheck showed NO drift: all transactions/orders pending, frozen ref `DG-MTLML9QG-WWA7` untouched |
| RPC privilege differential (runtime) | service_role → 400 P0001 frozen-guard fired (guard is first statement → provably side-effect-free); anon → 401 42501 permission denied |
| Vercel access | CLI authenticated as `prudence2024`; deployment metadata + timelines used for evidence (Sensitive env values are redacted by Vercel — never extracted) |
| Preview deployment | `dpl_CfEpHfnkkKhR2L6cNAg8WgNH93bS` (`goxlr34e0`), target=preview, READY, created 2026-09-11T22:55:05Z — 36s after head `6e50e80` push → push-built; alias `git-codex-dip-025098` = branch `codex/diplomat-final-hardening`. Delta vs local head = tests/docs-only (`cfcbb3a`), no runtime code |
| Production deployment | `dpl_5XQGbVGskfvh5S7vgKSCPsTyz6DX`, target=production, created 2026-09-11T22:32:37Z |
| Rollout env timeline | `PAYMENT_FINANCIAL_FINALIZATION_V1_ENABLED` created in BOTH scopes ~22:53Z (Production 33m, Preview 34m before inspection). Production build (22:32) PREDATES the variable → running Production cannot carry it; code default is OFF unless env==="true" → PRODUCTION_V1_RUNTIME=OFF_BY_EXISTING_DEPLOYMENT_AND_DEFAULT. Preview build postdates → flag active per Owner configuration. Exact stored values remain Owner-verified (Sensitive redaction) |
| Preview protection | Vercel Deployment Protection (SSO) active on the Preview deployment: anonymous requests incl. forged webhook POST redirect to Vercel login. Paystack webhooks cannot reach Preview without an allowlist — flagged to Owner (paystack support email allowlist or temporary disable during the test) |
| Direct-success safety (live) | Production `/order-success?reference=DG-FAKE-0000` anonymous → 200 with ZERO success-claims; local fake-ref page also carries no false paid copy |
| Webhook security (runtime) | forged-signature POST locally → 400 `{"error":"Invalid signature"}` (timingSafeEqual HMAC-SHA512, length pre-check, raw body first); unknown-reference/binding coverage in `tests/checkout-payment-integrity.test.ts` + `security-validation.test.ts` |
| New matrix pins (all PASS) | provider transport failure · provider status=failed · provider amount mismatch · provider currency mismatch (each fails closed pre-RPC, zero financial writes, order stays pending) · 3-way simultaneous finalization convergence (exactly 1 winner, 2 already-complete, zero app-level financial writes, no inventory change) |
| Polling / cache | PAYMENT_DB_POLLING_COUNT=0 (remaining setInterval hits are UI timers: mobile menu, announcement rotation, hero autoplay); checkout quote rebuilt server-side from DB at attempt creation |
| Sentry (24h, project diplomat-global) | 3 unresolved issues, NONE payment-related, ALL predate current deployment (AbortError Share canceled 7h; `t.flatMap is not a function` 8h — pre-existing, queued for independent review; h3 SSR 500 23h). NEW_PAYMENT_SENTRY_ERRORS=NONE |
| Stale payment code | found 0; legacy finalizer RETAINED_UNTIL_PRODUCTION_ROLLOUT (existing v1 attempts must never fall back; rollback safety) |
| Build gates | TSC PASS · 510/510 · fresh build PASS · SERVERFN_INTEGRITY 516 refs/0 missing (new `npm run verify:serverfn`, chunk-layout aware) · runtime smoke PASS (ROOT 200; /shop,/blog 307→canonical page=1 render data; /faq 200; /sw.js 200; forged webhook 400) · changed-file lint PASS (tests/scripts are eslint-ignored by project config; CRLF-only noise) · diff-check CLEAN |
| Payment matrix evidence levels | 26/26 scenarios PASS_AUTOMATED (fixture suite, real orchestration code + real Postgrest client semantics); live-DB-frozen guard probe = PASS_DB_BACKED; Production direct-success + local forged webhook = PASS_RUNTIME_NON_CHARGING; genuine Paystack charge = PENDING_OWNER_PAYSTACK_E2E. Level-3 positive v1 finalization on Preview is NOT claimable without an SSO-bypassed webhook path or the Owner test |

### Owner test card (read-only DB lookup 2026-09-12)

- Product: **DG-UH-SN70** — TP-Link 7-Port USB 3.0 Hub (id 77d99b80-166e-40b3-93c5-cb360878ce8e), price **₦85,000**, inventory **10** (reserved 0), active
- Quantity 1 → subtotal ₦85,000; delivery_fee setting = **₦10,000**; free_delivery_enabled=false; **expected total ₦95,000 NGN**
- Preview checkout: https://diplomat-global-goxlr34e0-prudence-okwubors-projects.vercel.app/checkout (SSO login required)
- Capture after payment: PAYSTACK_REFERENCE · PROVIDER_STATUS · PROVIDER_AMOUNT (kobo: 9,500,000) · PROVIDER_CURRENCY (NGN); replay callback URL once and expect no second financial mutation
- Caveat: Preview SSO blocks Paystack webhooks — decide allowlist vs temporarily disabling Deployment Protection for the test window; callback verification remains authoritative either way
