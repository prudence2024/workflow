import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MAX_WEBHOOK_BODY_BYTES, WebhookBodyTooLargeError, readWebhookBody } from "@/lib/webhookBody";

describe("webhook body bounds", () => {
  it("reads bodies within the provider payload limit", async () => {
    const body = "{}";
    await expect(readWebhookBody(new Request("http://localhost", { method: "POST", body }))).resolves.toBe(body);
  });

  it("rejects oversized bodies before parsing or persistence", async () => {
    const body = "x".repeat(MAX_WEBHOOK_BODY_BYTES + 1);
    await expect(readWebhookBody(new Request("http://localhost", { method: "POST", body }))).rejects.toBeInstanceOf(WebhookBodyTooLargeError);
  });

  it("keeps every provider route on the bounded reader", () => {
    for (const route of ["resend", "termii", "telegram", "paystack"]) {
      const source = readFileSync(`src/app/api/webhooks/${route}/route.ts`, "utf8");
      expect(source).toContain("readWebhookBody");
      expect(source).toContain("WebhookBodyTooLargeError");
    }
  });
});
