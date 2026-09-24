import { describe, expect, it } from "vitest";
import { isSafeRenderedHref, segmentTextLinks } from "@/lib/safe-text-links";

/** §35 — structured-content link allowlist: https: and mailto: only. */

describe("segmentTextLinks", () => {
  it("wraps support emails in mailto anchors", () => {
    const segments = segmentTextLinks(
      "Questions can be sent to support@diplomatglobal.com.ng any time.",
    );
    expect(segments).toContainEqual({
      kind: "email",
      value: "support@diplomatglobal.com.ng",
      href: "mailto:support@diplomatglobal.com.ng",
    });
  });

  it("wraps https URLs, preserving trailing punctuation", () => {
    const segments = segmentTextLinks("See https://diplomatglobal.com.ng/shop for details.");
    const url = segments.find((s) => s.kind === "url");
    expect(url).toMatchObject({ kind: "url", href: "https://diplomatglobal.com.ng/shop" });
    expect(segments.at(-1)).toMatchObject({ kind: "text", value: " for details." });
  });

  it("NEVER emits javascript:, data: or protocol-relative links", () => {
    for (const malicious of [
      "javascript:alert(1) click here",
      "data:text/html,<script>alert(1)</script>",
      "//evil.example.com/drop",
      "vbscript:msgbox(1)",
    ]) {
      const segments = segmentTextLinks(malicious);
      for (const segment of segments) {
        if (segment.kind !== "text") {
          expect(isSafeRenderedHref(segment.href)).toBe(true);
        }
      }
      expect(segments.every((s) => s.kind === "text" || s.href !== malicious)).toBe(true);
    }
  });

  it("does not double-link the email inside a URL", () => {
    const segments = segmentTextLinks("visit https://x.com/?mail=a@b.com now");
    const emails = segments.filter((s) => s.kind === "email");
    expect(emails).toHaveLength(0);
  });

  it("handles multiple links and plain text around them", () => {
    const segments = segmentTextLinks(
      "Email sales@diplomatglobal.com or browse https://diplomatglobal.com.ng today.",
    );
    expect(segments.some((s) => s.kind === "email")).toBe(true);
    expect(segments.some((s) => s.kind === "url")).toBe(true);
    expect(segments[0].kind).toBe("text");
  });

  it("returns a single text segment when nothing matches", () => {
    expect(segmentTextLinks("Just plain words.")).toEqual([
      { kind: "text", value: "Just plain words." },
    ]);
  });
});

describe("isSafeRenderedHref", () => {
  it("accepts only mailto: and https:", () => {
    expect(isSafeRenderedHref("mailto:a@b.com")).toBe(true);
    expect(isSafeRenderedHref("https://x.com")).toBe(true);
    expect(isSafeRenderedHref("http://x.com")).toBe(false);
    expect(isSafeRenderedHref("javascript:alert(1)")).toBe(false);
    expect(isSafeRenderedHref("data:text/html,x")).toBe(false);
  });
});
