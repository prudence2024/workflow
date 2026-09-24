import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import { WhatsAppIcon } from "@/components/social-icons";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { getFormErrorMessage, getFieldErrorMap } from "@/lib/form-errors";
import { useFormDraft } from "@/lib/form-draft";
import { SiteFooter } from "@/components/site-footer";
import { getSocialIcon } from "@/components/social-icons";
import { SiteHeader } from "@/components/site-header";
import { PhoneInput } from "@/components/ui/phone-input";
import { submitContactMessage } from "@/lib/contact.server";
import { getPublicSiteSettings, getPublicSocialLinks } from "@/lib/admin/server-fns";
import { buildContactModel } from "@/lib/public-content-model";
import type { SocialLike } from "@/lib/public-content-model";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — Diplomat Global" },
      {
        name: "description",
        content:
          "Contact Diplomat Global support about products, orders, delivery or warranty — we respond as soon as possible.",
      },
    ],
  }),
  loader: async () => {
    try {
      const { getPublicSiteSettings, getPublicSocialLinks } =
        await import("@/lib/admin/server-fns");
      const [settingsRes, socialsRes] = await Promise.all([
        getPublicSiteSettings({}).catch(() => ({ settings: {} })),
        getPublicSocialLinks({}).catch(() => ({ links: [] })),
      ]);
      return {
        settings: settingsRes.settings || {},
        socialLinks: socialsRes.links || [],
      };
    } catch {
      return { settings: {}, socialLinks: [] };
    }
  },
  component: Contact,
});

function CommunityCta({ link }: { link: SocialLike }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-surface px-4 text-xs font-semibold text-ink ring-1 ring-border transition hover:text-brand hover:ring-brand/40"
    >
      {link.platform === "custom" ? link.icon || "Community" : link.platform}
      <ExternalLink aria-hidden="true" className="size-3" />
    </a>
  );
}

