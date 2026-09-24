import "@tanstack/react-start/server-only";
import { Redis } from "@upstash/redis";

let redis: Redis | null | undefined;

export function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return url && token ? { url, token } : null;
}

export function getRedisClient() {
  if (redis !== undefined) return redis;
  const config = getRedisConfig();
  redis = config ? new Redis(config) : null;
  return redis;
}
