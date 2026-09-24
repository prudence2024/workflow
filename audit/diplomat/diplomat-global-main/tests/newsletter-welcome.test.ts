import { describe, expect, it } from "vitest";
import { buildNewsletterWelcomeEmail } from "../src/lib/newsletter-welcome.server";

/**
 * Focused security contract for the branded newsletter welcome email.
 * All dynamic content comes from Owner-configured settings — these tests pin
 * that untrusted/misconfigured values can never become script execution or
 * unsafe link targets inside the email, and that absence degrades to omission.
 */

const base = {
  email: "subscriber@example.com",
  siteOrigin: "https://diplomatglobal.example",
  settings: {} as Record<string, string>,
  socialLinks: [] as Array<{ platform: string; url: string }>,
};

describe("newsletter welcome email — XSS safety", () => {
  it("escapes HTML in every rendered href and label", () => {
    const { html } = buildNewsletterWelcomeEmail({
      ...base,
      settings: { whatsapp_number: "08012345678" },
      socialLinks: [
        { platform: "Facebook", url: `https://fb.com/x" onmouseover="alert(1)` },
        { platform: "Instagram", url: `https://ig.com/x"><script>alert(2)</script>` },
      ],
    });
    // safeHttpUrl URL-normalizes hostile hrefs (" -> %22), so the injected
    // attribute can never terminate the href — stronger than escaping alone.
    expect(html).not.toContain('onmouseover="alert(1)"');
    expect(html).not.toContain("<script>");
    expect(html).toContain("%22");
  });

  it("escapes siteOrigin injection into store/unsubscribe links", () => {
    const { html } = buildNewsletterWelcomeEmail({
      ...base,
      siteOrigin: `https://good.example" onerror="pwn()`,
      unsubscribeToken: "tok-1",
    });
    // Internal links are built from siteOrigin then html-escaped, so a quote
    // in the origin can never terminate the href attribute.
    expect(html).not.toContain('onerror="pwn()"');
    expect(html).toContain("&quot;");
  });
});

describe("newsletter welcome email — URL safety", () => {
  it("omits javascript: and data: social URLs entirely", () => {
    const { html } = buildNewsletterWelcomeEmail({
      ...base,
      socialLinks: [
        { platform: "Facebook", url: "javascript:alert(document.domain)" },
        { platform: "Instagram", url: "data:text/html,<script>alert(1)</script>" },
      ],
    });
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/data:text\/html/i);
    expect(html).not.toContain("Facebook</a>");
    expect(html).not.toContain("Instagram</a>");
  });

  it("omits javascript:/data: WhatsApp community URL and falls back to wa.me", () => {
    const { html } = buildNewsletterWelcomeEmail({
      ...base,
      settings: {
        whatsapp_number: "08012345678",
        whatsapp_community_url: "javascript:alert(1)",
      },
    });
    expect(html).not.toMatch(/javascript:/i);
    expect(html).toContain("https://wa.me/2348012345678");
  });

  it("rejects protocol-relative social URLs (would inherit mail-client scheme)", () => {
    const { html } = buildNewsletterWelcomeEmail({
      ...base,
      socialLinks: [{ platform: "Facebook", url: "//evil.example/phish" }],
    });
    expect(html).not.toContain("evil.example/phish");
  });

  it("omits malformed URLs without crashing", () => {
    const { html } = buildNewsletterWelcomeEmail({
      ...base,
      socialLinks: [{ platform: "Facebook", url: "http://[::1" }],
    });
    expect(html).not.toContain("Facebook</a>");
  });

  it("keeps genuine https social and community URLs", () => {
    const { html } = buildNewsletterWelcomeEmail({
      ...base,
      settings: {
        whatsapp_number: "08012345678",
        whatsapp_community_url: "https://chat.whatsapp.com/abc",
      },
      socialLinks: [
        { platform: "Facebook", url: "https://facebook.com/diplomatglobal" },
        { platform: "Instagram", url: "https://instagram.com/diplomatglobal" },
      ],
    });
    expect(html).toContain('href="https://chat.whatsapp.com/abc"');
    expect(html).toContain('href="https://facebook.com/diplomatglobal"');
    expect(html).toContain('href="https://instagram.com/diplomatglobal"');
  });
});

describe("newsletter welcome email — unsubscribe link", () => {
  it("embeds a percent-encoded token and omits the link without a token", () => {
    const withToken = buildNewsletterWelcomeEmail({ ...base, unsubscribeToken: "a b/c&d" });
    expect(withToken.html).toContain("/unsubscribe?token=a%20b%2Fc%26d");
    const noToken = buildNewsletterWelcomeEmail(base);
    expect(noToken.html).not.toContain("/unsubscribe");
  });
});
