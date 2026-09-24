# DIPLOMAT GLOBAL — OWNER VOICE ACCEPTANCE CHECKLIST
## Current Status Report — testing HEAD: edad81b

**Last updated:** 2026-08-31
**Branch:** testing
**HEAD:** edad81b
**Tests:** 75/75 PASS
**TSC:** EXIT 0
**Build:** EXIT 0

---

# 2. PUBLIC WEBSITE

## Homepage / Categories

| Item | Status | Evidence |
|------|--------|----------|
| Homepage shows DB categories | ✅ STATIC PASS | `index.tsx` uses `rootCtx.categories` from root loader |
| Clicking category opens Shop with category selected | ✅ STATIC PASS | `<Link to="/shop" search={{ category: cat.slug }}>` |
| Categories propagate to desktop nav | ✅ STATIC PASS | `site-header.tsx` uses root loader categories |
| Categories propagate to mobile hamburger | ✅ STATIC PASS | Same root loader context |
| Categories propagate to Shop selector/strip | ✅ STATIC PASS | `shop.tsx` uses `rootCtx.categories` |
| Categories propagate to Footer Shop links | ✅ STATIC PASS | `site-footer.tsx` maps `rootCategories` |
| No hardcoded category fallback | ✅ STATIC PASS | Empty array fallback, no resurrection |
| Category reorder/disable/delete propagates | ⏳ OWNER_RUNTIME_PENDING | Code is DB-driven, needs live test |

## Newsletter

| Item | Status | Evidence |
|------|--------|----------|
| Duplicate subscriber blocked | ✅ AUTOMATED PASS | Test exists in security-validation.test.ts |
| "Already subscribed" message | ✅ STATIC PASS | `newsletter.server.ts` returns explicit message |
| Suppressed user not silently reactivated | ✅ STATIC PASS | `marketing_suppression` check in subscribe flow |
| Purchase ≠ marketing consent | ✅ STATIC PASS | Customer creation does not set marketing consent |
| Email validation safe/bounded | ✅ AUTOMATED PASS | Email validation tests pass |
| Disposable email policy | ❌ NOT IMPLEMENTED | Owner requirement if kept — no policy implemented |

## Footer

| Item | Status | Evidence |
|------|--------|----------|
| Column 1: logo + description + social links | ✅ STATIC PASS | Brand column with BrandLogo, description, DB socials |
| Social links DB-driven | ✅ STATIC PASS | `rootSocials` from root loader, zero = zero shown |
| Column 2: Shop = All Products + DB categories | ✅ STATIC PASS | Maps `rootCategories` with links |
| Column 3: Help/Company logically grouped | ✅ FIXED (edad81b) | Merged Help+Company, renamed "Buying guides"→"Blog" |
| FAQ links to FAQ content | ✅ FIXED (edad81b) | FAQ now links to `/about` where FAQ section lives |
| Column 4: Address → Email → Phone order | ✅ STATIC PASS | Verified correct order in code |
| Actual email/phone visible | ✅ STATIC PASS | Shows email address and phone number, not just labels |
| Contact/Footer use same settings source | ✅ FIXED (edad81b) | Both use `rootSettings` from root loader |
| No mobile overflow | ✅ STATIC PASS | `min-w-0`, `break-words`, `truncate` on key elements |

## Shop / Products

| Item | Status | Evidence |
|------|--------|----------|
| Clear category filter exists | ✅ STATIC PASS | Category strip on mobile, filter buttons on desktop |
| Homepage category remains selected | ✅ STATIC PASS | URL search params persist across navigation |
| Mobile category strip swipeable | ✅ STATIC PASS | `overflow-x-auto scrollbar-hide` with `scrollSnapType` |
| Selected chip auto-scrolls into view | ✅ STATIC PASS | `useEffect` with `scrollIntoView` |
| Product name/SKU searchable | ✅ STATIC PASS | Search input with server-side query |
| Search bounded/injection-safe | ✅ STATIC PASS | Server-side ILIKE with parameterized query |
| Product cards consistent height | ✅ STATIC PASS | `min-h` on title, `line-clamp-2`, aligned price/CTA |
| Bad-network image fallback | ✅ STATIC PASS | `OptimizedImage` component with fallback |

