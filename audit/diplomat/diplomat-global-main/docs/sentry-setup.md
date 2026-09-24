# Sentry error tracking

The application is prepared for browser and server error reporting, TanStack route tracing, request/server-function instrumentation, privacy scrubbing, and private source-map uploads. Sentry remains disabled when its DSN is missing and no build upload occurs without all three build credentials.

## Create and connect the project

1. Create a Sentry organization and a **TanStack Start React** project.
2. Copy the project DSN into both `VITE_SENTRY_DSN` and `SENTRY_DSN`.
3. Copy the organization slug into `SENTRY_ORG` and project slug into `SENTRY_PROJECT`.
4. Create an organization auth token for CI source-map uploads and store it as `SENTRY_AUTH_TOKEN`. This is build-only and must never use the `VITE_` prefix.
5. Set `VITE_SENTRY_ENVIRONMENT` and `SENTRY_ENVIRONMENT` to `preview` in Vercel Preview and `production` in Vercel Production.
6. Set `VITE_SENTRY_TRACES_SAMPLE_RATE` and `SENTRY_TRACES_SAMPLE_RATE` to `0.1` initially. Increase only for a measured debugging need.
7. Optionally set `VITE_SENTRY_RELEASE` and `SENTRY_RELEASE` to the same immutable commit SHA. Vercel can use `VERCEL_GIT_COMMIT_SHA`.

## Vercel configuration

Add the variables in **Project → Settings → Environment Variables**. Put DSNs and sampling configuration in Preview and Production. Restrict `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` to build environments that upload source maps. Never commit the token or paste it into client-side variables.

When all build credentials are present, the Vite integration uploads source maps and removes generated map files after upload. Builds without those credentials do not generate public source maps.

## Privacy and alerting

- Default PII collection is disabled.
- Request headers, cookies, bodies, query strings, email addresses, and IP addresses are removed in application-level `beforeSend` processing.
- Do not attach checkout form state, tokens, passwords, card data, message bodies, or raw customer records to Sentry events.
- In Sentry, add server-side data scrubbing rules as a second layer.
- Create a high-priority alert for a sustained 5xx/error-rate increase and failed checkout/auth flows; route individual lower-severity errors to the normal review queue.

## Verify after preview deployment

1. Deploy the `testing` branch to Vercel Preview.
2. Trigger a safe browser test error and a safe server test error in a temporary, access-controlled test path.
3. Confirm both events arrive in the `preview` environment.
4. Confirm stack frames resolve to source files and line numbers.
5. Inspect event payloads and verify cookies, authorization headers, form bodies, emails, IP addresses, and query strings are absent.
6. Confirm alert delivery and issue grouping.
7. Remove the temporary test path immediately after verification.

Do not mark Sentry complete until event capture, source mapping, redaction, and alert delivery have all been verified end to end.
