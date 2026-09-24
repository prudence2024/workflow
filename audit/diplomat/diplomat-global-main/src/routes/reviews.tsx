import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Star, CheckCircle, MessageSquare } from "lucide-react";
import { getFormErrorMessage, getFieldErrorMap } from "@/lib/form-errors";
import { googleReviewCtaUrl } from "@/lib/public-content-model";
import { useFormDraft } from "@/lib/form-draft";
import { useRootLoaderData } from "@/hooks/use-root-loader-data";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { submitPublicTestimonial } from "@/lib/testimonial-public.server";
import { loadReviewClaimContext, redeemReviewClaim } from "@/lib/review-claims.server";

export const Route = createFileRoute("/reviews")({
  validateSearch: (search: Record<string, unknown>) => ({
    claim: typeof search.claim === "string" ? search.claim : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Leave a Review — Diplomat Global" },
      {
        name: "description",
        content:
          "Share your experience with Diplomat Global. Leave a review or testimonial about our products and service.",
      },
    ],
  }),
  component: ReviewPage,
});

/** Tab-session draft fields — nothing sensitive; see src/lib/form-draft.ts. */
const TESTIMONIAL_DRAFT_FIELDS = ["name", "email", "message", "rating", "consent"] as const;
type TestimonialDraft = Partial<
  Record<(typeof TESTIMONIAL_DRAFT_FIELDS)[number], string | boolean>
>;

