import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  LockKeyhole,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  Truck,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { CustomSelect } from "@/components/ui/custom-select";
import { PhoneInput } from "@/components/ui/phone-input";
import { useStore } from "@/components/store-provider";
import { formatNaira } from "@/lib/products";
import { getFormErrorMessage, getFieldErrorMap } from "@/lib/form-errors";
import { NIGERIA_STATES, getLGAs } from "@/lib/nigeria-locations";
import { getCheckoutQuote, initializeCheckout, validateCoupon } from "@/lib/checkout.server";
import type { CartLineIssue, CheckoutQuote, CheckoutQuoteLine } from "@/lib/checkout-quote";
import { getPublicSiteSettings } from "@/lib/admin/server-fns";
import { toCheckoutItems } from "@/lib/cart-storage";
import {
  canSubmitCheckout,
  quoteAmountLabel,
  runCheckoutQuoteRequest,
} from "@/lib/checkout-ui-state";
import { loadCheckoutDraft, saveCheckoutDraft, type CheckoutDraft } from "@/lib/checkout-draft";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Secure checkout — Diplomat Global" },
      {
        name: "description",
        content: "Complete your Diplomat Global order with secure payment and nationwide delivery.",
      },
      { name: "robots", content: "noindex,follow" },
    ],
  }),
  component: Checkout,
});

