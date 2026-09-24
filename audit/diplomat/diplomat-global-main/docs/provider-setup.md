# Provider setup checklist

The application code is prepared to use Clerk for authentication, Supabase PostgreSQL for business data, Cloudinary for media, Resend for transactional email, Brevo for consent-based marketing, and Upstash Redis for rate limiting. Do not place any secret in a variable beginning with `VITE_`.

## 1. Clerk authentication

1. Create a Clerk application and enable email/password or your approved social providers.
2. In **API keys**, copy the publishable key to `VITE_CLERK_PUBLISHABLE_KEY` and the secret key to `CLERK_SECRET_KEY`.
3. Add the preview and production site origins to Clerk's allowed origins.
4. Set the sign-in URL to `/admin/login` and the post-sign-in redirect to `/admin`.
5. Enable MFA for administrative users. Prefer passkeys or authenticator apps and retain recovery codes offline.
6. Configure a short administrative inactivity lifetime and an absolute lifetime in Clerk. Clerk remains the server authority for expiry; do not implement a browser-only timeout.
7. Create each administrator in Clerk and copy their Clerk User ID.

## 2. Supabase database only

1. Create a Supabase project.
2. Run `supabase/migrations/20260725_admin_users.sql`.
3. Run `supabase/migrations/20260725_commerce_schema.sql`.
4. Copy the project URL to `VITE_SUPABASE_URL`.
5. Copy the publishable key to `VITE_SUPABASE_PUBLISHABLE_KEY`.
6. Copy the server secret key to `SUPABASE_SECRET_KEY`. This key bypasses RLS and must exist only in Vercel server environment variables.
7. Add the first administrator in the SQL editor:

```sql
insert into public.admin_users (clerk_user_id, role, active)
values ('user_from_clerk', 'owner', true);
```

The project must not enable or use Supabase Auth or Supabase Storage.

## 3. Upstash Redis

1. Create a regional Redis database close to the Vercel deployment.
2. Copy its REST URL to `UPSTASH_REDIS_REST_URL`.
3. Copy its REST token to `UPSTASH_REDIS_REST_TOKEN`.
4. Open the database's Rate Limit Analytics dashboard after deployment and verify `sleek-shop:contact`, `sleek-shop:newsletter`, and `sleek-shop:admin` prefixes.
5. The public contact form fails closed until Upstash is configured so it cannot be launched without abuse protection.

## 4. Resend transactional email

1. Add a dedicated sending subdomain such as `mail.your-domain.example` in Resend.
2. Add every SPF and DKIM record supplied by Resend at the DNS provider. Add a DMARC record beginning in monitoring mode, for example `_dmarc.mail` with `v=DMARC1; p=none; rua=mailto:dmarc@your-domain.example`.
3. Wait until Resend reports the domain as verified.
4. Create an API key restricted to sending and set `RESEND_API_KEY`.
5. Set `RESEND_FROM_EMAIL` to a verified sender such as `Sleek Shop <notifications@mail.your-domain.example>`.
6. Set `CONTACT_OWNER_EMAIL` to the mailbox that should receive contact enquiries.
7. Submit one test enquiry and verify both the owner notification and sender acknowledgement.
8. Keep transactional mail on this subdomain and marketing mail on another subdomain to isolate sender reputation.

## 5. Brevo marketing

1. Create a Brevo contact list for website subscribers.
2. Copy its numeric ID to `BREVO_MARKETING_LIST_ID`.
3. Create an API key and set `BREVO_API_KEY`.
4. Configure a marketing sending subdomain different from the Resend transactional subdomain.
5. Enable a double-opt-in form or workflow before launching campaigns.
6. Only call `subscribeMarketingContact` after an unchecked consent box is explicitly selected. Store the consent source and timestamp.
7. Every campaign must include an unsubscribe link and suppression must be honored.

## 6. Cloudinary media

1. Create a Cloudinary product environment.
2. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and the server-only `CLOUDINARY_API_SECRET`.
3. Create a restricted upload preset for product images if the admin UI uses direct browser uploads.
4. Use only server-generated signatures. Never put the API secret in client code.
5. Store the returned `public_id`, `secure_url`, dimensions, and alt text in `product_images`; do not store image binaries in PostgreSQL.
6. Request automatic format and quality transformations for storefront delivery.

## 7. Vercel

1. Add all variables separately for Preview and Production.
2. Use test credentials in Preview and production credentials only in Production.
3. Leave build command and output settings on framework auto-detection.
4. Deploy the `testing` branch to Preview first.
5. Test anonymous admin access, an allowed owner, a non-admin Clerk user, the contact form, and provider outage behavior.
6. Promote only after the preview checks pass and the production domain is configured in Clerk.

## Required operational checks

- Rotate leaked or copied secrets immediately; never commit `.env.local`.
- Review Clerk sign-in activity and Upstash rate-limit analytics weekly.
- Review Resend bounces/complaints and Brevo suppressions before campaigns.
- Require MFA for every owner/admin account.
- Use `writeAuditEvent` in every future product, order, coupon, inventory, review, role, and media mutation.
- Keep the production dependency audit at zero high-severity findings.