function Contact() {
  const loaderData = Route.useLoaderData();
  const submitMessage = useServerFn(submitContactMessage);
  const [status, setStatus] = useState<{
    type: "idle" | "success" | "error";
    message: string;
  }>({ type: "idle", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneLocked, setPhoneLocked] = useState(false);
  const settings: Record<string, string> = loaderData.settings;
  const socialLinks: SocialLike[] = loaderData.socialLinks ?? [];
  const formRef = useRef<HTMLFormElement>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Non-sensitive draft (tab session): survives refresh/network interruption.
  // The honeypot `website` field is deliberately NOT persisted; the consent
  // checkbox is re-confirmed every session. Kept on failure/validation/timeout,
  // cleared only on confirmed server success.
  const CONTACT_DRAFT_FIELDS = ["name", "email", "phone", "subject", "message"] as const;
  type ContactDraft = Record<(typeof CONTACT_DRAFT_FIELDS)[number], string>;
  const draft = useFormDraft<ContactDraft>("dg-draft:contact", CONTACT_DRAFT_FIELDS);
  const [values, setValues] = useState({ name: "", email: "", subject: "", message: "" });
  const [draftRestored, setDraftRestored] = useState(false);
  useEffect(() => {
    if (!draft.ready || draftRestored) return;
    setDraftRestored(true);
    const restored = draft.values;
    setValues({
      name: restored.name || "",
      email: restored.email || "",
      subject: restored.subject || "",
      message: restored.message || "",
    });
    if (restored.phone) setPhone(restored.phone);
  }, [draft.ready, draft.values, draftRestored]);
  useEffect(() => {
    if (!draftRestored) return; // never persist before restoration completes
    draft.save({ ...values, phone });
  }, [draftRestored, draft.save, values, phone]);

  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const setField = (field: keyof typeof values) => (value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    clearFieldError(field);
  };

  // Phone lock from settings
  useEffect(() => {
    if (settings.phone_lock_nigeria === "true") setPhoneLocked(true);
  }, [settings]);

  // Single authority: same model as the footer, so both surfaces always agree.
  const contact = buildContactModel(socialLinks, settings);

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 py-12 sm:px-6 md:py-20">
        {/* Contact info + form */}
        <section className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand">
              Customer support
            </p>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight md:text-6xl">
              Let's solve it together.
            </h1>
            <p className="mt-5 text-base leading-7 text-muted-foreground">
              Ask about a product, an order, delivery or warranty support. Include your order number
              when available.
            </p>
            <div className="mt-8 space-y-4 text-sm" data-contact-source="site-settings">
              {/* 1. ADDRESS — exactly once */}
              <div className="rounded-xl bg-surface px-4 py-4 ring-1 ring-border">
                <p className="flex items-start gap-3">
                  <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand" />
                  <span className="break-words">
                    {contact.address || "Address not configured."}
                  </span>
                </p>
                {contact.directionsUrl && (
                  <a
                    href={contact.directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
                  >
                    <ExternalLink aria-hidden="true" className="size-3.5" />
                    Open in Google Maps
                  </a>
                )}
              </div>

              {/* 2. EMAIL */}
              {contact.email && (
                <a
                  href={`mailto:${contact.email}`}
                  className="flex min-h-12 items-center gap-3 rounded-xl bg-surface px-4 ring-1 ring-border"
                >
                  <Mail aria-hidden="true" className="size-5 text-brand" />
                  <span className="break-all">{contact.email}</span>
                </a>
              )}

              {/* 3. PHONE */}
              {contact.phone && (
                <a
                  href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
                  className="flex min-h-12 items-center gap-3 rounded-xl bg-surface px-4 ring-1 ring-border"
                >
                  <Phone aria-hidden="true" className="size-5 text-brand" />
                  {contact.phone}
                </a>
              )}

              {/* 4. WHATSAPP — customer-initiated wa.me only */}
              {contact.whatsapp && (
                <a
                  href={contact.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-12 items-center gap-3 rounded-xl bg-surface px-4 ring-1 ring-border"
                >
                  <WhatsAppIcon aria-hidden="true" className="size-5 text-brand" />
                  Message us on WhatsApp
                </a>
              )}
            </div>

            {/* Social icons — same set/order as Footer */}
            {contact.socialIcons.length > 0 && (
              <div className="mt-6">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Follow us
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {contact.socialIcons.map((s) => {
                    const Icon = getSocialIcon(s.platform, s.icon);
                    return (
                      <a
                        key={s.id}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Diplomat Global on ${s.platform}`}
                        title={s.platform}
                        className="grid size-10 place-items-center rounded-xl bg-surface text-muted-foreground ring-1 ring-border transition hover:bg-brand hover:text-brand-foreground"
                      >
                        <Icon aria-hidden="true" className="size-4" />
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 5. Custom/community CTA buttons — same links as Footer */}
            {contact.communityCtas.length > 0 && (
              <div className="mt-6">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Join the community
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {contact.communityCtas.map((link) => (
                    <CommunityCta key={link.id} link={link} />
                  ))}
                </div>
              </div>
            )}

            {/* Configured map embed, if any */}
            {contact.embedUrl && (
              <div className="mt-6 overflow-hidden rounded-2xl ring-1 ring-border">
                <iframe
                  src={contact.embedUrl}
                  title="Diplomat Global location map"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="h-64 w-full border-0"
                />
              </div>
            )}
          </div>

          <form
            ref={formRef}
            className="rounded-3xl bg-card p-6 ring-1 ring-border sm:p-8"
            onSubmit={async (event) => {
              event.preventDefault();
              if (isSubmitting) return;
              const form = event.currentTarget;
              const formData = new FormData(form);
              setIsSubmitting(true);
              setStatus({ type: "idle", message: "" });
              setFieldErrors({});
              try {
                const result = await submitMessage({
                  data: {
                    name: String(formData.get("name") || ""),
                    email: String(formData.get("email") || ""),
                    phone: phone || "",
                    subject: String(formData.get("subject") || ""),
                    message: String(formData.get("message") || ""),
                    website: String(formData.get("website") || ""),
                  },
                });
                setStatus({ type: result.ok ? "success" : "error", message: result.message });
                if (result.ok) {
                  draft.clear();
                  setValues({ name: "", email: "", subject: "", message: "" });
                  setPhone("");
                  form.reset();
                  toast.success("Message sent!", { description: result.message });
                } else {
                  toast.error("Send failed", { description: result.message });
                }
              } catch (err: unknown) {
                const errors = getFieldErrorMap(err);
                setFieldErrors(errors);
                setStatus({ type: "error", message: getFormErrorMessage(err) });
                const firstField = Object.keys(errors)[0];
                if (firstField && formRef.current) {
                  const el = formRef.current.querySelector(`[name="${firstField}"]`);
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                    (el as HTMLElement).focus();
                  }
                }
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            <label className="sr-only" aria-hidden="true">
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                Name
                <input
                  name="name"
                  required
                  autoComplete="name"
                  value={values.name}
                  onChange={(event) => setField("name")(event.target.value)}
                  aria-invalid={!!fieldErrors.name}
                  aria-describedby={fieldErrors.name ? "err-name" : undefined}
                  className={`mt-2 min-h-12 w-full rounded-xl bg-surface px-4 font-normal outline-none ring-1 ring-border transition ${fieldErrors.name ? "ring-destructive focus:ring-2 focus:ring-destructive/30" : "focus:border-brand focus:ring-2 focus:ring-brand/15"}`}
                />
                {fieldErrors.name && (
                  <span id="err-name" className="mt-1 text-xs text-red-500" role="alert">
                    {fieldErrors.name}
                  </span>
                )}
              </label>
              <label className="text-sm font-semibold">
                Email
                <input
                  name="email"
                  required
                  type="email"
                  autoComplete="email"
                  value={values.email}
                  onChange={(event) => setField("email")(event.target.value)}
                  aria-invalid={!!fieldErrors.email}
                  aria-describedby={fieldErrors.email ? "err-email" : undefined}
                  className={`mt-2 min-h-12 w-full rounded-xl bg-surface px-4 font-normal outline-none ring-1 ring-border transition ${fieldErrors.email ? "ring-destructive focus:ring-2 focus:ring-destructive/30" : "focus:border-brand focus:ring-2 focus:ring-brand/15"}`}
                />
                {fieldErrors.email && (
                  <span id="err-email" className="mt-1 text-xs text-red-500" role="alert">
                    {fieldErrors.email}
                  </span>
                )}
              </label>
            </div>
            <label className="mt-5 block text-sm font-semibold">
              Phone (optional)
              <PhoneInput
                value={phone}
                onChange={setPhone}
                countryLocked={phoneLocked}
                className="mt-2"
              />
            </label>
            <label className="mt-5 block text-sm font-semibold">
              Subject
              <input
                name="subject"
                required
                value={values.subject}
                onChange={(event) => setField("subject")(event.target.value)}
                aria-invalid={!!fieldErrors.subject}
                aria-describedby={fieldErrors.subject ? "err-subject" : undefined}
                className={`mt-2 min-h-12 w-full rounded-xl bg-surface px-4 font-normal outline-none ring-1 ring-border transition ${fieldErrors.subject ? "ring-destructive focus:ring-2 focus:ring-destructive/30" : "focus:border-brand focus:ring-2 focus:ring-brand/15"}`}
              />
              {fieldErrors.subject && (
                <span id="err-subject" className="mt-1 text-xs text-red-500" role="alert">
                  {fieldErrors.subject}
                </span>
              )}
            </label>
            <label className="mt-5 block text-sm font-semibold">
              Message
              <textarea
                name="message"
                required
                rows={6}
                value={values.message}
                onChange={(event) => setField("message")(event.target.value)}
                aria-invalid={!!fieldErrors.message}
                aria-describedby={fieldErrors.message ? "err-message" : undefined}
                className={`mt-2 w-full rounded-xl bg-surface p-4 font-normal outline-none ring-1 ring-border transition ${fieldErrors.message ? "ring-destructive focus:ring-2 focus:ring-destructive/30" : "focus:border-brand focus:ring-2 focus:ring-brand/15"}`}
              />
              {fieldErrors.message && (
                <span id="err-message" className="mt-1 text-xs text-red-500" role="alert">
                  {fieldErrors.message}
                </span>
              )}
            </label>
            <label className="mt-4 flex items-start gap-3 cursor-pointer group">
              <span className="relative flex size-5 shrink-0 items-center justify-center rounded-md border border-border bg-surface transition-all group-hover:border-brand group-focus-within:border-brand mt-0.5">
                <input type="checkbox" name="consent" required className="peer sr-only" />
                <span className="size-2.5 rounded-sm bg-brand opacity-0 transition-opacity peer-checked:opacity-100" />
              </span>
              <span className="text-xs leading-5 text-muted-foreground">
                I agree that Diplomat Global may use my submitted details to respond to my enquiry,
                process my request, and send a confirmation email, in line with the{" "}
                <a href="/privacy-policy" target="_blank" className="underline hover:text-brand">
                  Privacy Policy
                </a>{" "}
                and{" "}
                <a
                  href="/terms-and-conditions"
                  target="_blank"
                  className="underline hover:text-brand"
                >
                  Terms &amp; Conditions
                </a>
                .
              </span>
            </label>
            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-5 min-h-12 rounded-xl bg-inverse px-6 text-sm font-semibold text-inverse-foreground disabled:cursor-wait disabled:opacity-60"
            >
              {isSubmitting ? "Sending…" : "Send message"}
            </button>
            <p
              className={`mt-3 text-sm ${
                status.type === "error"
                  ? "text-destructive"
                  : status.type === "success"
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-muted-foreground"
              }`}
              role="status"
              aria-live="polite"
            >
              {status.message || "We use your details only to respond to this enquiry."}
            </p>
          </form>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
