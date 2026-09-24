import { describe, expect, it } from "vitest";
import {
  blogContentType,
  buildContactModel,
  buildFooterModel,
  googleReviewCtaUrl,
  heroCategoryOptions,
  isGenericLocation,
  isSafeHttpUrl,
  resolveWhatsAppLink,
} from "../src/lib/public-content-model";

const baseSettings = {
  company_name: "Diplomat Global",
  tagline: "Trusted tech",
  support_email: "diplomatglobaltechs@gmail.com",
  phone: "+2348035751338",
  location: "No. 14 Francis Oremeji Street, Distinct Plaza Suite 5, Ikeja, Lagos",
  whatsapp_url: "",
};

const social = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "s1",
  platform: "Facebook",
  url: "https://facebook.com/diplomatglobal",
  link_type: "social",
  is_active: true,
  ...over,
});

describe("isSafeHttpUrl", () => {
  it("accepts https and http only", () => {
    expect(isSafeHttpUrl("https://ok.example")).toBe(true);
    expect(isSafeHttpUrl("http://ok.example")).toBe(true);
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,x")).toBe(false);
    expect(isSafeHttpUrl("")).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
  });
});

describe("isGenericLocation", () => {
  it("flags generic Nigeria/Lagos-only values", () => {
    expect(isGenericLocation("Lagos, Nigeria")).toBe(true);
    expect(isGenericLocation("Nigeria")).toBe(true);
    expect(isGenericLocation("")).toBe(true);
    expect(isGenericLocation(null)).toBe(true);
    expect(isGenericLocation("No. 14 Francis Oremeji Street, Ikeja")).toBe(false);
  });
});

describe("resolveWhatsAppLink", () => {
  it("prefers an explicit wa.me setting", () => {
    expect(
      resolveWhatsAppLink({ ...baseSettings, whatsapp_url: "https://wa.me/2348000000000" }),
    ).toBe("https://wa.me/2348000000000");
  });

  it("builds wa.me from the authoritative phone when unset", () => {
    expect(resolveWhatsAppLink(baseSettings)).toBe("https://wa.me/2348035751338");
  });

  it("is empty when neither source exists", () => {
    expect(resolveWhatsAppLink({})).toBe("");
  });
});

describe("buildFooterModel", () => {
  it("locks contact order: Address → Email → Phone → WhatsApp", () => {
    const model = buildFooterModel([], baseSettings);
    expect(model.contactRows.map((r) => r.kind)).toEqual(["address", "email", "phone", "whatsapp"]);
  });

  it("separates social icons from community CTAs", () => {
    const model = buildFooterModel(
      [
        social(),
        social({ id: "s2", platform: "Telegram Group", link_type: "contact" }),
        social({ id: "s3", platform: "Hidden", is_active: false }),
      ],
      baseSettings,
    );
    expect(model.socialIcons).toHaveLength(1);
    expect(model.communityCtas.map((c) => c.platform)).toEqual(["Telegram Group"]);
  });

  it("omits missing settings instead of inventing values", () => {
    const model = buildFooterModel([], {});
    expect(model.contactRows).toEqual([]);
    expect(model.companyName).toBe("Diplomat Global");
    expect(model.description).toContain("nationwide delivery");
  });
});

