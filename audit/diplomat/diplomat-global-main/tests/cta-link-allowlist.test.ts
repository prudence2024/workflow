import { describe, expect, it } from "vitest";
import { isSafeCtaLink } from "../src/lib/cloudinary-upload-policy";

describe("isSafeCtaLink — admin CTA/navigation scheme allowlist", () => {
  it("allows internal relative routes", () => {
    expect(isSafeCtaLink("/shop")).toBe(true);
    expect(isSafeCtaLink("/products/samsung-32?category=Monitor")).toBe(true);
    expect(isSafeCtaLink("/blog/choosing-right-monitor")).toBe(true);
  });

  it("allows https: destinations", () => {
    expect(isSafeCtaLink("https://diplomatglobal.com/shop")).toBe(true);
    expect(isSafeCtaLink("http://localhost:8080/dev")).toBe(true);
  });

  it("rejects script and data schemes", () => {
    expect(isSafeCtaLink("javascript:alert(1)")).toBe(false);
    expect(isSafeCtaLink("JavaScript:alert(1)")).toBe(false);
    expect(isSafeCtaLink(" javascript:alert(1)")).toBe(false);
    expect(isSafeCtaLink("data:text/html,<script>1</script>")).toBe(false);
    expect(isSafeCtaLink("vbscript:msgbox(1)")).toBe(false);
  });

  it("rejects protocol-relative, backslash and encoded scheme tricks", () => {
    expect(isSafeCtaLink("//evil.example")).toBe(false);
    expect(isSafeCtaLink("\\\\evil.example")).toBe(false);
    expect(isSafeCtaLink("https://evil.example")).toBe(true); // explicit https IS allowed by design
    expect(isSafeCtaLink("%2F%2Fevil.example")).toBe(false);
    expect(isSafeCtaLink("java%3Aalert(1)")).toBe(false);
  });

  it("rejects non-http schemes even when unusual", () => {
    expect(isSafeCtaLink("tel:+2348000000000")).toBe(false);
    expect(isSafeCtaLink("ftp://host/file")).toBe(false);
    expect(isSafeCtaLink("mailto:support@diplomatglobal.com")).toBe(false);
  });

  it("treats empty-ish input as unsafe (caller falls back to default)", () => {
    expect(isSafeCtaLink("")).toBe(true); // empty is not an attack; caller defaults to /shop
  });
});
