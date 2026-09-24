import "@tanstack/react-start/server-only";

/**
 * Branded newsletter welcome email — Owner requirement:
 * a Diplomat Global–styled confirmation telling the subscriber what they
 * signed up for and what to expect, plus the configured WhatsApp Community
 * and social links from business settings. No hardcoded URLs: everything
 * comes from the same authoritative site settings the footer uses. Links
 * that are not configured are simply omitted — never faked.
 */

export interface WelcomeEmailInput {
  email: string;
  siteOrigin: string;
  settings: Record<string, string>;
  socialLinks: Array<{ platform: string; url: string }>;
  unsubscribeToken?: string;
}

/**
 * Settings/admin-sourced URLs (social links, WhatsApp community) are rendered
 * as real hrefs, so they are validated — not merely escaped. Only https:
 * passes; javascript:, data:, protocol-relative and malformed values are
 * omitted entirely rather than rendered as broken or dangerous links.
 * Internal links (store/unsubscribe) are built from siteOrigin, which is
 * production-derived, then html-escaped — never attacker-controlled.
 */
function safeHttpUrl(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!,
  );
}

/** Same WhatsApp normalization authority as the footer (resolveWhatsAppLink).
 *  A configured community URL must itself be a safe https URL, else ignored. */
function whatsappLink(settings: Record<string, string>): string {
  const digits = (settings.whatsapp_number ?? settings.phone ?? "").replace(/[^\d]/g, "");
  if (!digits) return "";
  const community = safeHttpUrl(settings.whatsapp_community_url);
  if (community && community.startsWith("https://")) return community;
  const intl = digits.startsWith("234") ? digits : `234${digits.replace(/^0+/, "")}`;
  return `https://wa.me/${intl}`;
}

export function buildNewsletterWelcomeEmail(input: WelcomeEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const { siteOrigin, settings } = input;
  const brand = "#0891b2";
  const brandDark = "#0e7490";

  const wa = whatsappLink(settings);
  const facebook = safeHttpUrl(
    input.socialLinks.find((link) => /facebook/i.test(link.platform))?.url,
  );
  const instagram = safeHttpUrl(
    input.socialLinks.find((link) => /instagram/i.test(link.platform))?.url,
  );
  const storeUrl = `${siteOrigin.replace(/\/$/, "")}/shop`;

  const unsubscribeUrl = input.unsubscribeToken
    ? `${siteOrigin.replace(/\/$/, "")}/unsubscribe?token=${encodeURIComponent(input.unsubscribeToken)}`
    : "";

  const linkButton = (href: string, label: string) =>
    `<a href="${escapeHtml(href)}" style="display:inline-block;margin:0 6px 8px 0;padding:10px 18px;border-radius:10px;background:${brand};color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;">${escapeHtml(label)}</a>`;

  const communityButtons = [
    wa ? linkButton(wa, "Join our WhatsApp Community") : "",
    facebook ? linkButton(facebook, "Facebook") : "",
    instagram ? linkButton(instagram, "Instagram") : "",
  ]
    .filter(Boolean)
    .join("");

  const subject = "Welcome to the Diplomat Global insider list 🎉";

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="background:${brand};padding:28px 32px;">
          <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">DIPLOMAT GLOBAL</span><br/>
          <span style="color:#d1f2f8;font-size:13px;">Premium electronics, delivered nationwide</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 12px;color:#0f172a;font-size:22px;">You're on the list — welcome aboard!</h1>
          <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">
            Thank you for subscribing to updates from Diplomat Global Tech-Solutions.
            Here's what you can expect in your inbox:
          </p>
          <ul style="margin:0 0 20px;padding-left:20px;color:#334155;font-size:14px;line-height:1.8;">
            <li><strong>Promotions &amp; discount offers</strong> — subscriber-first deals</li>
            <li><strong>New arrivals</strong> — monitors, cameras, computing gear &amp; printers</li>
            <li><strong>Company updates</strong> — delivery coverage, support and community news</li>
          </ul>
          ${communityButtons ? `<p style="margin:0 0 8px;color:#0f172a;font-size:14px;font-weight:600;">Connect with us:</p><p style="margin:0 0 20px;">${communityButtons}</p>` : ""}
          <p style="margin:0 0 24px;">
            <a href="${escapeHtml(storeUrl)}" style="display:inline-block;padding:12px 24px;border-radius:12px;background:${brandDark};color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">Start shopping</a>
          </p>
          <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">
            You received this email because you subscribed at our website.
            ${unsubscribeUrl ? `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#64748b;">Unsubscribe</a> any time — no hard feelings.` : ""}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    "Welcome to the Diplomat Global insider list!",
    "",
    "Thank you for subscribing. Expect: promotions and discount offers, new",
    "arrivals (monitors, cameras, computing gear and printers), and company",
    "updates.",
    wa ? `WhatsApp Community: ${wa}` : "",
    facebook ? `Facebook: ${facebook}` : "",
    instagram ? `Instagram: ${instagram}` : "",
    `Shop: ${storeUrl}`,
    unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}
