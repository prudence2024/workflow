import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  verifyPaystackSignature,
  verifyResendSignature,
  isRetryableWebhookStatus,
  verifySharedSecret,
  verifyTelegramSecret,
} from "../src/lib/webhooks";

/**
 * Signature verification is pure logic, so it is tested directly without a
 * server: a forged webhook must be rejected even when the payload is perfect.
 */
describe("resend (svix) signature verification", () => {
  // Svix secrets are base64-encoded after the "whsec_" prefix.
  const rawSecret = crypto.randomBytes(24);
  const secret = `whsec_${rawSecret.toString("base64")}`;

  function sign(body: string, id: string, timestamp: string): string {
    const signed = `${id}.${timestamp}.${body}`;
    return crypto.createHmac("sha256", rawSecret).update(signed).digest("base64");
  }

  const body = JSON.stringify({ type: "email.delivered", data: { email_id: "abc" } });
  const id = "msg_2abc";
  const timestamp = String(Math.floor(Date.now() / 1000));

  it("accepts a correctly signed payload", () => {
    const signature = `v1,${sign(body, id, timestamp)}`;
    const verdict = verifyResendSignature(
      body,
      { id, timestamp, signature },
      secret,
    );
    expect(verdict.valid).toBe(true);
  });

  it("accepts a signature among several candidates", () => {
    const signature = `v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= v1,${sign(body, id, timestamp)}`;
    expect(verifyResendSignature(body, { id, timestamp, signature }, secret).valid).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const signature = `v1,${sign(body, id, timestamp)}`;
    const tampered = body.replace("delivered", "bounced");
    const verdict = verifyResendSignature(tampered, { id, timestamp, signature }, secret);
    expect(verdict.valid).toBe(false);
    expect(verdict.reason).toBe("signature_mismatch");
  });

  it("rejects a wrong secret", () => {
    const signature = `v1,${sign(body, id, timestamp)}`;
    const other = `whsec_${crypto.randomBytes(24).toString("base64")}`;
    expect(verifyResendSignature(body, { id, timestamp, signature }, other).valid).toBe(false);
  });

  it("rejects a replayed old timestamp", () => {
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 3600);
    const signature = `v1,${sign(body, id, oldTimestamp)}`;
    const verdict = verifyResendSignature(body, { id, timestamp: oldTimestamp, signature }, secret);
    expect(verdict.valid).toBe(false);
    expect(verdict.reason).toBe("timestamp_out_of_tolerance");
  });

  it("fails closed when the signing secret is not configured", () => {
    const signature = `v1,${sign(body, id, timestamp)}`;
    expect(verifyResendSignature(body, { id, timestamp, signature }, undefined).valid).toBe(false);
  });

  it("rejects missing headers", () => {
    expect(
      verifyResendSignature(body, { id: null, timestamp: null, signature: null }, secret).valid,
    ).toBe(false);
  });
});

describe("telegram secret token", () => {
  it("accepts the configured token and rejects others", () => {
    expect(verifyTelegramSecret("s3cret", "s3cret")).toBe(true);
    expect(verifyTelegramSecret("wrong", "s3cret")).toBe(false);
    expect(verifyTelegramSecret(null, "s3cret")).toBe(false);
  });

  it("fails closed when unconfigured", () => {
    expect(verifyTelegramSecret("anything", undefined)).toBe(false);
    expect(verifyTelegramSecret("anything", "")).toBe(false);
  });
});

describe("shared secret comparison", () => {
  it("compares in constant time and rejects length mismatches", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });

  it("fails closed when the expected value is missing", () => {
    expect(verifySharedSecret("x", undefined)).toBe(false);
    expect(verifySharedSecret("x", "")).toBe(false);
    expect(verifySharedSecret(null, "x")).toBe(false);
    expect(verifySharedSecret("x", "x")).toBe(true);
  });
});

describe("Paystack webhook signature", () => {
  it("accepts the HMAC-SHA512 signature for the exact raw body", () => {
    const body = JSON.stringify({ event: "charge.success", data: { id: 42 } });
    const secret = "paystack-test-secret";
    const signature = crypto.createHmac("sha512", secret).update(body).digest("hex");
    expect(verifyPaystackSignature(body, signature, secret)).toBe(true);
  });

  it("rejects tampered bodies, missing secrets and malformed signatures", () => {
    const body = JSON.stringify({ event: "charge.success" });
    const secret = "paystack-test-secret";
    const signature = crypto.createHmac("sha512", secret).update(body).digest("hex");
    expect(verifyPaystackSignature(`${body} `, signature, secret)).toBe(false);
    expect(verifyPaystackSignature(body, signature, undefined)).toBe(false);
    expect(verifyPaystackSignature(body, "not-a-signature", secret)).toBe(false);
  });
});

describe("webhook retry state", () => {
  it("reprocesses failed deliveries but treats processed and ignored as terminal", () => {
    expect(isRetryableWebhookStatus("failed")).toBe(true);
    expect(isRetryableWebhookStatus("processed")).toBe(false);
    expect(isRetryableWebhookStatus("ignored")).toBe(false);
    expect(isRetryableWebhookStatus("received")).toBe(false);
  });
});