function Checkout() {
  const { cart, cartCompatibilityIssue, cartProducts, updateQuantity, removeFromCart } = useStore();
  const [submitting, setSubmitting] = useState(false);
  const [selectedState, setSelectedState] = useState("");
  const [selectedLga, setSelectedLga] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discount: number;
    discountType: string;
    discountValue: number;
    couponId: string;
  } | null>(null);
  const [couponError, setCouponError] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [quote, setQuote] = useState<
    (Omit<CheckoutQuote, "items"> & { items: Array<Omit<CheckoutQuoteLine, "cost_price">> }) | null
  >(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [lineIssues, setLineIssues] = useState<CartLineIssue[]>([]);
  const [quoteRetry, setQuoteRetry] = useState(0);

  // Checkout attempt ID: stable per checkout session, persisted in localStorage.
  // Same ID across tabs/retries prevents duplicate order creation server-side.
  const [checkoutAttemptId] = useState(() => {
    const storageKey = "dg-checkout-attempt-id";
    const existing = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
    if (existing) return existing;
    const newId = crypto.randomUUID();
    if (typeof window !== "undefined") localStorage.setItem(storageKey, newId);
    return newId;
  });

  const validateCouponFn = useServerFn(validateCoupon);
  const getQuote = useServerFn(getCheckoutQuote);
  const checkout = useServerFn(initializeCheckout);
  const fetchSettings = useServerFn(getPublicSiteSettings);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [phoneE164, setPhoneE164] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  // Non-sensitive checkout draft: restored once after mount (post-hydration, so
  // SSR and the first client render always agree), persisted on every change,
  // and cleared ONLY on authoritative payment success (see callback/success).
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [draftReady, setDraftReady] = useState(false);

  useEffect(() => {
    const draft: CheckoutDraft = loadCheckoutDraft();
    setFullName(draft.fullName);
    setEmail(draft.email);
    setPhoneE164(draft.phone);
    if (draft.state) setSelectedState(draft.state);
    if (draft.lga) setSelectedLga(draft.lga);
    setCity(draft.city);
    setAddress(draft.address);
    setDraftReady(true);
  }, []);

  useEffect(() => {
    if (!draftReady) return; // never persist before restoration completes
    saveCheckoutDraft({
      fullName,
      email,
      phone: phoneE164,
      state: selectedState,
      lga: selectedLga,
      city,
      address,
    });
  }, [draftReady, fullName, email, phoneE164, selectedState, selectedLga, city, address]);

  // Clear field error when user edits that field
  const clearFieldError = (fieldName: string) => {
    if (fieldErrors[fieldName]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
    }
  };

  useEffect(() => {
    fetchSettings({})
      .then((res) => {
        if (res.settings) setSettings(res.settings);
      })
      .catch(() => {});
  }, [fetchSettings]);

  const subtotal = quote?.subtotal;
  const delivery = quote?.delivery_fee;
  const discount = quote?.discount;
  const total = quote?.total;

  const availableLGAs = selectedState ? getLGAs(selectedState) : [];
  const sortedStates = [...NIGERIA_STATES].sort((a, b) => a.name.localeCompare(b.name));

  const checkoutItems = useMemo(() => toCheckoutItems(cart), [cart]);
  const cartItemKey = checkoutItems.map((item) => `${item.productId}:${item.quantity}`).join(",");
  useEffect(() => {
    if (!checkoutItems.length) {
      setQuote(null);
      setQuoteError("");
      setLineIssues([]);
      return;
    }
    let cancelled = false;
    void runCheckoutQuoteRequest({
      request: () =>
        getQuote({
          data: {
            items: checkoutItems,
            couponCode: appliedCoupon?.code,
          },
        }),
      onStart: () => {
        if (cancelled) return;
        setQuoteLoading(true);
        setQuoteError("");
        setLineIssues([]);
      },
      onSuccess: (result) => {
        if (cancelled) return;
        setQuote(result.quote);
        setLineIssues(result.quote.issues ?? []);
      },
      onError: (error) => {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Order total could not be refreshed.";
        setQuote(null);
        setQuoteError(message);
        if (appliedCoupon?.code) {
          setAppliedCoupon(null);
          setCouponError(message);
        }
      },
      onFinish: () => {
        if (!cancelled) setQuoteLoading(false);
      },
    });
    return () => {
      cancelled = true;
    };
  }, [appliedCoupon?.code, cartItemKey, checkoutItems, getQuote, quoteRetry]);

  const handleApplyCoupon = async () => {
    const code = couponCode.trim();
    if (!code) return;
    setCouponLoading(true);
    setCouponError("");
    try {
      const result = await validateCouponFn({
        data: {
          code,
          items: checkoutItems,
        },
      });
      if (result.valid) {
        setAppliedCoupon({
          code: result.code,
          discount: result.discount,
          discountType: result.discountType,
          discountValue: result.discountValue,
          couponId: result.couponId,
        });
        setQuote(result.quote);
        setCouponError("");
      } else {
        setAppliedCoupon(null);
        setCouponError(result.message);
      }
    } catch (err: unknown) {
      setAppliedCoupon(null);
      setCouponError(err instanceof Error ? err.message : "Failed to validate coupon.");
    }
    setCouponLoading(false);
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !canSubmitCheckout({
        cartSize: cart.length,
        hasQuote: Boolean(quote),
        loading: quoteLoading,
        error: quoteError,
      })
    )
      return;
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    const rawPhone = (form.get("phone") as string)?.replace(/\s/g, "") ?? "";
    // Truthful phone semantics: an empty field is a missing value, not an
    // invalid one — the customer must be told what is actually wrong instead
    // of a generic server rejection of a fabricated "+234..." string.
    const phoneMissing = !phoneE164 && !rawPhone;
    if (phoneMissing) {
      setFieldErrors({ phone: "Please enter your phone number." });
      setSubmitting(false);
      document.getElementById("phone-input")?.focus();
      return;
    }
    const phone = phoneE164 || `+234${rawPhone}`;

    try {
      const result = await checkout({
        data: {
          email,
          phone,
          fullName: fullName || undefined,
          checkoutAttemptId,
          items: checkoutItems,
          shippingAddress: {
            state: selectedState,
            lga: selectedLga,
            city: city || undefined,
            address,
          },
          couponCode: appliedCoupon?.code || undefined,
        },
      });
      localStorage.setItem("dg-checkout-attempt-id", result.checkout_attempt_id);
      if (result.authorization_url) {
        // Do NOT clear cart here — cart is cleared only after server-verified
        // successful payment in the callback/webhook flow.
        window.location.href = result.authorization_url;
      }
    } catch (err: unknown) {
      console.error("Checkout failed:", err);
      const errors = getFieldErrorMap(err);
      setFieldErrors(errors);
      toast.error(getFormErrorMessage(err));
      // Focus or scroll to first invalid field
      const firstErrorField = Object.keys(errors)[0];
      if (firstErrorField && formRef.current) {
        const selector = `[name="${firstErrorField}"]`;
        const el = formRef.current.querySelector(selector);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          (el as HTMLElement).focus();
        }
      }
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-6 md:py-12">
        <Link
          to="/shop"
          search={{}}
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-ink"
        >
          <ArrowLeft className="size-4" /> Continue shopping
        </Link>
        <div className="mt-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand">
            Secure checkout
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold md:text-4xl">
            Complete your order
          </h1>
        </div>
        {!cart.length ? (
          <div className="mt-10 rounded-3xl border border-dashed border-border py-20 text-center">
            <ShoppingBag className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-4 font-display text-xl font-semibold">
              {cartCompatibilityIssue
                ? "Your saved cart needs to be refreshed"
                : "Your cart is empty"}
            </h2>
            {cartCompatibilityIssue && (
              <p className="mx-auto mt-2 max-w-md px-5 text-sm text-muted-foreground" role="alert">
                An older cart item could not be verified safely. Add the product again from the Shop
                to receive a current server-verified price.
              </p>
            )}
            <Link
              to="/shop"
              search={{}}
              className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-inverse px-6 text-sm font-semibold text-inverse-foreground"
            >
              Browse products
            </Link>
          </div>
        ) : (
          <form
            ref={formRef}
            onSubmit={submit}
            className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start"
          >
            <section className="space-y-6">
              {cartCompatibilityIssue && (
                <div
                  className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
                  role="alert"
                >
                  An older cart item could not be verified safely. Return to the Shop and add that
                  item again before placing your order.
                </div>
              )}
              <div className="rounded-2xl bg-card p-5 ring-1 ring-border sm:p-7">
                <h2 className="font-display text-lg font-semibold">Contact and delivery</h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {/* Full name */}
                  <label className="grid gap-2 text-sm font-medium">
                    Full name
                    <input
                      name="fullName"
                      type="text"
                      required
                      maxLength={100}
                      placeholder="e.g. Chinwuko Afamefuna"
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        clearFieldError("fullName");
                      }}
                      aria-invalid={!!fieldErrors.fullName}
                      aria-describedby={fieldErrors.fullName ? "err-fullName" : undefined}
                      className={`appearance-none min-h-12 pr-10 rounded-xl border bg-canvas px-4 outline-none focus:ring-2 focus:ring-brand/15 ${fieldErrors.fullName ? "border-destructive focus:border-destructive" : "border-border focus:border-brand"}`}
                    />
                    {fieldErrors.fullName && (
                      <span id="err-fullName" className="text-xs text-destructive" role="alert">
                        {fieldErrors.fullName}
                      </span>
                    )}
                  </label>
                  {/* Email */}
                  <label className="grid gap-2 text-sm font-medium">
                    Email address
                    <input
                      name="email"
                      type="email"
                      required
                      maxLength={100}
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearFieldError("email");
                      }}
                      aria-invalid={!!fieldErrors.email}
                      aria-describedby={fieldErrors.email ? "err-email" : undefined}
                      className={`appearance-none min-h-12 pr-10 rounded-xl border bg-canvas px-4 outline-none focus:ring-2 focus:ring-brand/15 ${fieldErrors.email ? "border-destructive focus:border-destructive" : "border-border focus:border-brand"}`}
                    />
                    {fieldErrors.email && (
                      <span id="err-email" className="text-xs text-destructive" role="alert">
                        {fieldErrors.email}
                      </span>
                    )}
                  </label>
                  {/* International phone input */}
                  <label className="grid gap-2 text-sm font-medium">
                    Phone number
                    <PhoneInput
                      id="phone-input"
                      name="phone"
                      value={phoneE164}
                      onChange={(v) => {
                        setPhoneE164(v);
                        if (fieldErrors.phone) {
                          setFieldErrors((prev) => {
                            const { phone: _cleared, ...rest } = prev;
                            return rest;
                          });
                        }
                      }}
                      required
                      defaultCountry="NG"
                      countryLocked={settings.phone_lock_nigeria === "true"}
                      className="min-h-12"
                    />
                    {fieldErrors.phone && (
                      <span className="text-xs text-destructive" role="alert">
                        {fieldErrors.phone}
                      </span>
                    )}
                  </label>
                  {/* State dropdown — searchable: 36 states + FCT */}
                  <CustomSelect
                    label="State"
                    value={selectedState}
                    onChange={(v) => {
                      setSelectedState(v);
                      setSelectedLga("");
                    }}
                    options={[
                      { value: "", label: "Select state" },
                      ...sortedStates.map((s) => ({ value: s.name, label: s.name })),
                    ]}
                    variant="public"
                    placeholder="Select state"
                    searchable
                  />
                  {/* LGA dropdown — dependent on state, searchable (up to 40+ LGAs) */}
                  <CustomSelect
                    label="Local Government Area (LGA)"
                    value={selectedLga}
                    onChange={(v) => setSelectedLga(v)}
                    options={[
                      { value: "", label: selectedState ? "Select LGA" : "Select state first" },
                      ...availableLGAs.map((lga) => ({ value: lga, label: lga })),
                    ]}
                    disabled={!selectedState}
                    variant="public"
                    searchable
                    dropUp
                  />
                  {/* City / Area */}
                  <label className="grid gap-2 text-sm font-medium">
                    City / Area
                    <input
                      name="city"
                      type="text"
                      required
                      maxLength={100}
                      placeholder="e.g. Victoria Island, Ikeja"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="appearance-none min-h-12 pr-10 rounded-xl border border-border bg-canvas px-4 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                    />
                  </label>
                  {/* Delivery address */}
                  <label className="grid gap-2 text-sm font-medium sm:col-span-2">
                    Delivery address
                    <textarea
                      name="address"
                      required
                      maxLength={240}
                      rows={3}
                      placeholder="Street address, landmark, apartment details"
                      value={address}
                      onChange={(e) => {
                        setAddress(e.target.value);
                        clearFieldError("shippingAddress.address");
                      }}
                      aria-invalid={!!fieldErrors["shippingAddress.address"]}
                      aria-describedby={
                        fieldErrors["shippingAddress.address"] ? "err-address" : undefined
                      }
                      className={`rounded-xl border bg-canvas px-4 py-3 outline-none focus:ring-2 focus:ring-brand/15 ${fieldErrors["shippingAddress.address"] ? "border-destructive focus:border-destructive" : "border-border focus:border-brand"}`}
                    />
                    {fieldErrors["shippingAddress.address"] && (
                      <span id="err-address" className="text-xs text-destructive" role="alert">
                        {fieldErrors["shippingAddress.address"]}
                      </span>
                    )}
                  </label>
                </div>
              </div>
              <div className="rounded-2xl bg-card p-5 ring-1 ring-border sm:p-7">
                <h2 className="font-display text-lg font-semibold">Payment</h2>
                <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-brand bg-brand/5 p-4">
                  <input
                    type="radio"
                    name="payment"
                    defaultChecked
                    className="mt-1 accent-[color:var(--brand)]"
                  />
                  <CreditCard className="size-5 text-brand" />
                  <span>
                    <strong className="block text-sm">Secure online payment</strong>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Paystack card, bank transfer or USSD. Payment opens after order confirmation.
                    </span>
                  </span>
                </label>
                <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <LockKeyhole className="size-4" />
                  Your payment information is encrypted and never stored here.
                </p>
              </div>
            </section>
            <aside className="rounded-2xl bg-card p-5 ring-1 ring-border lg:sticky lg:top-28">
              <h2 className="font-display text-lg font-semibold">Order summary</h2>
              <div className="mt-5 max-h-80 space-y-4 overflow-y-auto pr-1">
                {(quote?.items ?? []).map((line) => {
                  const cartProduct = cartProducts.find(
                    ({ product }) => product.id === line.product_id,
                  )?.product;
                  return (
                    <div key={line.product_id} className="flex gap-3">
                      <img
                        src={cartProduct?.image || "/content/hero/slide-1.jpg"}
                        alt={line.name}
                        className="size-16 rounded-xl object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-xs font-semibold">{line.name}</p>
                        <p className="mt-1 text-xs text-brand">{formatNaira(line.unit_price)}</p>
                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center rounded-lg border border-border">
                            <button
                              type="button"
                              aria-label={`Decrease ${line.name}`}
                              onClick={() => updateQuantity(line.product_id, line.quantity - 1)}
                              className="grid size-7 place-items-center"
                            >
                              <Minus className="size-3" />
                            </button>
                            <span className="w-6 text-center text-xs">{line.quantity}</span>
                            <button
                              type="button"
                              aria-label={`Increase ${line.name}`}
                              onClick={() => updateQuantity(line.product_id, line.quantity + 1)}
                              className="grid size-7 place-items-center"
                            >
                              <Plus className="size-3" />
                            </button>
                          </div>
                          <button
                            type="button"
                            aria-label={`Remove ${line.name}`}
                            onClick={() => removeFromCart(line.product_id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {quoteLoading && (
                  <p className="text-sm text-muted-foreground">Refreshing current prices…</p>
                )}
                {lineIssues.length > 0 && !quoteLoading && (
                  <div
                    className="rounded-xl border border-amber-500/40 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-900/15"
                    role="status"
                  >
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                      Your cart was updated to match current availability — please review:
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {lineIssues.map((issue) => (
                        <li
                          key={`${issue.productId}:${issue.reason}`}
                          className="text-sm text-amber-800 dark:text-amber-300"
                        >
                          {issue.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {quoteError && (
                  <div
                    className="rounded-xl border border-destructive/30 bg-destructive/5 p-3"
                    role="alert"
                  >
                    <p className="text-sm text-destructive">{quoteError}</p>
                    <button
                      type="button"
                      onClick={() => setQuoteRetry((current) => current + 1)}
                      disabled={quoteLoading}
                      className="mt-2 min-h-11 rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:bg-accent disabled:opacity-60"
                    >
                      {quoteLoading ? "Retrying…" : "Retry current prices"}
                    </button>
                  </div>
                )}
              </div>
              {/* Coupon section */}
              <div className="mt-4 border-t border-border pt-4">
                {appliedCoupon ? (
                  <div className="flex items-center justify-between rounded-xl bg-green-50 dark:bg-green-900/15 px-4 py-3">
                    <div className="text-sm">
                      <span className="font-medium text-green-700 dark:text-green-400">
                        ✓ {appliedCoupon.code} applied
                      </span>
                      <span className="ml-2 text-green-600 dark:text-green-500">
                        You save {formatNaira(appliedCoupon.discount)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveCoupon}
                      className="ml-3 text-xs font-medium text-green-700 underline hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={couponCode}
                        onChange={(e) => {
                          setCouponCode(e.target.value);
                          if (couponError) setCouponError("");
                        }}
                        placeholder="Coupon code"
                        className="flex-1 rounded-xl border border-border bg-canvas px-4 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                      />
                      <button
                        type="button"
                        onClick={handleApplyCoupon}
                        disabled={couponLoading || !couponCode.trim()}
                        className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
                      >
                        {couponLoading ? "..." : "Apply"}
                      </button>
                    </div>
                    {couponError && (
                      <p className="mt-2 text-xs text-red-600 dark:text-red-400">{couponError}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>
                    {quoteAmountLabel({
                      loading: quoteLoading,
                      error: quoteError,
                      value: subtotal,
                      format: formatNaira,
                    })}
                  </span>
                </div>
                {(discount ?? 0) > 0 && (
                  <div className="flex justify-between text-green-600 dark:text-green-400">
                    <span>Coupon discount</span>
                    <span>-{formatNaira(discount ?? 0)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Truck className="size-4" />
                    Delivery
                  </span>
                  <span>
                    {delivery === 0 && !quoteLoading && !quoteError
                      ? "Free"
                      : quoteAmountLabel({
                          loading: quoteLoading,
                          error: quoteError,
                          value: delivery,
                          format: formatNaira,
                        })}
                  </span>
                </div>
                {quote?.free_delivery_applied && (
                  <p className="text-right text-xs font-semibold text-green-600 dark:text-green-400">
                    Free Delivery
                  </p>
                )}
                {quote?.free_delivery_enabled &&
                  !quote.free_delivery_applied &&
                  quote.amount_remaining_for_free_delivery !== null &&
                  quote.amount_remaining_for_free_delivery > 0 && (
                    <p className="text-right text-xs text-muted-foreground">
                      Add {formatNaira(quote.amount_remaining_for_free_delivery)} more to qualify
                      for free delivery.
                    </p>
                  )}
                <div className="flex justify-between border-t border-border pt-4 font-display text-lg font-semibold">
                  <span>Total</span>
                  <span>
                    {quoteAmountLabel({
                      loading: quoteLoading,
                      error: quoteError,
                      value: total,
                      format: formatNaira,
                    })}
                  </span>
                </div>
              </div>
              <button
                type="submit"
                disabled={
                  submitting ||
                  cartCompatibilityIssue ||
                  !canSubmitCheckout({
                    cartSize: cart.length,
                    hasQuote: Boolean(quote),
                    loading: quoteLoading,
                    error: quoteError,
                  })
                }
                className="mt-6 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-inverse px-5 text-sm font-semibold text-inverse-foreground hover:bg-brand disabled:opacity-60"
              >
                {submitting ? (
                  "Preparing payment…"
                ) : (
                  <>
                    <CheckCircle2 className="size-5" />
                    Place order
                  </>
                )}
              </button>
            </aside>
          </form>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
