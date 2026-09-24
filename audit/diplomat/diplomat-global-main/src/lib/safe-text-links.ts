/**
 * Safe plain-text → link segmentation for structured content renderers
 * (legal pages, generic CMS pages).
 *
 * Owner requirement (§35): admin-managed legal pages may contain support
 * email addresses and URLs; render them as REAL links through the shared
 * renderer — never via hardcoded per-route replacements.
 *
 * Security model: only two schemes can ever be produced:
 *   mailto:<matched email>   and   https:<matched URL>
 * javascript:, data:, vbscript:, protocol-relative and every other scheme are
 * never emitted because they are never matched. The href is built from the
 * matched text itself, not from arbitrary input, so no attribute injection is
 * possible (rendered via React text children, never dangerouslySetInnerHTML).
 */

export type TextSegment =
  | { kind: "text"; value: string }
  | { kind: "email"; value: string; href: string }
  | { kind: "url"; value: string; href: string };

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const URL_RE = /https:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+[A-Za-z0-9)_/]/g;

/** Split a paragraph into plain text / mailto / https link segments. */
export function segmentTextLinks(paragraph: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const matches: Array<{ start: number; end: number; kind: "email" | "url" }> = [];

  for (const match of paragraph.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    matches.push({ start, end: start + match[0].length, kind: "url" });
  }
  for (const match of paragraph.matchAll(EMAIL_RE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    // Don't treat the address part of a https URL as an email.
    if (matches.some((m) => start >= m.start && end <= m.end)) continue;
    matches.push({ start, end, kind: "email" });
  }
  matches.sort((a, b) => a.start - b.start);

  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue; // overlapping guard
    if (match.start > cursor) {
      segments.push({ kind: "text", value: paragraph.slice(cursor, match.start) });
    }
    const value = paragraph.slice(match.start, match.end);
    if (match.kind === "email") {
      segments.push({ kind: "email", value, href: `mailto:${value}` });
    } else {
      segments.push({ kind: "url", value, href: value });
    }
    cursor = match.end;
  }
  if (cursor < paragraph.length) {
    segments.push({ kind: "text", value: paragraph.slice(cursor) });
  }
  return segments;
}

/** A parsed email/url href is safe by construction; anything else is rejected. */
export function isSafeRenderedHref(href: string): boolean {
  return href.startsWith("mailto:") || href.startsWith("https:");
}
