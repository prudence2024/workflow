# Branch model and deployment flow

> `testing` = staging · `main` = production. Both were identical at
> creation (`568fb8d`); they diverge only by promoting tested work
> forward. Never rewrite history, never force-push either branch.

## The two branches

| | `testing` (develop here) | `main` (production) |
|---|---|---|
| Purpose | Pre-production integration | Production releases |
| GitHub CI | `ci` workflow on every push/PR | `ci` workflow on every push/PR |
| Cloudflare target | Preview / staging | Production |
| Neon branch | `development` only | `production` (does not exist yet — creating it is its own gated task) |
| Clerk keys | `pk_test_…` / `sk_test_…` | Live keys (never in the repo) |
| Integrations | Test credentials only | Production credentials |
| Deploys | Preview deploys, bulk messaging OFF | Only via an explicit release (never automatic) |

## Promotion flow

1. Do all work on `testing` (feature branches optional, PRs target `main`
   by default so retarget to `testing` while integrating).
2. Verify on staging: typecheck, full suite, build, hosted security
   checks, preview walk-through.
3. Promote with a fast-forward or PR `testing` → `main`. No cherry-picks,
   no squash-rewrites of shared history.
4. Tag the release (`workflow-release-YYYY-MM-DD`) after the production
   deploy is confirmed healthy.

## Hard rules

- `origin/main == origin/testing` only held at creation time; after that
  `main` moves forward exclusively by promotion.
- Production secrets (Neon production URL, Clerk live keys, live provider
  keys) never enter the repo, CI logs, or screenshots.
- Database migrations run manually per `docs/MIGRATIONS.md`, development
  first; production migration is a separate reviewed operation with a
  branch backup.
- The security invariants hold on both branches: `withTenant()`,
  PostgreSQL forced RLS, restricted `workflow_app` role, DB-verified
  membership, RBAC from data — see `README.md` Architecture.
