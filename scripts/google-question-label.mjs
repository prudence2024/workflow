/** Normalize a Google Forms question label without helper/placeholder text. */
export function normalizeGoogleQuestionText(rawText, index, requiredText = rawText) {
  const raw = String(rawText ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
  const requiredSource = String(requiredText ?? raw).replace(/\s+/g, " ").trim().slice(0, 160);
  const label = raw
    .replace(/\bYour answer\b/gi, " ")
    .replace(/\s*\*\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { label: label.slice(0, 80) || `Question ${index + 1}`, required: /\*/.test(requiredSource) };
}
