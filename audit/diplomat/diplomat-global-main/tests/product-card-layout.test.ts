import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Layout contract for ProductCard's footer (Owner-reported runtime defect:
 * Naira prices wrapped character-by-character and Add-to-cart buttons were
 * clipped at the card edge on narrow desktop grids).
 *
 * Root cause (fixed): the footer was `sm:grid-cols-[minmax(0,1fr)_auto]` —
 * the price column could shrink to ~0 — while the price span carried
 * `break-words`, making per-character wrapping legal. The fix wraps the
 * footer in a flex container: the price keeps its natural one-line min width
 * and the CTA drops BELOW it when the card is too narrow, instead of
 * overflowing the card's overflow-hidden edge.
 */

const source = readFileSync(
  resolve(import.meta.dirname, "../src/components/product-card.tsx"),
  "utf8",
);

describe("product card footer layout contract", () => {
  it("footer wraps instead of collapsing the price column", () => {
    expect(source).toContain("flex flex-wrap items-end");
    // The old collapse-prone grid must never return:
    expect(source).not.toContain("sm:grid-cols-[minmax(0,1fr)_auto]");
  });

  it("price never allows per-character breaking", () => {
    // Check class attributes specifically (prose/comments may legitimately
    // mention the pattern). `break-words`/`[word-break:break-all]` collapse
    // min-content width to ~1 char, which is what enabled
    // ₦450,000 → ₦/4/5/0/,/0/0/0.
    const classNames = [...source.matchAll(/className="([^"]*)"/g)].map((m) => m[1]);
    for (const cls of classNames) {
      expect(cls).not.toContain("break-words");
      expect(cls).not.toContain("break-all");
    }
  });

  it("price container keeps its natural width floor (no min-w-0 collapse)", () => {
    const priceBlock = source.match(/<span className="block font-display[^>]*>\s*\{formatNaira/);
    expect(priceBlock).not.toBeNull();
    // The wrapping div around the price must not reintroduce min-w-0:
    const container = source.match(
      /<div className="([^"]*)">\s*<span className="block font-display/,
    );
    expect(container?.[1]).not.toContain("min-w-0");
  });

  it("CTA stays inside the card and right-aligned on desktop", () => {
    // sm:ml-auto re-aligns the wrapped button to the right edge; without it
    // the auto-placed button hugged the left below the price.
    expect(source).toContain("sm:ml-auto sm:w-auto");
  });
});
