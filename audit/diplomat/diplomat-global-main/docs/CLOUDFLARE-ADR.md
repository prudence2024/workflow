# ADR: Cloudflare in front of Diplomat Global

Status: **DECIDED — DO NOT IMPLEMENT NOW** (`CLOUDFLARE_IMPLEMENT_NOW=NO`)
Date: Phase 5 (September 2026)

## Context

The stack already runs Vercel (edge/CDN/SSR hosting), Cloudinary (media),
Clerk (auth), Supabase (database), Upstash (rate limiting), Sentry (errors)
and Paystack (payments). The Owner asked whether Cloudflare should be added,
particularly for abuse protection on anonymous public forms
(Contact / Newsletter / Reviews).

## Options evaluated

| Role | Verdict | Rationale |
|---|---|---|
| DNS | OPTIONAL | Registrar-level DNS already works; moving DNS adds an outage coupling for zero app benefit. |
| Proxy/CDN | DUPLICATES_EXISTING_SERVICE | Vercel already provides the edge network, caching and TLS. A proxy in front adds a second TLS terminator, breaks real-client-IP propagation unless configured carefully, and complicates Clerk/Paystack callbacks. |
| WAF | NOT_RECOMMENDED (now) | No evidence of L7 attack traffic in telemetry; Vercel's platform protections + Supabase RLS + server-side authz cover current threats. Revisit only with observed attack evidence. |
| Rate limiting | DUPLICATES_EXISTING_SERVICE | Upstash-backed `checkRateLimit` already rate-limits contact/review/newsletter/search server-side (see `rate-limit.server.ts`). Client debounce was never treated as the security control. |
| Turnstile (CAPTCHA) | OPTIONAL (later) | A meaningful second layer against scripted form abuse **if** abuse appears. Requires a public-site integration pass and would sit behind the existing server rate limits, not replace them. |
| Workers | NOT_RECOMMENDED | No workload belongs outside the TanStack Start server functions; a second runtime splits the security boundary. |

## Compatibility risks if a proxy were added anyway

- Clerk: proxying can break the dev/production instance domain binding and
  CSP `connect-src` targets.
- Paystack: webhook + callback URL verification assumes the Vercel origin.
- CSP: an extra frame/host must be added to `frame-src`/`connect-src`, which
  Phase 4.5 deliberately kept strict.
- Real client IP: Sentry + rate limiting key off platform-provided IPs; an
  extra hop can poison these unless forwarded headers are re-trusted.

## Decision

`CLOUDFLARE_RECOMMENDATION=not_now`
`CLOUDFLARE_ROLE=none (DNS/CDN/WAF/Workers all classified above)`
`CLOUDFLARE_DUPLICATION_RISK=high (CDN + rate limiting already provided)`
`CLOUDFLARE_IMPLEMENT_NOW=NO`

Trigger for revisit: sustained scripted abuse of public forms that survives
the existing server-side rate limits. At that point implement Turnstile on
Contact/Reviews/Newsletter only, keeping Upstash limits as the primary
control. Any DNS/production infrastructure change is **OWNER_GATE=REQUIRED**.
