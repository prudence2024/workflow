# Monitoring & Uptime

## Monitors

### Monitor 1: Homepage

| Field | Value |
|---|---|
| URL | https://diplomatglobal.com |
| Expected Status | 200 |
| Check Interval | 60 seconds |
| Failure Condition | HTTP != 200 or timeout > 10s |
| Owner Setup | Sign up at uptime provider (e.g., Better Stack), add URL |

### Monitor 2: Health Endpoint

| Field | Value |
|---|---|
| URL | https://diplomatglobal.com/api/health |
| Expected Status | 200 |
| Expected Body | `{"status":"ok"}` |
| Check Interval | 120 seconds |
| Failure Condition | HTTP != 200 or status != "ok" |
| Owner Setup | Add URL to uptime provider |

### Monitor 3: Abandoned-Order Cron Heartbeat

| Field | Value |
|---|---|
| URL | Configured via `UPTIME_CRON_HEARTBEAT_URL` env var |
| Expected Status | 200 |
| Check Interval | Matches cron schedule (e.g., hourly) |
| Failure Condition | No heartbeat received within expected window |
| Owner Setup | 1. Create heartbeat monitor in uptime provider 2. Set `UPTIME_CRON_HEARTBEAT_URL` in Vercel 3. Do NOT put in `.env` or Git |

## Environment Variables

| Variable | Scope | Required | Notes |
|---|---|---|---|
| HEALTH_CHECK_DB | Server | No | Set to "true" to enable DB readiness check |
| UPTIME_CRON_HEARTBEAT_URL | Server | No | External heartbeat URL for cron monitoring |

**Never prefix heartbeat secrets with `VITE_`.**

## Uptime Provider Setup

### Recommended: Better Stack (or similar)

1. Sign up at https://betterstack.com (or alternative)
2. Create monitors:
   - Homepage: `https://diplomatglobal.com` — 60s interval
   - Health: `https://diplomatglobal.com/api/health` — 120s interval
   - Cron heartbeat: Configure after `UPTIME_CRON_HEARTBEAT_URL` is set
3. Configure alert channels (email, SMS, Slack, Telegram)
4. Set `UPTIME_CRON_HEARTBEAT_URL` in Vercel environment variables
5. Do NOT commit heartbeat URLs to Git

## Cron Heartbeat Design

```
Cron starts
  → Abandoned-order cleanup runs
  → On success: POST to UPTIME_CRON_HEARTBEAT_URL
  → On failure: no heartbeat sent (provider detects absence)
```

Heartbeat failure must:
- Be logged appropriately
- Not expose secrets
- Not falsely mark the database operation as successful
- Not duplicate the cron's business work

## Incident Response

If a monitor fires:
1. Check Vercel deployment status
2. Check Supabase dashboard
3. Check Clerk status
4. Check Paystack status
5. Check Sentry for recent errors
6. Check `/api/health` manually
7. Escalate if unresolved within 15 minutes
