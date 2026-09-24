import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Provider-chain contract tests.
 *
 * The transport functions require network + credentials, so live delivery is
 * covered by integration/manual verification. These tests pin the module's
 * wiring contracts: chain order, env gates, and the no-blind-failover rule
 * ("ambiguous timeout must NOT trigger the fallback") — the invariants that
 * prevent duplicate emails and silent drops.
 */

const SOURCE = "src/lib/email-providers.server.ts";
const source = readFileSync(SOURCE, "utf8");

describe("transactional email chain (Resend → SMTP2GO)", () => {
  it("tries Resend first and SMTP2GO second", () => {
    const resendIdx = source.indexOf('name: "resend"');
    const smtpIdx = source.indexOf('name: "smtp2go"');
    expect(resendIdx).toBeGreaterThan(-1);
    expect(smtpIdx).toBeGreaterThan(-1);
    expect(resendIdx).toBeLessThan(smtpIdx);
  });

  it("gates each link on its own credentials", () => {
    expect(source).toContain('env: ["RESEND_API_KEY"]');
    expect(source).toContain('env: ["SMTP2GO_API_KEY"]');
  });
});

describe("marketing email chain (Brevo → Mailjet)", () => {
  it("tries Brevo first and Mailjet second", () => {
    const brevoIdx = source.indexOf('name: "brevo"');
    const mailjetIdx = source.indexOf('name: "mailjet"');
    expect(brevoIdx).toBeGreaterThan(-1);
    expect(mailjetIdx).toBeGreaterThan(-1);
    expect(brevoIdx).toBeLessThan(mailjetIdx);
  });

  it("gates Mailjet on both API key and secret", () => {
    expect(source).toContain('env: ["MAILJET_API_KEY", "MAILJET_SECRET_KEY"]');
  });
});

describe("failover safety rules", () => {
  it("only fails over on definitive provider rejection", () => {
    expect(source).toContain("class ProviderRejected");
    // The chain breaks on non-definitive outcomes:
    expect(source).toContain("if (!definitive) break");
  });

  it("never retries more than primary + fallback", () => {
    expect(source).toContain("ATTEMPT_LIMIT = 2");
  });

  it("records provider + message id + attempt for every outcome", () => {
    expect(source).toContain("providerMessageId");
    expect(source).toContain("attempt:");
  });
});

describe("call-site integration", () => {
  const emailServer = readFileSync("src/lib/email.server.ts", "utf8");
  const serverFns = readFileSync("src/lib/admin/server-fns.ts", "utf8");

  it("routes contact + transactional email through the chain", () => {
    expect(emailServer).toContain("sendViaProviderChain");
  });

  it("keeps the legacy sendTransactionalEmail signature for call sites", () => {
    expect(emailServer).toContain("export async function sendTransactionalEmail(input: {");
    expect(emailServer).toContain("sent: boolean; error?: string; provider?: string");
  });

  it("marketing send uses the chain with per-recipient personalization", () => {
    expect(serverFns).toContain("sendMarketingEmail");
    // Personalization template applied per recipient (regex-escaped in source)
    expect(serverFns.replace(/\r\n/g, "\n")).toContain("first_name");
  });

  it("marketing suppression filter remains before any send", () => {
    const suppressIdx = serverFns.indexOf("marketing_suppression");
    const sendIdx = serverFns.indexOf("sendMarketingEmail");
    expect(suppressIdx).toBeGreaterThan(-1);
    expect(suppressIdx).toBeLessThan(sendIdx);
  });
});
