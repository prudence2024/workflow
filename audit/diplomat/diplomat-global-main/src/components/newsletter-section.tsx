import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { useState, useRef, type FormEvent } from "react";
import { subscribeNewsletter } from "@/lib/newsletter.server";
import { getFormErrorMessage, getFieldErrorMap } from "@/lib/form-errors";

type Status = { type: "idle" | "success" | "error"; message: string };

export function NewsletterSection() {
  const subscribe = useServerFn(subscribeNewsletter);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>({ type: "idle", message: "" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const emailRef = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;              setIsSubmitting(true);
              setStatus({ type: "idle", message: "" });
              setFieldErrors({});
    try {
      const result = await subscribe({ data: { email, consent } });
      if (result.ok) {
        if (result.already_subscribed) {
          setStatus({
            type: "success",
            message: "You're already subscribed! Thank you for your continued interest.",
          });
        } else {
          setStatus({
            type: "success",
            message: "You're on the list! New arrivals and buying advice are on the way.",
          });
        }
        setEmail("");
        setConsent(false);
      } else {
        setStatus({ type: "error", message: result.message });
      }
    } catch (err: unknown) {
      const errors = getFieldErrorMap(err);
      setFieldErrors(errors);
      setStatus({ type: "error", message: getFormErrorMessage(err) });
      if (errors.email && emailRef.current) emailRef.current.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="border-t border-border bg-inverse text-inverse-foreground">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-16 md:grid-cols-[1fr_0.9fr] md:items-end md:py-20">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand">
            Stay in the loop
          </p>
          <h2 className="mt-3 max-w-xl font-display text-3xl font-semibold tracking-tight md:text-5xl">
            New arrivals and useful buying advice.
          </h2>
        </div>
        <div>
          {status.type === "success" ? (
            <div
              className="animate-pop-in flex items-center gap-3 rounded-xl border border-brand/30 bg-brand/10 px-5 py-4"
              role="status"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-brand-foreground">
                <Check className="size-4" />
              </span>
              <p className="text-sm font-semibold">{status.message}</p>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-3">
              <div className="flex w-full min-w-0 max-w-full flex-col gap-3 sm:flex-row">
                <label className="sr-only" htmlFor="newsletter-email">
                  Email address
                </label>
                <input
                  ref={emailRef}
                  id="newsletter-email"
                  required
                  type="email"
                  value={email}
                  onChange={(event) => { setEmail(event.target.value); setFieldErrors((p) => { const n = { ...p }; delete n.email; return n; }); }}
                  placeholder="Email address"
                  aria-invalid={!!fieldErrors.email}
                  aria-describedby={fieldErrors.email ? "err-nl-email" : undefined}
                  className={`min-h-12 w-full min-w-0 flex-1 rounded-xl bg-inverse-foreground/10 px-4 text-sm text-inverse-foreground outline-none ring-1 placeholder:text-inverse-foreground/50 transition ${fieldErrors.email ? "ring-red-500 focus:ring-2 focus:ring-red-500/30" : "ring-inverse-foreground/15 focus:ring-2 focus:ring-brand"}`}
                />
                <button
                  type="submit"
                  disabled={isSubmitting || !consent}
                  className="group inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-6 text-sm font-semibold text-brand-foreground transition hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Signing up…
                    </>
                  ) : (
                    <>
                      Subscribe
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </div>
              <label className="flex items-start gap-2.5 text-xs leading-5 text-inverse-foreground/60">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  className="mt-0.5 accent-[color:var(--brand)]"
                />
                I agree to receive occasional product news and buying advice. You can unsubscribe
                anytime.
              </label>
              {fieldErrors.email && (
                <p id="err-nl-email" className="text-xs text-red-400" role="alert">{fieldErrors.email}</p>
              )}
              {status.type === "error" && !fieldErrors.email && (
                <p className="text-sm text-red-400" role="status" aria-live="polite">
                  {status.message}
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