## Blog

| Item | Status | Evidence |
|------|--------|----------|
| Pagination exists | ✅ STATIC PASS | `blog.index.tsx` has full pagination with page controls |
| Cards consistent with many posts | ✅ STATIC PASS | Grid layout with consistent card structure |
| Double-slash share URL fixed | ✅ OWNER CONFIRMED | Previously fixed |
| Latest Articles dynamic | ✅ STATIC PASS | `getPublicBlogPosts()` from DB, not hardcoded |
| Blog create/edit upload contained on mobile | ⏳ OWNER_RUNTIME_PENDING | Modal with `max-h-[90vh] overflow-y-auto` |
| OG/social sharing runtime verified | ⏳ OWNER_RUNTIME_PENDING | Meta tags set in route head() |

## About / FAQ

| Item | Status | Evidence |
|------|--------|----------|
| FAQ visible in About page | ✅ STATIC PASS | `about.tsx` has FAQSection component |
| FAQ reads DB data | ✅ STATIC PASS | `pageData.faq` from `getPublicPageBySlug("about")` |
| FAQ create/edit in Admin | ⏳ OWNER_RUNTIME_PENDING | Managed through Pages Admin |
| Existing FAQ content preserved | ✅ STATIC PASS | Falls back to empty array if no DB data |

## Contact

| Item | Status | Evidence |
|------|--------|----------|
| Unicode-aware name validation | ✅ AUTOMATED PASS | Tests in security-validation.test.ts |
| Email validation | ✅ AUTOMATED PASS | Tests pass |
| Bounded subject/message | ✅ STATIC PASS | Server-side Zod validation |
| SQL/XSS safe | ✅ STATIC PASS | Supabase query builder, no raw SQL |
| Terms/Privacy consent checkbox | ✅ STATIC PASS | Links to `/privacy-policy` and `/terms-and-conditions` |
| Shared phone input | ✅ STATIC PASS | `PhoneInput` component with E.164 |
| Desktop: address left, map card, form right | ✅ STATIC PASS | `lg:grid-cols-[0.8fr_1.2fr]` with compact map card |
| No giant map section | ✅ STATIC PASS | Compact card replaces iframe |
| Mobile: address → map → form | ✅ STATIC PASS | Grid stacks on mobile |
| Contact social links from DB | ✅ STATIC PASS | `getPublicSocialLinks()` in loader |
| Contact/Footer match exactly | ✅ FIXED (edad81b) | Both use same DB settings source |

## Leave a Review

| Item | Status | Evidence |
|------|--------|----------|
| Name validation (no digits) | ✅ STATIC PASS | Client + server validation |
| Email validation | ✅ STATIC PASS | `type="email"` + server Zod |
| Review content bounded | ✅ STATIC PASS | Min 10 chars, max 2000 chars |
| Consent links Privacy Policy | ✅ FIXED (edad81b) | Added Privacy Policy link to consent text |
| Modal stays open until action | ✅ STATIC PASS | Full page form, not auto-closing |
| Mobile responsive | ✅ STATIC PASS | Standard form layout |

---

# 3. ADMIN PANEL

## Global Mobile Alignment

| Item | Status | Evidence |
|------|--------|----------|
| Consistent gutters at 320-430 | ✅ STATIC PASS | `p-3 sm:p-6` on main content |
| Page content aligns with header | ✅ STATIC PASS | Flex layout with fixed header |
| Search/theme/notification aligned | ✅ STATIC PASS | TopNav with consistent spacing |
| No whole-page horizontal scroll | ⏳ OWNER_RUNTIME_PENDING | Needs visual test |
| Tables may scroll internally | ✅ STATIC PASS | `overflow-x-auto` on table containers |

