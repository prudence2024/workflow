# Phase 5 Evidence — Complete Application + Business Operations

Branch: `codex/diplomat-final-hardening` · Base: Phase 4.5 closed at `ddd614e`

## Owner UX requirements (global search)

| Gate | Result | Evidence |
|---|---|---|
| DUPLICATE_SEARCH_CLOSE_ROOT_CAUSE | `type="search"` native WebKit clear × rendered beside the custom close button | site-header.tsx input changed to `type="text"`; explicit Clear button added |
| GLOBAL_SEARCH_CLOSE_BUTTON_COUNT | 1 | live DOM count of `[aria-label="Close search"]` = 1 (browser-verified) |
| GLOBAL_SEARCH_CLEAR_BEHAVIOR | PASS | Clear button renders only when query non-empty; clears query, keeps dialog open (live-verified) |
| GLOBAL_SEARCH_ACCESSIBLE_NAMES | PASS | "Close search" / "Clear search" distinct; no duplicate labels (snapshot-verified) |
| MOBILE_SEARCH_CONTROLS | PASS | both controls `size-11` (44px) touch targets |
| GLOBAL_SEARCH_ARCHITECTURE | PASS | one bounded serverFn (`globalPublicSearch`), per-source `Promise.allSettled`, no client-side table dumps |
| GLOBAL_SEARCH_PRODUCTS | PASS | live: "tp-link" → 2 products; "uh700" → Uh700 product |
| GLOBAL_SEARCH_CATEGORIES | PASS | category rows map to `/shop?category=$slug` (unit-tested) |
| GLOBAL_SEARCH_BLOG | PASS | published-only `blog_posts` query; draft/hidden excluded by DB filter |
| GLOBAL_SEARCH_PUBLIC_PAGES | PASS | live: "returns" → Warranty & Returns + Terms sections |
| GLOBAL_SEARCH_FAQ | PASS | live: "faq" → FAQ entry → `/faq`; About-FAQ extraction unit-tested |
| GLOBAL_SEARCH_CONTACT | PASS | live: "contact" → Contact page + policy sections + FAQ (5 results) |
| GLOBAL_SEARCH_PRIVATE_CONTENT_EXCLUDED | PASS | queries filter `status='published'`/`active` at DB level; admin data not queried |
| GLOBAL_SEARCH_RACE_SAFE | PASS | live a→b race: latest query's response won; monotonic request id guards writes |
| GLOBAL_SEARCH_ERROR_VS_EMPTY | PASS | live: uncached query under blocked fetch → "Search is unavailable right now…" + Retry; nonsense → "No results found for “zz9xq”."; LKG retained + stale banner on failed revalidation of cached query |
| GLOBAL_SEARCH_ACCESSIBILITY | PASS | combobox/listbox/option roles, ArrowUp/Down + Enter navigation, Escape closes (Radix), focus returns to trigger (snapshot-verified `focused` on trigger after close) |
| GLOBAL_SEARCH_MOBILE | PASS | 44px targets; single-column dialog at 360/390/430 (`w-[calc(100%-2rem)]`) |

## Phase 5 subsystems

