# Diplomat Global

Premium electronics e-commerce platform for Nigeria. Shop monitors, cameras, computing gear, and printers with secure Paystack payment and nationwide delivery.

## Tech Stack

| Layer | Technology | Status |
|---|---|---|
| Framework | TanStack Start (React, Vite, Nitro) | Active |
| Routing | TanStack Router (file-based) | Active |
| Authentication | Clerk | Active |
| Authorization | Custom RBAC (admin_users → roles → permissions) | Active |
| Database | Supabase (PostgreSQL) | Active |
| Media | Cloudinary | Active |
| Payments | Paystack (hosted checkout) | Active |
| Email (transactional) | Resend | Configuration pending |
| Email (marketing) | Brevo | Sender verification pending |
| Monitoring | Sentry | Active |
| Telegram | Telegram Bot API | Active |
| Deployment | Vercel | Active |
| Knowledge Graph | Graphiti (Python, isolated) | Foundation only |

## System Architecture

```
Public Website (React)
    │
    ├─ Product Catalogue
    ├─ Cart & Checkout
    ├─ Contact Form
    ├─ Reviews/Testimonials
    ├─ Blog
    └─ CMS Pages

Admin Dashboard (React + RBAC)
    │
    ├─ Products / Categories / Inventory
    ├─ Orders / Payments / Receipts
    ├─ Customers / Contacts
    ├─ Marketing (Newsletter, Coupons)
    ├─ CMS (Pages, Blog, Hero Slides)
    ├─ Settings / Integrations
    ├─ Staff / Roles / Permissions
    └─ Audit Logs

Server Layer (TanStack Start SSR)
    │
    ├─ Clerk authentication
    ├─ RBAC authorization (server-side)
    ├─ Supabase queries
    ├─ Paystack integration
    ├─ Cloudinary uploads
    ├─ Telegram notifications
    └─ Email (Resend/Brevo)

External Services
    │
    ├─ Clerk (identity)
    ├─ Supabase (database)
    ├─ Cloudinary (media)
    ├─ Paystack (payments)
    ├─ Telegram Bot API
    ├─ Resend (transactional email)
    ├─ Brevo (marketing email)
    └─ Sentry (error monitoring)
```

## Authentication & Authorization

**Authentication**: Clerk handles user identity, sessions, and sign-in/sign-up.

**Authorization**: Custom RBAC system:
```
Clerk session → admin_users → role_id → roles → role_permissions → permissions
```

- `admin_users.role` (deprecated text column) must NOT be used for authorization
- All authorization checks use `role_id` → `roles.key` via database join
- Server-side enforcement via `getAdminAccess()` and `requirePermission()`
- Client-side UI hides elements but server is the security boundary

**Owner bootstrap**: First admin claims owner access via `/admin/unauthorized?claim=1`. The `claimOwnerAccess()` function creates the owner row with the correct `role_id`.

## Database Schema

Managed via Supabase migrations in `supabase/migrations/`. Key tables:

- `admin_users` — Admin accounts with `clerk_user_id`, `role_id`, `active`
- `roles` — Permission groups (owner, admin, editor, support, etc.)
- `role_permissions` — Many-to-many: roles ↔ permissions
- `permissions` — Individual permission keys (e.g., `products.view`)
- `products` / `categories` / `inventory` — Commerce core
- `orders` / `order_items` / `transactions` / `receipts` — Order lifecycle
- `customers` / `contacts` / `messages` — Customer data
- `coupons` — Discount codes
- `site_pages` — CMS content
- `blog_posts` — Blog content
- `site_settings` — Key-value configuration
- `social_links` — Social media links
- `hero_slides` — Homepage hero carousel
- `testimonials` — Customer reviews (with moderation)
- `audit_logs` — Security/operations audit trail
- `marketing_suppression` — Email opt-outs

## Key Features

