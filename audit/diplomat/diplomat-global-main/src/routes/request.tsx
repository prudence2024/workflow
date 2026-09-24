import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Send, CheckCircle, Package, ArrowLeft } from "lucide-react";
import { submitContactMessage } from "@/lib/contact.server";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { CustomSelect } from "@/components/ui/custom-select";
import { validateName } from "@/lib/name-validation";
import { getFormErrorMessage, getFieldErrorMap } from "@/lib/form-errors";
import { PhoneInput } from "@/components/ui/phone-input";
import { getPublicSiteSettings } from "@/lib/admin/server-fns";
import { useFormDraft } from "@/lib/form-draft";

const siteUrl = (import.meta.env.VITE_SITE_URL || "https://diplomatglobal.com").replace(/\/+$/, "");

export const Route = createFileRoute("/request")({
  head: () => ({
    meta: [
      { title: "Request a Product — Diplomat Global" },
      {
        name: "description",
        content:
          "Can't find what you need? Tell us what you're looking for and we'll help you get it.",
      },
      { property: "og:title", content: "Request a Product — Diplomat Global" },
      {
        property: "og:description",
        content: "Tell us what technology you need and we'll source it for you.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: RequestPage,
});

function RequestPage() {
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const submitMessage = useServerFn(submitContactMessage);
  const fetchSettings = useServerFn(getPublicSiteSettings);
  const [phoneLocked, setPhoneLocked] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLDivElement>(null);

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

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    product_description: "",
    budget: "",
    preferred_brand: "",
    urgency: "normal",
  });

  // Non-sensitive draft: survives refresh/network interruption in this tab.
  // Kept on failed submission, validation errors and timeouts; cleared only
  // on confirmed server success.
  const REQUEST_DRAFT_FIELDS = [
    "first_name",
    "last_name",
    "email",
    "phone",
    "product_description",
    "budget",
    "preferred_brand",
    "urgency",
  ] as const;
  const draft = useFormDraft("dg-draft:product-request", REQUEST_DRAFT_FIELDS);
  const [draftRestored, setDraftRestored] = useState(false);
  useEffect(() => {
    if (!draft.ready || draftRestored) return;
    setDraftRestored(true);
    const restored = draft.values;
    if (Object.keys(restored).length > 0) {
      setForm((prev) => ({ ...prev, ...restored }));
    }
  }, [draft.ready, draft.values, draftRestored]);
  useEffect(() => {
    if (!draftRestored) return; // never persist before restoration completes
    draft.save(form);
  }, [draftRestored, draft.save, form]);

  useEffect(() => {
    fetchSettings({})
      .then((res) => {
        if (res.settings?.phone_lock_nigeria === "true") setPhoneLocked(true);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    const clientErrors: Record<string, string> = {};
    if (!form.first_name) clientErrors.first_name = "Please enter your first name.";
    else {
      const e = validateName(form.first_name);
      if (e) clientErrors.first_name = e;
    }
    if (form.last_name) {
      const e = validateName(form.last_name);
      if (e) clientErrors.last_name = e;
    }
    if (!form.email) clientErrors.email = "Please enter your email address.";
    if (!form.product_description)
      clientErrors.product_description = "Please describe what you're looking for.";
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      focusFirstError(clientErrors);
      return;
    }
    setSending(true);
    setFieldErrors({});
    try {
      const subject = "Product Request: " + form.product_description.slice(0, 80);
      const body = [
        "PRODUCT REQUEST",
        "",
        "What I am looking for: " + form.product_description,
        form.budget ? "Budget: " + form.budget : "",
        form.preferred_brand ? "Preferred brand: " + form.preferred_brand : "",
        "Urgency: " + form.urgency,
        "",
        "Phone: " + (form.phone || "Not provided"),
      ]
        .filter(Boolean)
        .join(String.fromCharCode(10) + String.fromCharCode(10));
      const res = await submitMessage({
        data: {
          name: (form.first_name + " " + form.last_name).trim(),
          email: form.email,
          subject,
          message: body,
          website: "",
        },
      });
      if (res.ok) {
        draft.clear();
        setSubmitted(true);
      } else {
        toast.error(res.message || "Failed to submit request.");
      }
    } catch (err: unknown) {
      const errors = getFieldErrorMap(err);
      setFieldErrors(errors);
      toast.error(getFormErrorMessage(err));
      focusFirstError(errors);
    }
    setSending(false);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-canvas">
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-5 py-20 sm:px-6 text-center">
          <div className="rounded-2xl bg-surface p-10 ring-1 ring-border">
            <div className="mx-auto mb-6 grid size-16 place-items-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle className="size-8 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              Request submitted
            </h1>
            <p className="mt-4 text-muted-foreground">
              We've received your product request. Our team will review it and get back to you
              within 24 hours with availability and pricing.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                to="/shop"
                search={{}}
                className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-inverse px-6 text-sm font-semibold text-inverse-foreground"
              >
                <Package className="size-4" /> Browse our store
              </Link>
              <Link
                to="/"
                className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:border-brand"
              >
                <ArrowLeft className="size-4" /> Back to home
              </Link>
            </div>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-5 py-12 sm:px-6 md:py-20">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-ink mb-8"
        >
          <ArrowLeft className="size-4" /> Back to home
        </Link>

        <div className="rounded-2xl bg-surface p-8 ring-1 ring-border sm:p-10">
          <div className="mb-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand">
              Product request
            </p>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Can't find what you need?
            </h1>
            <p className="mt-4 text-muted-foreground">
              Tell us what you're looking for and we'll source it for you. We work with trusted
              suppliers across Nigeria to find the right technology at the right price.
            </p>
          </div>

          <div ref={formRef} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-ink">
                First name *
                <input
                  name="first_name"
                  type="text"
                  value={form.first_name}
                  onChange={(e) => {
                    setForm({ ...form, first_name: e.target.value });
                    clearFieldError("first_name");
                  }}
                  placeholder="Adebayo"
                  aria-invalid={!!fieldErrors.first_name}
                  aria-describedby={fieldErrors.first_name ? "err-req-fn" : undefined}
                  className={`appearance-none px-3 py-2.5 pr-8 rounded-xl border bg-card text-ink text-sm focus:outline-none ${fieldErrors.first_name ? "border-red-500 focus:ring-2 focus:ring-red-500/20" : "border-border focus:ring-2 focus:ring-brand/30"}`}
                />
                {fieldErrors.first_name && (
                  <span id="err-req-fn" className="text-xs text-red-500" role="alert">
                    {fieldErrors.first_name}
                  </span>
                )}
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-ink">
                Last name
                <input
                  name="last_name"
                  type="text"
                  value={form.last_name}
                  onChange={(e) => {
                    setForm({ ...form, last_name: e.target.value });
                    clearFieldError("last_name");
                  }}
                  placeholder="Ogundimu"
                  aria-invalid={!!fieldErrors.last_name}
                  aria-describedby={fieldErrors.last_name ? "err-req-ln" : undefined}
                  className={`appearance-none px-3 py-2.5 pr-8 rounded-xl border bg-card text-ink text-sm focus:outline-none ${fieldErrors.last_name ? "border-red-500 focus:ring-2 focus:ring-red-500/20" : "border-border focus:ring-2 focus:ring-brand/30"}`}
                />
                {fieldErrors.last_name && (
                  <span id="err-req-ln" className="text-xs text-red-500" role="alert">
                    {fieldErrors.last_name}
                  </span>
                )}
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-ink">
                Email *
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => {
                    setForm({ ...form, email: e.target.value });
                    clearFieldError("email");
                  }}
                  placeholder="you@example.com"
                  aria-invalid={!!fieldErrors.email}
                  aria-describedby={fieldErrors.email ? "err-req-email" : undefined}
                  className={`appearance-none px-3 py-2.5 pr-8 rounded-xl border bg-card text-ink text-sm focus:outline-none ${fieldErrors.email ? "border-red-500 focus:ring-2 focus:ring-red-500/20" : "border-border focus:ring-2 focus:ring-brand/30"}`}
                />
                {fieldErrors.email && (
                  <span id="err-req-email" className="text-xs text-red-500" role="alert">
                    {fieldErrors.email}
                  </span>
                )}
              </label>
              <div className="grid gap-1.5 text-sm font-medium text-ink">
                Phone (WhatsApp)
                <PhoneInput
                  value={form.phone}
                  onChange={(e164) => setForm({ ...form, phone: e164 })}
                  defaultCountry="NG"
                  countryLocked={phoneLocked}
                  className="min-h-12"
                />
              </div>
            </div>

            <label className="grid gap-1.5 text-sm font-medium text-ink">
              What are you looking for? *
              <textarea
                name="product_description"
                value={form.product_description}
                onChange={(e) => {
                  setForm({ ...form, product_description: e.target.value });
                  clearFieldError("product_description");
                }}
                rows={4}
                placeholder="e.g. I need a 27-inch 4K monitor for graphic design work, preferably Dell or LG, with USB-C connectivity..."
                aria-invalid={!!fieldErrors.product_description}
                aria-describedby={fieldErrors.product_description ? "err-req-pd" : undefined}
                className={`px-3 py-2.5 rounded-xl border bg-card text-ink text-sm focus:outline-none resize-y ${fieldErrors.product_description ? "border-red-500 focus:ring-2 focus:ring-red-500/20" : "border-border focus:ring-2 focus:ring-brand/30"}`}
              />
              {fieldErrors.product_description && (
                <span id="err-req-pd" className="text-xs text-red-500" role="alert">
                  {fieldErrors.product_description}
                </span>
              )}
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <CustomSelect
                label="Budget range"
                value={form.budget}
                onChange={(v) => setForm({ ...form, budget: v })}
                options={[
                  { value: "", label: "Any budget" },
                  { value: "Under ₦100,000", label: "Under ₦100,000" },
                  { value: "₦100,000 – ₦300,000", label: "₦100,000 – ₦300,000" },
                  { value: "₦300,000 – ₦500,000", label: "₦300,000 – ₦500,000" },
                  { value: "₦500,000 – ₦1,000,000", label: "₦500,000 – ₦1,000,000" },
                  { value: "Over ₦1,000,000", label: "Over ₦1,000,000" },
                ]}
                variant="public"
              />
              <label className="grid gap-1.5 text-sm font-medium text-ink">
                Preferred brand
                <input
                  type="text"
                  value={form.preferred_brand}
                  onChange={(e) => setForm({ ...form, preferred_brand: e.target.value })}
                  placeholder="e.g. Dell, LG, Samsung"
                  className="appearance-none px-3 py-2.5 pr-8 rounded-xl border border-border bg-card text-ink text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
            </div>

            <CustomSelect
              label="How soon do you need it?"
              value={form.urgency}
              onChange={(v) => setForm({ ...form, urgency: v })}
              options={[
                { value: "normal", label: "Normal (1–2 weeks)" },
                { value: "urgent", label: "Urgent (within 3 days)" },
                { value: "flexible", label: "Flexible timeline" },
              ]}
              variant="public"
            />

            <button
              type="button"
              onClick={handleSubmit}
              disabled={sending}
              className="inline-flex w-full sm:w-auto min-h-13 items-center justify-center gap-2 rounded-xl bg-inverse px-8 text-sm font-semibold text-inverse-foreground transition hover:bg-brand hover:text-brand-foreground disabled:opacity-50"
            >
              <Send className="size-4" />
              {sending ? "Submitting..." : "Submit request"}
            </button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
