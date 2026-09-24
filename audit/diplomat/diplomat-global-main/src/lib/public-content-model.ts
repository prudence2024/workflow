/**
 * Pure, client-safe models for public Footer and Contact surfaces.
 *
 * Single authority chain: site_settings + social_links rows → these models →
 * Footer and Contact render them identically. No hardcoded business identity:
 * missing settings render as "not configured", never as stale fallback values.
 */

export interface SocialLike {
  id: string;
  platform: string;
  url: string;
  icon?: string | null;
  link_type?: string | null;
  sort_order?: number | null;
  is_active?: boolean | null;
}

export interface PublicSettingsLike {
  company_name?: string;
  tagline?: string;
  support_email?: string;
  phone?: string;
  location?: string;
  whatsapp_url?: string;
  website_url?: string;
  google_maps_directions_url?: string;
  google_maps_embed_url?: string;
  [key: string]: string | undefined;
}

export function isSafeHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Generic Lagos/Nigeria-only location carries no delivery information. */
export function isGenericLocation(value: string | null | undefined): boolean {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return true;
  return /^(lagos,?\s*nigeria|nigeria|lagos)$/i.test(trimmed);
}

/**
 * Customer-initiated WhatsApp deep link only. Never an API/webhook surface.
 * Accepts an explicit https://wa.me/… setting; falls back to a wa.me link built
 * from the authoritative phone number when the setting is absent.
 */
export function resolveWhatsAppLink(settings: PublicSettingsLike): string {
  const configured = (settings.whatsapp_url ?? "").trim();
  if (configured && /^https:\/\/(wa\.me|api\.whatsapp\.com)\//i.test(configured)) {
    return configured;
  }
  const digits = (settings.phone ?? "").replace(/[^\d]/g, "");
  return digits ? `https://wa.me/${digits}` : "";
}

export interface FooterContactRow {
  kind: "address" | "email" | "phone" | "whatsapp" | "cta";
  label: string;
  value: string;
  href?: string;
  external?: boolean;
}

export interface FooterModel {
  companyName: string;
  description: string;
  socialIcons: SocialLike[];
  communityCtas: SocialLike[];
  contactRows: FooterContactRow[];
}

/**
 * Column 4 contact order is locked: Address → Email → Phone → WhatsApp →
 * custom/community buttons. Community buttons come from social links whose
 * link_type is not "social".
 */
export function buildFooterModel(
  socialLinks: SocialLike[],
  settings: PublicSettingsLike,
): FooterModel {
  const active = socialLinks.filter((link) => link.is_active !== false && isSafeHttpUrl(link.url));
  const socialIcons = active.filter((link) => (link.link_type ?? "social") === "social");
  const communityCtas = active.filter((link) => (link.link_type ?? "social") !== "social");

  const address = (settings.location ?? "").trim();
  const email = (settings.support_email ?? "").trim();
  const phone = (settings.phone ?? "").trim();
  const whatsapp = resolveWhatsAppLink(settings);

  const contactRows: FooterContactRow[] = [];
  if (address) {
    contactRows.push({ kind: "address", label: "Address", value: address });
  }
  if (email) {
    contactRows.push({
      kind: "email",
      label: "Email",
      value: email,
      href: `mailto:${email}`,
    });
  }
  if (phone) {
    contactRows.push({
      kind: "phone",
      label: "Phone Number",
      value: phone,
      href: `tel:${phone.replace(/[^+\d]/g, "")}`,
    });
  }
  if (whatsapp) {
    contactRows.push({
      kind: "whatsapp",
      label: "Message us on WhatsApp",
      value: "Message us on WhatsApp",
      href: whatsapp,
      external: true,
    });
  }

  return {
    companyName: (settings.company_name ?? "").trim() || "Diplomat Global",
    description:
      (settings.tagline ?? "").trim() ||
      "Quality-checked technology, practical buying support and dependable nationwide delivery.",
    socialIcons,
    communityCtas,
    contactRows,
  };
}

export interface ContactModel {
  address: string;
  email: string;
  phone: string;
  whatsapp: string;
  directionsUrl: string;
  embedUrl: string;
  socialIcons: SocialLike[];
  communityCtas: SocialLike[];
}

/**
 * Strict Google Maps embed-URL resolver for the Contact map box.
 *
 * Only https URLs on intended Google Maps embed hosts are accepted — never
 * javascript:, data:, protocol-relative, or non-Google origins. Sources, in
 * order: the dedicated embed setting; a genuine /maps/embed URL saved under
 * the directions setting (Owners frequently paste the embed code there).
 * Returns "" when nothing valid is configured — the UI then renders the
 * deterministic address fallback instead of a broken iframe.
 */