## Performance / Stale Data

| Item | Status | Evidence |
|------|--------|----------|
| No ~5-second content wait | ⏳ OWNER_RUNTIME_PENDING | Needs runtime measurement |
| No fake zero → real number flash | ⏳ OWNER_RUNTIME_PENDING | Loading skeletons exist |
| Measure auth/RBAC/DB/loader time | ❌ NOT IMPLEMENTED | Needs instrumentation |

## Dashboard

| Item | Status | Evidence |
|------|--------|----------|
| Week/Month/YTD Sales correct | ✅ STATIC PASS | Server-side aggregation in `adminGetDashboardFinancialSummary` |
| Paid Orders, Units, AOV correct | ✅ STATIC PASS | Computed from paid orders |
| Refunds correct | ✅ STATIC PASS | Filtered from `payment_transactions` |
| Gross Profit/Gross Margin | ✅ STATIC PASS | Net Sales - COGS with data quality flags |
| Expenses correct | ✅ STATIC PASS | Summed from `expenses` table |
| Net Profit correct | ✅ STATIC PASS | Gross Profit - Expenses, null when data incomplete |
| Missing COGS shown Partial/Unknown | ✅ STATIC PASS | `dataQuality` prop on cards |
| Recent Orders Pending badge overlap | ⏳ OWNER_RUNTIME_PENDING | Needs visual test |

## Mobile Search

| Item | Status | Evidence |
|------|--------|----------|
| Mobile search icon works | ✅ STATIC PASS | Search in TopNav with mobile handling |
| Per-entity permission filtering | ✅ STATIC PASS | `requirePermission` per entity type in `adminGlobalSearch` |

## Analytics

| Item | Status | Evidence |
|------|--------|----------|
| Mobile layout professional | ⏳ OWNER_RUNTIME_PENDING | Needs visual test |
| Period metrics runtime verified | ⏳ OWNER_RUNTIME_PENDING | Needs live data test |
| Top products/SKUs/categories | ✅ STATIC PASS | Server-side aggregation |

## Products

| Item | Status | Evidence |
|------|--------|----------|
| Product Create mobile redesign | ✅ FIXED (edad81b) | Responsive grids: 1-col mobile, 2-col tablet, 3-col desktop |
| Product Edit mobile redesign | ✅ FIXED (edad81b) | Same ProductForm component |
| Slug/SKU do not overlap | ✅ FIXED (edad81b) | `grid-cols-1 sm:grid-cols-2` |
| Price/Compare-at/Condition | ✅ FIXED (edad81b) | `grid-cols-1 sm:grid-cols-3` |
| Specs scrollable/usable | ✅ FIXED (edad81b) | Stack on mobile (`flex-col sm:flex-row`) |
| Modal vertically scrolls | ✅ STATIC PASS | `max-h-[90vh] overflow-y-auto` |
| Save/Cancel reachable | ✅ STATIC PASS | Fixed at bottom of form |
| >5MB upload warning | ⏳ OWNER_RUNTIME_PENDING | Client-side check exists |
| Dimension/format validation | ⏳ OWNER_RUNTIME_PENDING | Server-side enforcement |

## Orders

| Item | Status | Evidence |
|------|--------|----------|
| Mobile refresh works | ⏳ OWNER_RUNTIME_PENDING | Needs visual test |
| Customer Name shows actual name | ✅ STATIC PASS | `first_name + last_name`, fallback to email |
| Customer Email remains email | ✅ STATIC PASS | Separate `email` field displayed |
| Mobile statuses don't overlap | ⏳ OWNER_RUNTIME_PENDING | Needs visual test |

## Transactions / Customers

| Item | Status | Evidence |
|------|--------|----------|
| Transaction detail opens | ✅ OWNER CONFIRMED | Previously confirmed |
| Customer detail opens | ✅ OWNER CONFIRMED | Previously confirmed |
| Customer Active/Inactive vs Marketing | ⏳ OWNER_RUNTIME_PENDING | Needs visual verification |

