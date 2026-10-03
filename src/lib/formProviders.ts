import "server-only";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { analyzeFormHtml } from "@/lib/formAnalysis";
import { assertFormUrlAllowed, fetchFormHtml } from "@/lib/formUrlPolicy";
import type { FormField } from "@/db/schema";

/**
 * Form provider adapters (system-breaker: never claim analysis succeeded
 * when fields are ambiguous; security: every navigation passes the SSRF
 * policy first; package-intelligence: playwright-core only, browsers are
 * the pre-installed ms-playwright cache, no new browser downloads).
 *
 * - StandardHtmlFormAdapter: genuinely static HTML forms (fetch + Cheerio).
 * - GoogleFormsAdapter: JS-rendered Google Forms (Playwright rendered DOM,
 *   semantic label-anchored selectors, entry ids recorded, never nth-child).
 *
 * Chromium code NEVER lives in this bundle: OpenNext esbuild cannot bundle
 * Playwright for workerd, so rendered-DOM analysis runs in the plain-Node
 * helper `scripts/analyze-form.mjs`, invoked here as a child process with a
 * timeout. Cloudflare Workers cannot spawn processes either, so the browser
 * path fails closed on edge instead of pretending to work.
 *
 * New providers add an adapter here without touching the engine.
 */

export type FormProvider = "standard" | "google";

export type AnalyzedForm = {
  provider: FormProvider;
  finalUrl: string;
  fields: FormField[];
  /** Human-readable diagnostics when analysis is partial or impossible. */
  diagnostics: string[];
};

function inferGoogleFieldType(label: string, rawType: string): string {
  const normalized = `${label} ${rawType}`.toLowerCase();
  if (rawType === "textarea") return "textarea";
  if (rawType === "dropdown") return "select";
  if (rawType === "choice") return "radio";
  if (rawType === "checkbox") return "checkbox";
  if (normalized.includes("email")) return "email";
  if (normalized.includes("phone") || normalized.includes("mobile") || normalized.includes("tel")) return "tel";
  if (normalized.includes("date")) return "date";
  if (normalized.includes("number") || normalized.includes("age")) return "number";
  return "text";
}

export function providerForUrl(rawUrl: string): FormProvider {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (host === "docs.google.com" || host.endsWith(".docs.google.com")) return "google";
  } catch {
    // Falls through to standard; URL validation happens in the policy.
  }
  return "standard";
}

// ---------------------------------------------------------------------------
// Standard HTML adapter (static forms)
// ---------------------------------------------------------------------------

export async function analyzeStandardForm(rawUrl: string): Promise<AnalyzedForm> {
  const { finalUrl, html } = await fetchFormHtml(rawUrl);
  const staticFields = analyzeFormHtml(html);
  const diagnostics: string[] = [];
  if (staticFields.length === 0) {
    diagnostics.push(
      "No form fields were detected in the static HTML. The page may render its form with JavaScript — only Google Forms has browser analysis in this build.",
    );
  }
  const fields: FormField[] = staticFields.map((f, index: number) => ({
    name: f.name,
    label: f.label,
    type: f.type,
    required: f.required,
    options: f.options,
    provider: "standard" as const,
    selector: { kind: "standard-control", index },
  }));
  return { provider: "standard", finalUrl, fields, diagnostics };
}

// ---------------------------------------------------------------------------
// Google Forms adapter (rendered DOM via scripts/analyze-form.mjs)
// ---------------------------------------------------------------------------

/**
 * Rendered-DOM analysis runs OUTSIDE this bundle (see module header).
 * Spawns `node scripts/analyze-form.mjs` with a hard timeout and parses
 * its JSON contract. Fails closed on edge runtimes and on any helper
 * failure — never a partial field set presented as success.
 */
export async function analyzeGoogleForm(rawUrl: string): Promise<AnalyzedForm> {
  await assertFormUrlAllowed(rawUrl);
  if (process.env.DATABASE_RUNTIME === "edge") {
    throw new Error("Browser form analysis is unavailable in this runtime");
  }
  const helper = join(process.cwd(), "scripts", "analyze-form.mjs");
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(process.execPath, [helper, rawUrl], { timeout: 90_000 }, (err, out, errOut) => {
      if (err) {
        const detail = String(errOut || err.message || err).split("\n")[0].replace(/^ERROR:\s*/, "");
        reject(new Error(detail || "Browser analysis failed"));
        return;
      }
      resolve(String(out));
    });
  });
  let parsed: AnalyzedForm;
  try {
    parsed = JSON.parse(stdout) as AnalyzedForm;
  } catch {
    throw new Error("Browser analysis returned an unreadable result");
  }
  if (!parsed || parsed.provider !== "google" || !Array.isArray(parsed.fields)) {
    throw new Error("Browser analysis returned an unreadable result");
  }
  // Re-parse labels through the unit-tested parser so the contract holds
  // even if the helper and this module ever drift.
  const fields: FormField[] = parsed.fields.map((f, index: number) => {
    const relabelled = parseGoogleQuestionText(String(f.label ?? ""), index);
    const label = relabelled.label || String(f.label ?? `Question ${index + 1}`).slice(0, 80);
    return {
      name: String(f.name ?? `question_${index}`),
      label,
      type: inferGoogleFieldType(label, String(f.type ?? "text")),
      required: typeof f.required === "boolean" ? f.required : relabelled.required,
      options: Array.isArray(f.options) ? (f.options as string[]) : undefined,
      provider: "google" as const,
      providerFieldId: typeof f.providerFieldId === "string" ? f.providerFieldId : undefined,
      selector: { kind: "google-question", label, index },
    };
  });
  return {
    provider: "google",
    finalUrl: typeof parsed.finalUrl === "string" ? parsed.finalUrl : rawUrl,
    fields,
    diagnostics: Array.isArray(parsed.diagnostics) ? (parsed.diagnostics as string[]) : [],
  };
}

/**
 * Pure question-text parsing (unit-tested): Google appends "*" plus the
 * "Your answer" affordance to required questions, e.g.
 * "Full Name *Your answer". Labels are truncated to 80 chars.
 */
export function parseGoogleQuestionText(
  rawText: string,
  index: number,
): { label: string; required: boolean } {
  const text = rawText.replace(/\s+/g, " ").trim().slice(0, 120);
  const label = text.replace(/\s*\*.*$/, "").trim() || `Question ${index + 1}`;
  const required = /\*/.test(text.slice(0, label.length + 3));
  return { label: label.slice(0, 80), required };
}

// ---------------------------------------------------------------------------
// Evidence contract (written ONLY by scripts/form-worker.mjs, read here).
// status='successful' without this shape is a bug, never a claim.
// ---------------------------------------------------------------------------

export type SubmissionEvidence = {
  provider: "google";
  submittedAt: string;
  finalUrl: string;
  confirmationType: "recorded-confirmation";
  confirmationExcerpt: string;
  workerRunId: string;
  attemptId: string;
};


/** Single entry point for analysis: provider-routed, policy-gated. */
export async function analyzeFormUrl(rawUrl: string): Promise<AnalyzedForm> {
  const provider = providerForUrl(rawUrl);
  if (provider === "google") return analyzeGoogleForm(rawUrl);
  return analyzeStandardForm(rawUrl);
}