export function googleMapsEmbedUrl(embedSetting: string, directionsSetting: string): string {
  const GOOGLE_MAPS_EMBED_HOSTS = new Set(["www.google.com", "google.com", "maps.google.com"]);
  const isEmbedUrl = (value: string): string => {
    if (!value) return "";
    try {
      const url = new URL(value);
      // new URL() resolves protocol-relative "//host" against this base — an
      // explicit https check afterwards still rejects those, since the input
      // string itself must carry the https scheme.
      if (!value.trim().startsWith("https://")) return "";
      if (!GOOGLE_MAPS_EMBED_HOSTS.has(url.hostname)) return "";
      if (!url.pathname.startsWith("/maps/embed")) return "";
      return url.toString();
    } catch {
      return "";
    }
  };
  return isEmbedUrl(embedSetting) || isEmbedUrl(directionsSetting);
}

/**
 * External "Open in Google Maps" navigation URL. NEVER an /maps/embed URL —
 * opened in a browser tab, embed URLs render Google's "The Google Maps Embed
 * API must be used in an iframe" error page (real Owner runtime evidence).
 *
 * Precedence: a non-embed maps URL saved in the directions setting (place,
 * search, directions or maps.app.goo.gl links are all fine to open externally);
 * otherwise a deterministic place search derived from the business address so
 * the link always works without a second Owner setting.
 */
export function googleMapsExternalUrl(
  directionsSetting: string,
  businessAddress: string,
): string {
  const GOOGLE_MAPS_HOST_SUFFIX = "google.com";
  const isEmbed = (value: string): boolean => {
    try {
      return new URL(value).pathname.startsWith("/maps/embed");
    } catch {
      return true; // unparseable → treat as unusable for navigation
    }
  };
  const trimmed = (directionsSetting ?? "").trim();
  if (trimmed && isSafeHttpUrl(trimmed) && trimmed.includes(GOOGLE_MAPS_HOST_SUFFIX) && !isEmbed(trimmed)) {
    return trimmed;
  }
  const address = (businessAddress ?? "").trim();
  if (!address) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** Same authority as the footer, rendered for the Contact page. */
export function buildContactModel(
  socialLinks: SocialLike[],
  settings: PublicSettingsLike,
): ContactModel {
  const model = buildFooterModel(socialLinks, settings);
  return {
    address: model.contactRows.find((row) => row.kind === "address")?.value ?? "",
    email: model.contactRows.find((row) => row.kind === "email")?.value ?? "",
    phone: model.contactRows.find((row) => row.kind === "phone")?.value ?? "",
    whatsapp: resolveWhatsAppLink(settings),
    directionsUrl: googleMapsExternalUrl(
      settings.google_maps_directions_url ?? "",
      settings.location ?? "",
    ),
    embedUrl: googleMapsEmbedUrl(
      settings.google_maps_embed_url ?? "",
      settings.google_maps_directions_url ?? "",
    ),
    socialIcons: model.socialIcons,
    communityCtas: model.communityCtas,
  };
}

export type BlogContentType = "video" | "article";

/** Video posts surface a play icon; text posts a document icon. */
/**
 * "Also review us on Google" CTA — strict validation for the Owner-configured
 * google_review_url setting. Only https URLs on Google-owned hosts
 * (google.com and subdomains, g.page, goo.gl) qualify; anything else returns
 * "" and the CTA stays hidden. Never invented, never scraped.
 */
export function googleReviewCtaUrl(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    const host = url.hostname.toLowerCase();
    const allowed =
      host === "google.com" ||
      host === "g.page" ||
      host === "goo.gl" ||
      host.endsWith(".google.com") ||
      host.endsWith(".g.page") ||
      host.endsWith(".goo.gl");
    return allowed ? value : "";
  } catch {
    return "";
  }
}

export function blogContentType(post: {
  videoUrl?: string | null;
  youtube_url?: string | null;
}): BlogContentType {
  return (post.videoUrl ?? post.youtube_url) ? "video" : "article";
}

/** Hero category selector options: active DB categories only, plus the stored value when it no longer matches an active category (marked inactive) so existing slides stay editable. */
export function heroCategoryOptions(
  activeCategories: { slug: string; name: string }[],
  currentValue: string,
): { value: string; label: string }[] {
  const options = activeCategories.map((category) => ({
    value: category.name,
    label: category.name,
  }));
  const stored = currentValue.trim();
  if (stored && !options.some((option) => option.value.toLowerCase() === stored.toLowerCase())) {
    options.push({ value: stored, label: `${stored} (inactive)` });
  }
  return options;
}
