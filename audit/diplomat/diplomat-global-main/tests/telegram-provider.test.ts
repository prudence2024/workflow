import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Telegram provider-contract tests.
 *
 * Owner runtime evidence: bot commands produced no reply. Root causes proven
 * live against api.telegram.org:
 *   1. sendMessage with parse_mode:"Markdown" returns 400 "can't parse
 *      entities" when dynamic content carries unmatched * or _ — and the
 *      reply was silently dropped (no fallback).
 *   2. No fetch timeout anywhere in the module — a stalled provider call
 *      hangs the webhook past Telegram's deadline (updates then retry into
 *      the dedup no-op).
 *
 * These tests pin the fixes: hard timeout on every provider call and a
 * plain-text retry on parse-entity failure.
 */

const SOURCE = "src/lib/telegram.server.ts";
const source = readFileSync(SOURCE, "utf8");

describe("telegram send hardening (reply must never be silently dropped)", () => {
  it("all provider calls share one client helper with a hard timeout", () => {
    expect(source).toContain("AbortSignal.timeout(TELEGRAM_HTTP_TIMEOUT_MS)");
    expect(source).toContain("const TELEGRAM_HTTP_TIMEOUT_MS = 10_000;");
    // every provider call goes through callTelegramApi — no raw fetch left
    const rawFetches = source.match(/await fetch\(/g) ?? [];
    expect(rawFetches.length).toBe(1); // exactly the one inside callTelegramApi
  });

  it("retries as plain text when Markdown entities fail to parse", () => {
    expect(source).toContain("can't parse entities");
    expect(source).toContain("sendWithParseFallback");
  });

  it("both admin and webhook reply paths use the fallback sender", () => {
    const msgIdx = source.indexOf("export async function sendTelegramMessage");
    const chatIdx = source.indexOf("export async function sendTelegramToChat");
    expect(msgIdx).toBeGreaterThan(-1);
    expect(chatIdx).toBeGreaterThan(msgIdx);
    // after the helper is defined, both functions delegate to it
    const afterHelper = source.slice(source.indexOf("async function sendWithParseFallback"));
    const delegations = (afterHelper.match(/sendWithParseFallback\(/g) ?? []).length;
    expect(delegations).toBeGreaterThanOrEqual(3); // 1 definition + 2 call sites
  });

  it("no sendMessage call site hardcodes parse_mode anymore", () => {
    // exactly two code occurrences allowed, both INSIDE the fallback helper:
    // the intentional Markdown first attempt + the plain-text retry clearing it
    const helperStart = source.indexOf("async function sendWithParseFallback");
    const helperEnd = source.indexOf("export async function sendTelegramMessage");
    const occurrences = source.match(/parse_mode:/g) ?? [];
    expect(occurrences.length).toBe(2);
    const helperBody = source.slice(helperStart, helperEnd);
    expect((helperBody.match(/parse_mode:/g) ?? []).length).toBe(2);
  });
});
