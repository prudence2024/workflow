# Durable Cloudflare testing environment

Workflow testing deploys to a dedicated, persistent Worker:

- Worker: `workflow-testing`
- Stable URL: `https://workflow-testing.okwuborprudence.workers.dev`
- Git branch: `testing`
- Neon branch: `development`
- Clerk instance: test/development

This environment is separate from the top-level `workflow` Worker and from
production. It does not use the ephemeral Wrangler Preview deployment model.

## Deploy

Build and deploy the current testing checkout with:

```text
npm run build:worker
npm run deploy:testing
```

Wrangler deployments preserve secrets. `--keep-vars` may be used when values
managed outside this file must also remain attached:

```text
npm run deploy:testing
```

## One-time secret setup

Configure these names once for the `testing` environment only. Values must be
development/test credentials and must never be committed:

- `CLERK_SECRET_KEY`
- `CLERK_ENCRYPTION_KEY`
- `DATABASE_URL`
- `WORKER_SECRET`

The public Clerk publishable key is a non-secret testing variable in
`wrangler.jsonc`. Verify names without reading values:

```text
npx wrangler secret list --env testing
```

Never use production Neon, Clerk, provider, or worker credentials here.

## Build identity

`BUILD_GIT_SHA` is exposed by the readiness/health response as a safe build
identifier. Update it with the testing commit before a later staging deploy.

## Separation rules

- Do not use `wrangler deploy` without `--env testing` for staging work.
- Do not use `--env production` from this branch.
- Do not use `--ignore-base-config` for the durable testing environment.
- Do not place secret values in this repository.