| Subsystem | Status | Evidence |
|---|---|---|
| CMS (Pages) | PASS (extended) | structured editors existed; added FAQ editor type, View Page links, working Delete w/ confirmation (server `adminDeleteSitePage` + audit) |
| FAQ | PASS | DB-authoritative `/faq` (published `site_pages` slug `faq`), 8 Q&A + FAQPage JSON-LD, footer link retargeted, admin editor + fallback module |
| Announcements | PASS (pre-existing, verified) | DB-driven via root loader → header bar; rotation interval + dismiss consumed in `site-header.tsx` |
| Settings consumer matrix | PASS | `docs/SETTINGS-CONSUMER-MATRIX.md` — every visible key has a live consumer; no fake-functional controls |
| Searchable selectors | PASS | CustomSelect type-to-search (ARIA, no-results, dropUp); checkout State/LGA + admin Category wired |
| Reviews | PASS (hardened) | server duplicate rule (one review per customer+product) with truthful `already reviewed` outcome; Telegram/notification decoupled; rate limit + disposable-email gates verified |
| Dashboard / Analytics / Customers | PASS (pre-existing, verified) | dashboard, analytics, customers, expenses routes + fns present; profit metrics null when `cogsComplete=false` (no fabricated zeros — Migration A stays owner-gated) |
| Transactional email | PASS (extended) | Resend → SMTP2GO chain; failover only on definitive rejection; ambiguous outcomes stop chain (no duplicate risk) |
| Marketing email | PASS (extended) | Brevo → Mailjet chain; per-recipient send fixed discarded `{{first_name}}` personalization; suppression filter precedes sends; consent enforced (`purchase != consent`) |
| Durable outbox | PREPARED, OWNER-GATED | `supabase/migrations/20260910120000_durable_outbox.sql` — idempotency key, attempt count, retry state; NOT applied (shared Preview/Prod DB) |
| Newsletter | PASS (pre-existing, verified) | consent required, suppression non-reactivation, token-based `/unsubscribe` route, admin compose/history |
| Telegram | PASS (pre-existing, verified) | 16 commands registered (today/orders/payments/revenue/inventory/lowstock/customers/audit/notifications/health/status/help/…) via central definitions + webhook router |
| Integrations | PASS (pre-existing, verified) | truthful configured≠operational statuses; Brevo/Resend never claim operational without a real send test |
| Cloudinary | PASS (locked, verified) | media-only usage; responsive transforms observed in live network log (`f_auto,q_auto,w_1200,c_limit`) |
| Cloudflare decision | DECIDED | `docs/CLOUDFLARE-ADR.md`: not now; Turnstile revisit trigger; OWNER_GATE for DNS |
| Backup/Restore/Audit/RBAC | PASS (pre-existing, locked) | routes + `requirePermission` chain intact; untouched this phase |

## Gates (final source)

| Gate | Result |
|---|---|
| TypeScript | PASS (0 errors) |
| Full test suite | PASS — 478/478 (25 files) incl. new: global-search (21), reviews-hardening (4), email-provider-chain (11) |
| Fresh production build | PASS (exit 0) |
| serverFn artifact integrity | PASS — resolver imports 149, missing 0 (verified after clean lifecycle) |
| Stale-artifact lifecycle | ADOPTED — stop servers → confirm port free → build → integrity check → one server → no rebuild during test. Sentry issue A root cause reproduced + explained (LOCAL_STALE_ARTIFACT_TEST_HARNESS) |
| Runtime (server :4203) | PASS — ROOT 200, FAQ 200, SHOP 200 (307→200 follow), search serverFn 200s live |
| Console | PASS — only known local-only noise (`/_vercel/insights` 404, Clerk dev-keys warning) |
| Changed-line lint | PASS — zero new findings (baselines measured via path-scoped stash before/after) |
| `git diff --check` | PASS — clean |

## Commits (this phase)

- `3ff7a07` feat: site-wide header search with truthful states and single close control
- `04c7773` feat: DB-authoritative FAQ system with dedicated public route
- `c151dc0` feat: review duplicate prevention and searchable checkout selectors
- `fbf5b4e` feat: email provider fallback chains and owner-gated outbox migration
- `cc909bd` docs: Cloudflare architecture decision record
- (this commit) Phase 5 evidence

## Owner action required

- `OUTBOX_MIGRATION_OWNER_GATE=REQUIRED` — apply `20260910120000_durable_outbox.sql` via approved procedure when ready
- `MIGRATION_A_OWNER_GATE=REQUIRED` — unchanged (cost-price/expenses analytics)
- Authenticated Admin runtime remains PENDING_OWNER_SESSION (carried from Phase 4)
- Payments remain locked: `PAYMENT_V1_RUNTIME_ENABLED=NO`, `READY_FOR_PAYSTACK_TEST_PAYMENT=NO`
