# Sleek Shop infrastructure

| Responsibility      | Provider            | Rule                                                                      |
| ------------------- | ------------------- | ------------------------------------------------------------------------- |
| Authentication      | Clerk               | Authentication only; no business roles in editable user metadata.         |
| Database            | Supabase PostgreSQL | Business data and authorization tables only; no Supabase Auth or Storage. |
| Media               | Cloudinary          | Store metadata and transformed URLs in PostgreSQL, never image binaries.  |
| Transactional email | Resend              | Orders, contact messages and operational notifications only.              |
| Marketing email     | Brevo               | Consent-based newsletters, promotions and campaigns only.                 |
| Rate limiting/cache | Upstash Redis       | Ephemeral controls and cached data only.                                  |
| Application         | TanStack Start      | All sensitive operations stay in server functions.                        |
| Hosting             | Vercel              | Preview configuration first; production only after approval.              |

## Authorization flow

1. Clerk middleware verifies the signed session cookie.
2. The protected server function obtains the Clerk User ID with `auth()`.
3. Server-only Supabase credentials query `admin_users` by `clerk_user_id`.
4. Access requires `active = true` and an allowed role.
5. Missing sessions redirect to `/admin/login`; insufficient permission returns a 403 page; provider/configuration failure returns 503.

The Supabase secret key bypasses RLS and must remain server-only. Never prefix it with `VITE_`. Every future product, order, customer, coupon, review or media mutation must call the same server authorization boundary before writing data.
