# Form automation worker — testing deployment

`workflow-form-worker-testing` is the browser-capable Node/Playwright consumer for the testing environment. The app queues analysis and submission jobs; this process claims them, runs Chromium, and persists safe status/evidence.

## Runtime contract

Build with `Dockerfile.form-worker` and start with:

```text
npm run form-worker
```

Required environment names:

- `WORKER_DATABASE_URL` — restricted development PostgreSQL login. It must not be an owner, superuser, or `BYPASSRLS` role.
- `NEON_BRANCH=development` — required safety guard; the worker refuses production.
- `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` — supplied by the Playwright image.

Optional environment names:

- `FORM_WORKER_POLL_MS` (default 15000)
- `FORM_WORKER_BATCH_SIZE` (default 5)
- `FORM_WORKER_HEALTH_PORT` (default 8787)
- `PLAYWRIGHT_CHROME_PATH` when the host supplies a non-default browser path

The worker role needs only the permissions required to claim jobs, read tenant-scoped mappings and execution rows, update status/results, write safe evidence, and record heartbeats. Keep the existing transaction/RLS boundary and grant membership only for the restricted runtime role.

Startup now requires `NEON_BRANCH=development` and `WORKER_DATABASE_URL`. It refuses superuser/BYPASSRLS logins, owners of application tables, and logins without membership in `workflow_worker`. The supervisor passes that same restricted URL to both child scripts; it never falls back to the app's database connection. This guard still needs verification on the provisioned host.

## Host requirements

Use a managed browser-capable container host such as Render, Railway, or Fly.io. The service must run continuously, expose `/health`, use one consumer concurrency initially, and restart the process on failure. Persistent disk is not required; queue state and evidence are stored in PostgreSQL/R2. Chromium must run as the image's non-root default where supported.

## Smoke test and rollback

1. Deploy the image with development-only environment values.
2. Check `GET /health`; it must show worker liveness and safe queue counters without credentials or contact data.
3. Queue one controlled analysis job and one controlled submission job.
4. Confirm atomic claim, heartbeat/retry behavior, and persisted completion evidence.
5. Roll back to the previous image if the health check or safe disposable smoke test fails.

No production deployment or production credentials are part of this guide.