## Social Links

| Item | Status | Evidence |
|------|--------|----------|
| Links propagate to Footer | ✅ STATIC PASS | `rootSocials` from root loader |
| Links propagate to Contact | ✅ STATIC PASS | `getPublicSocialLinks()` in contact loader |
| Zero DB links = zero public links | ✅ STATIC PASS | Empty array when no DB links |

## Settings / Announcements

| Item | Status | Evidence |
|------|--------|----------|
| Every setting has documented consumer | ⏳ PARTIAL | Some consumers documented in SETTINGS-MAP.md |
| Nigeria phone lock works server-side | ✅ STATIC PASS | `phone_lock_nigeria` checked in server validation |
| Announcement CRUD works | ✅ STATIC PASS | Settings page has create/edit/reorder/enable/disable |
| Zero announcements = zero public | ✅ STATIC PASS | Empty array fallback |

---

# 4. SECURITY

| Item | Status | Evidence |
|------|--------|----------|
| Server-side validation on all forms | ✅ AUTOMATED PASS | Tests in security-validation.test.ts |
| SQL-safe query construction | ✅ STATIC PASS | Supabase query builder throughout |
| Stored XSS tests | ✅ AUTOMATED PASS | XSS tests pass |
| CSV formula injection protection | ✅ AUTOMATED PASS | Tests pass |
| CSRF/session/CORS audited | ✅ STATIC PASS | Clerk + SameSite cookies |
| Upload MIME/extension validation | ✅ STATIC PASS | Server-side validation |
| Cloudinary secret server-only | ✅ STATIC PASS | Never in client code |
| f_auto, q_auto responsive | ✅ STATIC PASS | `productCardImage()` + `OptimizedImage` |

---

# 5. DATABASE / MIGRATIONS

| Item | Status |
|------|--------|
| Cost/expenses migration ready | ✅ CODE READY — HOLD for Owner approval |
| Performance indexes ready | ✅ CODE READY — HOLD for Owner approval |
| Both migrations unapplied | ✅ CONFIRMED |

---

# 12. RELEASE STATUS

```
VOICE-WALKTHROUGH REQUIREMENTS CAPTURED: YES
ALL IMPLEMENTED: PARTIAL (see checklist above)
ALL RUNTIME TESTED: NO — owner visual/runtime testing needed
MIGRATIONS APPLIED: NO
FORGED PAYSTACK APP-LEVEL TEST: NO
REAL PAYSTACK TEST PAYMENT: NO
TELEGRAM OPERATIONAL PROOF: NO
FINAL LIGHTHOUSE: NO
SPECIALIST SKILL SEQUENCE COMPLETE: NO
FULL-SYSTEM-AUDIT LAST: NO
READY FOR TESTING -> MAIN: NO
SAFE FOR PRODUCTION: NO
```

## Files Changed This Session

| File | Change |
|------|--------|
| `src/components/site-footer.tsx` | Merged Help+Company, renamed "Buying guides"→"Blog", fixed FAQ link |
| `src/routes/contact.tsx` | Replaced hardcoded email/phone with DB settings |
| `src/routes/reviews.tsx` | Added Privacy Policy link to consent text |
| `src/components/admin/product-form.tsx` | Responsive grids for mobile (1-col/2-col/3-col), spec rows stack |

## Owner Runtime Testing Still Needed

1. Visual test: Footer at 320/375/768/1024/1440
2. Visual test: Contact page layout at all breakpoints
3. Visual test: Product Create/Edit modal at 320-430
4. Visual test: Admin mobile alignment across all pages
5. Runtime test: Category lifecycle (create→rename→reorder→disable→enable→delete)
6. Runtime test: Newsletter duplicate guard
7. Runtime test: Review consent with Privacy Policy link
8. Runtime test: Dashboard financial cards with real data
9. Runtime test: Settings consumers
10. Runtime test: Announcements propagation