function ReviewPage() {
  const submitTestimonial = useServerFn(submitPublicTestimonial);
  const rootCtx = useRootLoaderData();
  // Guest Verified-Purchase claim redemption (Owner-approved): /reviews?claim=<raw token>
  // from the purchaser email. The typed email here is contact data only — the
  // server derives verified_purchase exclusively from the hashed claim.
  const claimParam = Route.useSearch().claim;
  const [claimCheck, setClaimCheck] = useState<
    | { state: "checking" }
    | { state: "none" }
    | { state: "valid"; productName: string }
    | { state: "invalid" }
  >(claimParam ? { state: "checking" } : { state: "none" });
  const [claimSubmitted, setClaimSubmitted] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const redeemClaim = useServerFn(redeemReviewClaim);
  const loadClaim = useServerFn(loadReviewClaimContext);
  useEffect(() => {
    if (!claimParam || claimCheck.state !== "checking") return;
    let cancelled = false;
    (async () => {
      try {
        const ctx = await loadClaim({ data: { token: claimParam } });
        if (!cancelled) {
          setClaimCheck(
            ctx && ctx.valid
              ? { state: "valid", productName: ctx.productName }
              : { state: "invalid" },
          );
        }
      } catch {
        if (!cancelled) setClaimCheck({ state: "invalid" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [claimParam, claimCheck.state, loadClaim]);
  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimParam || isRedeeming) return;
    const clientErrors: Record<string, string> = {};
    if (!name.trim()) clientErrors.name = "Please enter your name.";
    if (message.trim().length < 10) clientErrors.message = "Please write at least 10 characters.";
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      return;
    }
    setIsRedeeming(true);
    setClaimError(null);
    try {
      const res = await redeemClaim({
        data: {
          token: claimParam,
          name: name.trim(),
          email: email.trim(),
          rating,
          title: undefined,
          body: message.trim(),
        },
      });
      if (res.ok) {
        setClaimSubmitted(true);
        toast.success("Thank you! Your verified purchase review is live.");
      } else {
        const map: Record<string, string> = {
          already_used: "This review link has already been used.",
          revoked: "This review link is no longer active.",
          expired: "This review link has expired.",
          order_not_eligible: "This order no longer qualifies for a verified review.",
          product_not_in_order: "This review link does not match this order.",
          already_reviewed: "A review was already submitted for this product.",
          rate_limited: "Too many attempts. Please try again later.",
        };
        setClaimError(map[res.reason] ?? "This review link is not valid.");
        toast.error(map[res.reason] ?? "This review link is not valid.");
      }
    } catch (err: unknown) {
      console.error("[reviews] claim redemption error:", err);
      toast.error(getFormErrorMessage(err));
    } finally {
      setIsRedeeming(false);
    }
  };
  // "Also review us on Google" CTA — configuration-gated. Rendered ONLY when
  // the Owner has stored an authoritative https Google-owned review/place URL
  // in site settings (google_review_url). Never invented, never scraped.
  const googleReviewUrl = googleReviewCtaUrl(String(rootCtx.siteSettings.google_review_url ?? ""));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rating, setRating] = useState(5);
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  // Non-sensitive draft: survives refresh/network interruption in this tab.
  // Kept on failed submission, validation errors and timeouts; cleared only
  // on confirmed server success or the explicit "Submit Another" reset.
  const draft = useFormDraft<TestimonialDraft>("dg-draft:testimonial", TESTIMONIAL_DRAFT_FIELDS);
  const [draftRestored, setDraftRestored] = useState(false);
  useEffect(() => {
    if (!draft.ready || draftRestored) return;
    setDraftRestored(true);
    if (typeof draft.values.name === "string" && draft.values.name) setName(draft.values.name);
    if (typeof draft.values.email === "string" && draft.values.email) setEmail(draft.values.email);
    if (typeof draft.values.message === "string" && draft.values.message)
      setMessage(draft.values.message);
    if (draft.values.rating) {
      const parsed = Number(draft.values.rating);
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 5) setRating(parsed);
    }
    if (draft.values.consent === true) setConsent(true);
  }, [draft.ready, draft.values, draftRestored]);
  useEffect(() => {
    if (!draftRestored) return; // never persist before restoration completes
    draft.save({ name, email, message, rating: String(rating), consent });
  }, [draftRestored, draft.save, name, email, message, rating, consent]);

  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const focusFirstError = (errors: Record<string, string>) => {
    const first = Object.keys(errors)[0];
    if (first && formRef.current) {
      const el = formRef.current.querySelector(`[name="${first}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        (el as HTMLElement).focus();
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clientErrors: Record<string, string> = {};
    if (!name.trim()) clientErrors.name = "Please enter your name.";
    else if (/\d/.test(name.trim())) clientErrors.name = "Name cannot contain numbers.";
    if (!message.trim()) clientErrors.message = "Please write your testimonial.";
    else if (message.trim().length < 10)
      clientErrors.message = "Your testimonial is too short. Please write at least 10 characters.";
    if (!consent) clientErrors.consent = "Please consent to publishing your testimonial.";
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      focusFirstError(clientErrors);
      return;
    }
    setIsSubmitting(true);
    setFieldErrors({});
    try {
      const res = await submitTestimonial({
        data: {
          name: name.trim(),
          email: email.trim() || undefined,
          rating,
          message: message.trim(),
          consent_to_publish: true as const,
        },
      });
      if (res && res.ok) {
        draft.clear();
        setSubmitted(true);
        toast.success(res.message);
      } else if (res) {
        toast.error(res.message || "Submission failed. Please try again.");
      } else {
        toast.error("No response from server. Please try again.");
      }
    } catch (err: unknown) {
      console.error("[reviews] Submission error:", err);
      const errors = getFieldErrorMap(err);
      setFieldErrors(errors);
      toast.error(getFormErrorMessage(err));
      focusFirstError(errors);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-5 py-12 sm:px-6 md:py-20">
        <section className="text-center mb-10">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-brand/10 text-brand mb-4">
            <MessageSquare className="h-7 w-7" />
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight md:text-5xl">
            Share Your Experience
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground max-w-lg mx-auto">
            We value your feedback! Tell us about your experience with Diplomat Global — your
            testimonial helps us improve and helps other customers make informed decisions.
          </p>
        </section>

        {claimCheck.state === "checking" ? (
          <section
            aria-live="polite"
            className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted-foreground mb-10"
          >
            Checking your review link…
          </section>
        ) : claimCheck.state === "valid" ? (
          <section
            aria-labelledby="claim-heading"
            className="rounded-xl border border-border bg-surface p-6 mb-10"
          >
            {claimSubmitted ? (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 mb-3">
                  <CheckCircle className="h-7 w-7" />
                </div>
                <h2
                  id="claim-heading"
                  className="text-lg font-semibold text-gray-900 dark:text-white"
                >
                  Verified review published
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Your review for {claimCheck.productName} is live with the Verified Purchase badge.
                </p>
              </div>
            ) : (
              <form onSubmit={handleClaimSubmit} className="space-y-5">
                <div>
                  <h2
                    id="claim-heading"
                    className="font-display text-xl font-semibold text-gray-900 dark:text-white"
                  >
                    Review your purchase
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    You're reviewing{" "}
                    <span className="font-medium text-gray-900 dark:text-white">
                      {claimCheck.productName}
                    </span>{" "}
                    — a product you purchased. Your review will carry the Verified Purchase badge.
                  </p>
                </div>
                {claimError ? (
                  <p role="alert" className="text-sm text-red-500">
                    {claimError}
                  </p>
                ) : null}
                <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Your Name *
                  <input
                    type="text"
                    name="claim-name"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      clearFieldError("name");
                    }}
                    required
                    aria-invalid={!!fieldErrors.name}
                    className={`px-3 py-2.5 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none ${fieldErrors.name ? "border-red-500" : "border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand/30"}`}
                  />
                  {fieldErrors.name ? (
                    <span className="text-xs text-red-500" role="alert">
                      {fieldErrors.name}
                    </span>
                  ) : null}
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Email (private, not shown publicly)
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Rating
                  <div className="flex gap-1 pt-1">
                    {[1, 2, 3, 4, 5].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRating(r)}
                        aria-label={`Rate ${r} star${r > 1 ? "s" : ""}`}
                        aria-pressed={r === rating}
                        className="rounded transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        <Star
                          className={`h-7 w-7 ${
                            r <= rating
                              ? "text-yellow-400 fill-yellow-400"
                              : "text-gray-300 dark:text-gray-600"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Your Review *
                  <textarea
                    name="claim-body"
                    value={message}
                    onChange={(e) => {
                      setMessage(e.target.value);
                      clearFieldError("message");
                    }}
                    rows={5}
                    required
                    aria-invalid={!!fieldErrors.message}
                    className={`px-3 py-2.5 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none ${fieldErrors.message ? "border-red-500" : "border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand/30"}`}
                  />
                  {fieldErrors.message ? (
                    <span className="text-xs text-red-500" role="alert">
                      {fieldErrors.message}
                    </span>
                  ) : null}
                </label>
                <button
                  type="submit"
                  disabled={isRedeeming}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0891b2] text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-60"
                >
                  {isRedeeming ? "Submitting…" : "Submit verified review"}
                </button>
              </form>
            )}
          </section>
        ) : claimCheck.state === "invalid" ? (
          <section
            role="alert"
            className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted-foreground mb-10"
          >
            This review link is not valid, has expired, or has already been used. If you received it
            in an order email, request a fresh link by contacting support.
          </section>
        ) : null}

        {submitted ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 mb-4">
              <CheckCircle className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Thank You!</h2>
            <p className="mt-3 text-muted-foreground max-w-md mx-auto">
              Your testimonial has been submitted successfully. It will appear on our site after a
              quick review by our team.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => {
                  draft.clear();
                  setSubmitted(false);
                  setName("");
                  setEmail("");
                  setRating(5);
                  setMessage("");
                  setConsent(false);
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0891b2] text-white text-sm font-medium hover:opacity-90 transition"
              >
                Submit Another
              </button>
              <Link
                to="/"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-surface transition"
              >
                Go Home
              </Link>
              <Link
                to="/shop"
                search={{}}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-surface transition"
              >
                Continue Shopping
              </Link>
              {googleReviewUrl && (
                <a
                  href={googleReviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-surface transition"
                >
                  Also review us on Google
                </a>
              )}
            </div>
          </div>
        ) : (
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
              Your Name *
              <input
                type="text"
                name="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  clearFieldError("name");
                }}
                placeholder="e.g. Charles-Clement"
                required
                aria-invalid={!!fieldErrors.name}
                aria-describedby={fieldErrors.name ? "err-rv-name" : undefined}
                className={`px-3 py-2.5 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none ${fieldErrors.name ? "border-red-500 focus:ring-2 focus:ring-red-500/20" : "border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand/30"}`}
              />
              {fieldErrors.name ? (
                <span id="err-rv-name" className="text-xs text-red-500" role="alert">
                  {fieldErrors.name}
                </span>
              ) : (
                <span className="text-xs text-gray-400">
                  Letters, apostrophes, hyphens, and accented characters welcome. No digits.
                </span>
              )}
            </label>

            {/* Email (private) */}
            <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
              Email (private, not shown publicly)
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </label>

            {/* Rating */}
            <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
              Rating
              <div className="flex gap-1 pt-1">
                {[1, 2, 3, 4, 5].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRating(r)}
                    aria-label={`Rate ${r} star${r > 1 ? "s" : ""}`}
                    aria-pressed={r === rating}
                    className="rounded transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Star
                      className={`h-7 w-7 ${
                        r <= rating
                          ? "text-yellow-400 fill-yellow-400"
                          : "text-gray-300 dark:text-gray-600"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </label>

            {/* Testimonial */}
            <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
              Your Testimonial *
              <textarea
                name="message"
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  clearFieldError("message");
                }}
                rows={5}
                placeholder="Tell us about your experience with Diplomat Global..."
                required
                aria-invalid={!!fieldErrors.message}
                aria-describedby={fieldErrors.message ? "err-rv-message" : undefined}
                className={`px-3 py-2.5 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none resize-y ${fieldErrors.message ? "border-red-500 focus:ring-2 focus:ring-red-500/20" : "border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand/30"}`}
              />
              {fieldErrors.message ? (
                <span id="err-rv-message" className="text-xs text-red-500" role="alert">
                  {fieldErrors.message}
                </span>
              ) : (
                <span className="text-xs text-gray-400">Minimum 10 characters.</span>
              )}
            </label>

            {/* Consent */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 accent-[#0891b2]"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                I consent to Diplomat Global publishing my name and testimonial on their website. My
                email will remain private. See our{" "}
                <a href="/privacy-policy" target="_blank" className="underline hover:text-brand">
                  Privacy Policy
                </a>{" "}
                for details.
              </span>
            </label>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#0891b2] text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Testimonial"
              )}
            </button>
          </form>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
