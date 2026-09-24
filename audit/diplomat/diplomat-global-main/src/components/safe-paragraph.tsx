import { isSafeRenderedHref, segmentTextLinks } from "@/lib/safe-text-links";

/**
 * Shared safe-paragraph renderer for CMS text (generic pages route).
 * Legal pages have their own styled variant in legal-page.tsx; both share
 * the same segmentation/allowlist core in safe-text-links.ts.
 */
export function renderSafeTextParagraph(paragraph: string) {
  return segmentTextLinks(paragraph).map((segment, i) => {
    if (segment.kind === "text") return segment.value;
    if (!isSafeRenderedHref(segment.href)) return segment.value;
    const external = segment.kind === "url";
    return (
      <a
        key={i}
        href={segment.href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="font-medium text-brand underline decoration-brand/40 underline-offset-2 transition hover:decoration-brand"
      >
        {segment.value}
      </a>
    );
  });
}