describe("buildContactModel", () => {
  it("mirrors footer authority and exposes map config safely", () => {
    const model = buildContactModel([social()], {
      ...baseSettings,
      google_maps_directions_url: "https://maps.google.com/?q=ikeja",
      google_maps_embed_url: "javascript:alert(1)",
    });
    expect(model.address).toContain("Francis Oremeji");
    expect(model.whatsapp).toBe("https://wa.me/2348035751338");
    expect(model.directionsUrl).toBe("https://maps.google.com/?q=ikeja");
    expect(model.embedUrl).toBe("");
  });

  it("renders the map box when a proper embed URL was saved under the directions setting", () => {
    const embed = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3963.4";
    const model = buildContactModel([social()], {
      ...baseSettings,
      google_maps_directions_url: embed,
      google_maps_embed_url: "",
    });
    expect(model.embedUrl).toBe(embed);
  });

  it("external link is NEVER the embed URL — embed under directions yields derived place search", () => {
    // Real Owner runtime evidence: the directions setting holds an /maps/embed
    // URL; opening it in a tab shows Google's "must be used in an iframe" page.
    const embed =
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3963.424918598143!2d3.3377!3d6.5939!2m3!1f0!2f0!3f0!3m2!1sen!2sng";
    const model = buildContactModel([social()], {
      ...baseSettings,
      google_maps_directions_url: embed,
      google_maps_embed_url: "",
    });
    expect(model.embedUrl).toBe(embed); // iframe still renders the map
    expect(model.directionsUrl).not.toContain("/maps/embed");
    expect(model.directionsUrl).toContain("google.com/maps/search/?api=1&query=");
    expect(model.directionsUrl).toContain(encodeURIComponent(baseSettings.location));
  });

  it("external link prefers a genuine non-embed maps URL from the directions setting", () => {
    const model = buildContactModel([social()], {
      ...baseSettings,
      google_maps_directions_url: "https://www.google.com/maps/dir/?api=1&destination=Ikeja",
      google_maps_embed_url: "",
    });
    expect(model.directionsUrl).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=Ikeja",
    );
  });

  it("external link is empty without any usable source (no invented navigation)", () => {
    const model = buildContactModel([social()], {
      ...baseSettings,
      location: "",
      google_maps_directions_url: "",
      google_maps_embed_url: "",
    });
    expect(model.directionsUrl).toBe("");
  });

  it("never promotes a non-embed directions link into the map iframe", () => {
    const model = buildContactModel([social()], {
      ...baseSettings,
      google_maps_directions_url: "https://evil.example/maps/embed?pb=x",
      google_maps_embed_url: "",
    });
    expect(model.embedUrl).toBe("");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "//evil.example/maps/embed?pb=x",
    "http://www.google.com/maps/embed?pb=x",
    "https://www.google.com/search?q=x",
    "https://evil.example.com/maps/embed?pb=x",
    "not a url",
  ])("rejects unsafe map source %s", (source) => {
    const model = buildContactModel([social()], {
      ...baseSettings,
      google_maps_embed_url: source,
      google_maps_directions_url: "",
    });
    expect(model.embedUrl).toBe("");
  });
});

describe("blogContentType", () => {
  it("maps video posts and article posts distinctly", () => {
    expect(blogContentType({ youtube_url: "https://youtu.be/x" })).toBe("video");
    expect(blogContentType({ videoUrl: "https://youtu.be/x" })).toBe("video");
    expect(blogContentType({})).toBe("article");
  });
});

describe("heroCategoryOptions", () => {
  it("offers active categories and marks unmatched stored values inactive", () => {
    const options = heroCategoryOptions(
      [
        { slug: "monitors", name: "Monitors" },
        { slug: "printers", name: "Printers" },
      ],
      "Accessories",
    );
    expect(options).toEqual([
      { value: "Monitors", label: "Monitors" },
      { value: "Printers", label: "Printers" },
      { value: "Accessories", label: "Accessories (inactive)" },
    ]);
  });

  it("does not duplicate a stored value that matches an active category", () => {
    const options = heroCategoryOptions([{ slug: "monitors", name: "Monitors" }], "Monitors");
    expect(options).toEqual([{ value: "Monitors", label: "Monitors" }]);
  });
});

describe("googleReviewCtaUrl — strict Google-owned host allowlist", () => {
  const good = "https://search.google.com/local/writereview?placeid=ChIJexample";
  it("accepts https Google-owned hosts", () => {
    expect(googleReviewCtaUrl(good)).toBe(good);
    expect(googleReviewCtaUrl("https://g.page/r/AbCd123/review")).toBe(
      "https://g.page/r/AbCd123/review",
    );
    expect(googleReviewCtaUrl("https://goo.gl/maps/abc")).toBe("https://goo.gl/maps/abc");
  });
  it("rejects lookalike hosts (google.com.evil.com, notgoogle.com)", () => {
    expect(googleReviewCtaUrl("https://google.com.evil.com/write")).toBe("");
    expect(googleReviewCtaUrl("https://evil.com/?google.com")).toBe("");
  });
  it("rejects non-https, javascript:, data:, protocol-relative and malformed values", () => {
    expect(googleReviewCtaUrl("http://search.google.com/local/writereview")).toBe("");
    expect(googleReviewCtaUrl("javascript:alert(1)")).toBe("");
    expect(googleReviewCtaUrl("data:text/html,<script>")).toBe("");
    expect(googleReviewCtaUrl("//search.google.com/x")).toBe("");
    expect(googleReviewCtaUrl("not a url")).toBe("");
  });
  it("hides the CTA when unconfigured", () => {
    expect(googleReviewCtaUrl("")).toBe("");
    expect(googleReviewCtaUrl(null)).toBe("");
    expect(googleReviewCtaUrl(undefined)).toBe("");
  });
});