### Public Website
- Product catalogue with search, filtering, categories
- Cart with quantity management
- Checkout with Paystack hosted payment
- Coupon code application
- Contact form with server-side validation
- Reviews/testimonials with moderation
- CMS pages (About, Terms, Privacy, Warranty)
- Blog with categories
- Google Maps integration on Contact page

### Admin Dashboard
- Full CRUD for products, categories, inventory
- Order management with status workflow
- Customer management
- Marketing: newsletter, coupons, email campaigns
- CMS: pages, blog posts, hero slides, testimonials
- Staff management with role-based access
- Role & permission editor (Owner only)
- Audit logs
- Integrations status (Clerk, Supabase, Cloudinary, Paystack, Telegram)
- Server-side pagination on all data tables (10 per page)

### Payments (Paystack)
- Hosted checkout (redirect to Paystack)
- Server-authoritative amount calculation
- Webhook with HMAC-SHA512 signature verification
- Idempotent payment finalization (CAS pattern)
- Atomic inventory decrement
- Atomic coupon usage increment (only after successful payment)
- Receipt generation
- Telegram payment alerts

### Telegram Operations Bot
- Webhook-based command receiver
- Commands: /start, /help, /status, /health, /payments, /revenue, /leads
- Automatic alerts: payment, contact, newsletter, order, low-stock
- Admin Integrations page for diagnostics and test messages

## Environment Variables

All secrets are server-side only. `VITE_*` variables are browser-visible.

### Clerk (Required)
| Variable | Type | Description |
|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | PUBLIC | Clerk publishable key |
| `CLERK_SECRET_KEY` | SERVER | Clerk secret key |
| `CLERK_AUTHORIZED_PARTIES` | SERVER | Comma-separated allowed origins |
| `INITIAL_ADMIN_CLERK_USER_ID` | SERVER | First admin's Clerk user ID |

### Supabase (Required)
| Variable | Type | Description |
|---|---|---|
| `SUPABASE_URL` | SERVER | Supabase project URL |
| `SUPABASE_SECRET_KEY` | SERVER | Supabase service role key |

### Cloudinary (Required)
| Variable | Type | Description |
|---|---|---|
| `CLOUDINARY_CLOUD_NAME` | SERVER | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | SERVER | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | SERVER | Cloudinary API secret |

### Paystack (Required for payments)
| Variable | Type | Description |
|---|---|---|
| `PAYSTACK_SECRET_KEY` | SERVER | Paystack secret key (sk_test_ or sk_live_) |
| `PAYSTACK_PUBLIC_KEY` | OPTIONAL | Paystack public key (currently unused by hosted checkout) |

### Resend (Optional — transactional email)
| Variable | Type | Description |
|---|---|---|
| `RESEND_API_KEY` | SERVER | Resend API key |
| `RESEND_FROM_EMAIL` | SERVER | Sender email address |
| `RESEND_DOMAIN_VERIFIED` | SERVER | Domain verification status |

### Brevo (Optional — marketing email)
| Variable | Type | Description |
|---|---|---|
| `BREVO_API_KEY` | SERVER | Brevo API key |
| `BREVO_SENDER_EMAIL` | SERVER | Sender email |
| `BREVO_MARKETING_LIST_ID` | SERVER | Marketing list ID |

### Telegram (Optional — operations bot)
| Variable | Type | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | SERVER | Bot token from @BotFather |
| `TELEGRAM_ADMIN_CHAT_ID` | SERVER | Owner's numeric Telegram chat ID |

### Sentry (Optional — error monitoring)
| Variable | Type | Description |
|---|---|---|
| `VITE_SENTRY_DSN` | PUBLIC | Sentry DSN |
| `SENTRY_DSN` | SERVER | Sentry DSN (server-side) |
| `SENTRY_AUTH_TOKEN` | SERVER | Sentry auth token for source maps |
| `SENTRY_ORG` | SERVER | Sentry organization |
| `SENTRY_PROJECT` | SERVER | Sentry project |

