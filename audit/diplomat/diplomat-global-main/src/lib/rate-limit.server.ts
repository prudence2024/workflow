import "@tanstack/react-start/server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { getRequestIP } from "@tanstack/react-start/server";
import { getRedisClient } from "./redis.server";

type LimitName =
  | "contact"
  | "newsletter"
  | "checkout"
  | "admin"
  | "admin-export"
  | "admin-mutation"
  | "admin-upload"
  | "admin-search"
  | "telegram";

const policies = {
  // Public-facing: strict
  contact: { requests: 5, window: "15 m" },
  newsletter: { requests: 3, window: "1 h" },
  // Payment initialization: bounded but generous — real multi-item checkouts
  // and legitimate retries must not be blocked.
  checkout: { requests: 20, window: "15 m" },
  // Admin reads: generous (normal UI issues many requests)
  admin: { requests: 120, window: "1 m" },
  // Admin search: bounded to prevent abuse of global search
  "admin-search": { requests: 20, window: "1 m" },
  // Admin mutations: moderate (create/update/delete)
  "admin-mutation": { requests: 30, window: "1 m" },
  // Admin uploads: separate from mutations to avoid shared-key blocking
  "admin-upload": { requests: 20, window: "1 m" },
  // Admin exports/backup: strict (expensive operations)
  "admin-export": { requests: 3, window: "5 m" },
  // Telegram: moderate
  telegram: { requests: 30, window: "1 m" },
} as const;

const limiters = new Map<LimitName, Ratelimit>();

function getLimiter(name: LimitName) {
  const existing = limiters.get(name);
  if (existing) return existing;
  const redis = getRedisClient();
  if (!redis) return null;
  const policy = policies[name];
  const limiter = new Ratelimit({
    redis,
    analytics: true,
    prefix: `sleek-shop:${name}`,
    limiter: Ratelimit.slidingWindow(policy.requests, policy.window),
    timeout: 1_500,
  });
  limiters.set(name, limiter);
  return limiter;
}

export async function checkRateLimit(name: LimitName, identity?: string) {
  const limiter = getLimiter(name);
  if (!limiter) {
    return { configured: false as const, success: false as const };
  }
  const ip = getRequestIP({ xForwardedFor: true }) || "unknown";
  const result = await limiter.limit(identity ? `${identity}:${ip}` : ip, { ip });
  return {
    configured: true as const,
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
  };
}
