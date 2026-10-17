import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Telegram webhook lifecycle", () => {
  const source = readFileSync("src/app/api/webhooks/telegram/route.ts", "utf8");

  it("marks invalid or unauthorized updates ignored", () => {
    expect(source).toContain('markWebhookProcessed(recorded.id!, "ignored", "unauthorized_or_invalid_update")');
  });

  it("marks successful commands processed and exceptions failed", () => {
    expect(source).toContain('markWebhookProcessed(recorded.id!, "processed")');
    expect(source).toContain('markWebhookProcessed(recorded.id!, "failed", safeErrorDiagnostic(error).safeMessage)');
    expect(source).toContain('status: 500');
  });
});
