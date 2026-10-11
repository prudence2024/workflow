# Netlify demo runtime

The demo application runs on Netlify's native Next.js runtime. It uses Node
SSR/RSC/API routes and Server Actions; it does not use the Cloudflare
OpenNext Worker or Hyperdrive for normal requests.

## Required Netlify variables

Set these in the Netlify demo site's environment, without committing values:

- `DATABASE_URL` — restricted `workflow_app` connection to the development/demo Neon branch.
- `DATABASE_RUNTIME=node`
- `NEON_BRANCH=development`
- `NEXT_PUBLIC_APP_URL` — the actual Netlify demo origin.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_AUTHORIZED_PARTIES` — include the Netlify demo origin; keep the testing Cloudflare origin during migration.
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET` — the existing private R2 bucket.

`DATABASE_URL_UNPOOLED` is needed only for migration/maintenance commands, not
for normal requests. The app never uses an owner or `BYPASSRLS` connection.

## Optional provider variables

- `R2_ENDPOINT` — explicit S3 endpoint; otherwise the standard R2 endpoint is derived from `R2_ACCOUNT_ID`.
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SIGNING_SECRET`
- `TERMII_API_KEY`, `TERMII_BASE_URL`, `TERMII_SENDER_ID`, `TERMII_WEBHOOK_SECRET`
- `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY`
- `NVIDIA_API_KEY`, `AI_MODEL_FAST`, `AI_MODEL_REASONING`, `AI_MODEL_FALLBACK`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (reserved; no current app path requires them)
- `WORKER_SECRET` only if the app's protected outbox endpoint is used by a trusted worker.

## Runtime boundary

The Railway form worker remains separate and continues to use
`WORKER_DATABASE_URL` against the same development/demo database. It claims
the existing Neon jobs and writes results back for Netlify to read. Playwright
is not installed or launched by the Netlify app.

Cloudflare Worker/OpenNext files, `wrangler.jsonc`, the testing Worker, and the
R2 bucket remain as a fallback. The fallback's edge database transport is the
existing Neon serverless path; the Netlify path is explicitly Node/Postgres.

## Build

Netlify should run `npm run build` with its native Next.js adapter. Do not run
`npm run build:worker` for the Netlify site.