### Application
| Variable | Type | Description |
|---|---|---|
| `VITE_SITE_URL` | PUBLIC | Canonical site URL |
| `CONTACT_OWNER_EMAIL` | SERVER | Contact form recipient |

## Local Development

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Fill in required values

# Start dev server
npm run dev
```

## Build & Deploy

```bash
# Type check
npx tsc --noEmit

# Build
npm run build

# Lint
npm run lint
```

Deployed automatically to Vercel on push to `testing` branch.

## Repository Structure

```
src/
├── routes/              # TanStack Router file-based routes
│   ├── __root.tsx       # Root layout + error boundary
│   ├── admin.tsx        # Admin layout (RBAC guard)
│   ├── dashboard.tsx    # Dashboard layout
│   ├── checkout.tsx     # Checkout flow
│   ├── contact.tsx      # Contact page with map
│   └── api/webhook/     # Webhook endpoints
├── components/
│   ├── admin/           # Admin UI components
│   ├── dashboard/       # Dashboard layout + sidebar
│   └── ui/              # Shared UI primitives (Radix + Tailwind)
├── lib/
│   ├── admin/           # Admin server functions + RBAC
│   ├── telegram/        # Telegram bot commands
│   ├── checkout.server.ts
│   ├── payment-finalize.server.ts
│   ├── paystack.server.ts
│   └── database.server.ts
├── start.ts             # TanStack Start entry (Clerk middleware)
└── routeTree.gen.ts     # Auto-generated route tree

supabase/migrations/     # Database migrations
services/graphiti/       # Isolated Python Graphiti service
.agents/skills/          # Freebuff testing skills
docs/                    # Documentation
```

## Engineering Standards

This project follows **System Breaker Mode** for all meaningful tasks. See `docs/SYSTEM-BREAKER-MODE.md` for the full process.

### Key Rules
- Never expose secrets (VITE_* = browser-visible, never secrets)
- Server-calculated amounts are authoritative for payments
- Browser prices/totals are untrusted
- Authorization is server-side, not CSS hiding
- Build committed code before deployment claims
- Report untested areas honestly

### Testing Skills
Reusable testing skills live in `.agents/skills/`:
- `system-breaker` — Primary adversarial methodology
- `security-audit` — Security controls assessment
- `auth-rbac-breaker` — Login and permission testing
- `payments-paystack-test` — Paystack test E2E
- `checkout-breaker` — Checkout flow integrity
- `database-integrity` — Schema and data integrity
- `deployment-verifier` — Clean committed build
- `ui-ux-breaker` — UI/UX state testing
- `telegram-ops-test` — Telegram bot verification
- `full-system-audit` — Orchestrate all specialists

## Business Rules

- **Delivery fee**: ₦7,500 (free above ₦250,000) — hardcoded, no DB config
- **SKU format**: `DG-[CODE]-SN[NUMBER]` (e.g., DG-CMP-SN10)
- **Coupon validation**: Server-authoritative, revalidated at payment
- **Inventory**: Atomic CAS decrement, never negative
- **Payment**: Server amount verification, idempotent webhook handling
- **Testimonials**: Pending → Approved/Rejected moderation workflow
- **Reviews**: Public display only shows approved testimonials

## Known Limitations

- **Admin owner login**: Requires runtime verification after deployment
- **Paystack TEST E2E**: Pending test-mode credentials in Vercel
- **Delivery fee**: No authoritative DB setting — business decision pending
- **Graphiti**: Foundation installed, live ingestion blocked (no Neo4j/LLM credentials)
- **Email providers**: Resend/Brevo sender/domain verification pending
- **Google Maps**: Requires owner to configure embed URL in Admin Settings
- **Lovable Vite config**: `@lovable.dev/vite-tanstack-config` still in use — requires careful migration to standard TanStack Start config

## License

Private — Diplomat Global Tech-Solutions.
