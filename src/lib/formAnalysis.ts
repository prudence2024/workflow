import * as cheerio from "cheerio";
import type { FormField } from "@/db/schema";

function humanizeLabel(name: string): string {
  return name
    .replace(/[_\-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function inferType(inputType: string | undefined, name: string): string {
  const lower = `${inputType ?? ""} ${name}`.toLowerCase();
  if (lower.includes("email")) return "email";
  if (lower.includes("phone") || lower.includes("mobile") || lower.includes("tel")) return "phone";
  if (inputType === "date" || lower.includes("date") || lower.includes("dob")) return "date";
  if (inputType === "number" || lower.includes("age") || lower.includes("number")) return "number";
  if (inputType === "checkbox") return "checkbox";
  if (inputType === "radio") return "radio";
  if (inputType === "file") return "file";
  return "text";
}

/**
 * Analyzes the raw HTML of an authorized external form and produces a
 * reusable Form Definition. This performs no interaction with the target
 * site beyond a single authorized fetch — no CAPTCHA/anti-bot bypass logic
 * is present or permitted here.
 */
export function analyzeFormHtml(html: string): FormField[] {
  const $ = cheerio.load(html);
  const fields: FormField[] = [];
  const seen = new Set<string>();

  $("form")
    .first()
    .find("input, select, textarea")
    .each((_, el) => {
      const tag = el.tagName.toLowerCase();
      const $el = $(el);
      const type = ($el.attr("type") ?? "text").toLowerCase();
      if (["hidden", "submit", "button", "image", "reset"].includes(type)) return;

      const name = $el.attr("name") || $el.attr("id");
      if (!name || seen.has(name)) return;
      seen.add(name);

      const label =
        $(`label[for="${$el.attr("id")}"]`).first().text().trim() ||
        $el.attr("placeholder") ||
        $el.attr("aria-label") ||
        humanizeLabel(name);

      let fieldType = tag === "select" ? "select" : tag === "textarea" ? "textarea" : inferType(type, name);
      let options: string[] | undefined;

      if (tag === "select") {
        options = $el
          .find("option")
          .map((__, opt) => $(opt).text().trim())
          .get()
          .filter(Boolean);
      }
      if (type === "radio") {
        fieldType = "radio";
      }

      fields.push({
        name,
        label: label.slice(0, 80),
        type: fieldType,
        required: $el.attr("required") !== undefined || $el.attr("aria-required") === "true",
        options,
      });
    });

  return fields;
}

export function suggestMapping(columns: string[], fields: FormField[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const semanticAliases: Record<string, string[]> = {
    firstname: ["firstname", "givenname", "forename", "first"],
    lastname: ["lastname", "surname", "familyname", "last"],
    email: ["email", "emailaddress", "mail"],
    phone: ["phone", "phonenumber", "mobile", "mobilenumber", "telephone", "tel"],
  };
  const semanticKey = (value: string) => {
    const normalized = normalize(value);
    return Object.entries(semanticAliases).find(([, aliases]) => aliases.some((alias) => normalized === alias || normalized.includes(alias)))?.[0];
  };

  for (const field of fields) {
    const targetNorm = normalize(field.name) + normalize(field.label);
    const targetSemantic = semanticKey(`${field.name} ${field.label}`);
    let bestMatch: string | undefined;
    let bestScore = 0;

    for (const column of columns) {
      const colNorm = normalize(column);
      const columnSemantic = semanticKey(column);
      let score = 0;
      if (targetNorm.includes(colNorm) || colNorm.includes(normalize(field.label))) score += 2;
      if (colNorm.includes(normalize(field.name))) score += 2;
      if (targetSemantic && targetSemantic === columnSemantic) score += 5;
      if (field.type === "email" && colNorm.includes("email")) score += 3;
      if (field.type === "phone" && (colNorm.includes("phone") || colNorm.includes("mobile") || colNorm.includes("tel"))) score += 3;
      if (colNorm.includes("name") && normalize(field.label).includes("name")) score += 1;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = column;
      }
    }
    if (bestMatch && bestScore > 0) {
      mapping[field.name] = bestMatch;
    }
  }
  return mapping;
}
