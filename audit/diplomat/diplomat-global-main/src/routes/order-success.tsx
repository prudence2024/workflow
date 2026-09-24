import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle2,
  PackageCheck,
  Download,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/social-icons";
import { z } from "zod";
import { useEffect, useReducer, useCallback, useRef } from "react";
import { trackMetaPurchase } from "@/lib/meta-pixel";
import { useServerFn, createServerFn } from "@tanstack/react-start";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { finalizePayment } from "@/lib/payment-finalize.server";
import {
  buildPaymentWhatsAppUrl,
  hasAuthoritativeFailure,
  isConfirmedPayment,
} from "@/lib/payment-client-state";
import { useRootLoaderData } from "@/hooks/use-root-loader-data";
import { getPaymentSuccessDetails } from "@/lib/payment-success.server";
import { useStore } from "@/components/store-provider";
import { clearCheckoutDraft } from "@/lib/checkout-draft";

import { initialPaymentSuccessState, paymentSuccessReducer } from "@/lib/payment-success-state";

const schema = z.object({ reference: z.string().optional(), token: z.string().optional() });

/** Server function to attempt payment finalization from the success page */
const finalizePaymentFn = createServerFn({ method: "POST" })
  .validator((input: { reference: string }) => input)
  .handler(async ({ data }) => finalizePayment(data.reference));

export const Route = createFileRoute("/order-success")({
  validateSearch: schema,
  head: () => ({
    meta: [
      { title: "Order received — Diplomat Global" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: OrderSuccess,
});

function OrderSuccess() {
  const { reference, token: initialToken } = Route.useSearch();
  return (
    <PaymentSuccessPage
      key={`${reference ?? ""}:${initialToken ?? ""}`}
      reference={reference}
      initialToken={initialToken}
    />
  );
}

function PaymentSuccessPage({
  reference,
  initialToken,
}: {
  reference?: string;
  initialToken?: string;
}) {
  const [state, dispatch] = useReducer(paymentSuccessReducer, initialPaymentSuccessState);
  const mounted = useRef(true);
  const paid = useRef(false);
  const orderDetails = state.order;
  const { clearCart } = useStore();

  // Authoritative Purchase event — fired exactly once, only after the server
  // has confirmed payment (never on redirect, never optimistically). Sends
  // order reference/totals only; no customer or payment credentials.
  const purchaseTracked = useRef(false);
  useEffect(() => {
    if (state.payment !== "paid" || !orderDetails || purchaseTracked.current) return;
    purchaseTracked.current = true;
    trackMetaPurchase({
      value: orderDetails.total,
      currency: orderDetails.currency,
      orderReference: orderDetails.reference,
    });
  }, [state.payment, orderDetails]);

  const finalizeStatus =
    state.payment === "paid"
      ? "success"
      : state.payment === "failed"
        ? "error"
        : state.payment === "checking"
          ? "verifying"
          : "pending";
  const finalizeMessage = state.message;
  const { siteSettings } = useRootLoaderData();
  const loadSuccessDetails = useServerFn(getPaymentSuccessDetails);
  const receiptUrl = orderDetails?.receiptToken ? `/api/receipt/${orderDetails.receiptToken}` : "";
  const whatsappUrl = orderDetails
    ? buildPaymentWhatsAppUrl({
        configuredUrl: siteSettings.whatsapp_url || "",
        orderReference: orderDetails.reference,
        total: orderDetails.total,
        currency: orderDetails.currency,
        items: orderDetails.items,
        receiptUrl: receiptUrl
          ? typeof window === "undefined"
            ? receiptUrl
            : new URL(receiptUrl, window.location.origin).href
          : undefined,
      })
    : "";

  const clearConfirmedCart = () => {
    // Authoritative paid: clear through the React store so the in-memory cart,
    // persisted storage and mounted consumers all agree. A raw localStorage
    // delete would be resurrected by the provider's next persist.
    clearCart();
    clearCheckoutDraft();
    try {
      localStorage.removeItem("dg-checkout-attempt-id");
    } catch {
      /* Storage is optional; payment authority is server-side. */
    }
  };

  const lookupReceipt = useCallback(async () => {
    dispatch({ type: "receipt", status: "loading" });
    try {
      const result = await loadSuccessDetails({
        data: reference ? { reference } : { receiptToken: initialToken },
      });
      if (!mounted.current) return;
      if (result.ok && result.payment_confirmed) {
        paid.current = true;
        dispatch({ type: "paid", order: result.order, receipt: result.receiptState });
        clearConfirmedCart();
        return "paid" as const;
      }
      dispatch({ type: "receipt", status: "error" });
      return "canFinalize" in result && result.canFinalize
        ? ("unconfirmed" as const)
        : ("unavailable" as const);
    } catch {
      if (mounted.current) dispatch({ type: "receipt", status: "error" });
      return "unavailable" as const;
    }
  }, [loadSuccessDetails, reference, initialToken]);

  const attemptFinalize = useCallback(async () => {
    if (paid.current || !reference) return;
    dispatch({ type: "payment", status: "checking", message: "Confirming your payment..." });
    try {
      const result = await finalizePaymentFn({ data: { reference } });
      if (!mounted.current) return;
      if (isConfirmedPayment(result) && result.order_summary) {
        paid.current = true;
        dispatch({
          type: "paid",
          order: { ...result.order_summary, receiptToken: result.receipt_token },
          receipt: result.receipt_token ? "ready" : "pending",
        });
        clearConfirmedCart();
      } else if (hasAuthoritativeFailure(result)) {
        dispatch({
          type: "payment",
          status: "failed",
          failureKind: result.failure_kind,
          message:
            result.failure_kind === "declined"
              ? `Your payment was declined by the payment provider${result.provider_reason && result.provider_reason !== result.provider_status ? `: ${result.provider_reason}` : ""}. Your cart and details have been preserved — you can safely retry payment from checkout.`
              : result.message ||
                "This payment attempt did not go through. Your cart and details have been preserved.",
        });
      } else {
        dispatch({
          type: "payment",
          status: result.message?.includes("pending") ? "pending" : "failed",
          message:
            result.message ||
            "Payment verification could not be completed. Please do not pay again.",
        });
      }
    } catch {
      if (mounted.current)
        dispatch({
          type: "payment",
          status: "pending",
          message: "We could not confirm your payment yet. Please do not pay again.",
        });
    }
  }, [reference]);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    // Refresh first reads durable application state; already-paid orders never replay finalization.
    lookupReceipt().then((confirmed) => {
      if (cancelled || confirmed === "paid" || paid.current) return;
      if (reference && confirmed === "unconfirmed") void attemptFinalize();
      else
        dispatch({
          type: "payment",
          status: "failed",
          message: "This payment could not be confirmed.",
        });
    });
    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, [lookupReceipt, attemptFinalize, reference]);

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main className="mx-auto grid max-w-3xl place-items-center px-5 py-20 text-center">
        <div>
          <span className="mx-auto grid size-20 place-items-center rounded-full bg-brand/10 text-brand">
            {finalizeStatus === "verifying" || finalizeStatus === "pending" ? (
              <Loader2 className="size-10 animate-spin" />
            ) : finalizeStatus === "error" ? (
              <AlertCircle className="size-10 text-destructive" />
            ) : (
              <CheckCircle2 className="size-10" />
            )}
          </span>
          <p className="mt-7 text-[10px] font-bold uppercase tracking-[0.2em] text-brand">
            {finalizeStatus === "success"
              ? "Payment successful"
              : finalizeStatus === "verifying" || finalizeStatus === "pending"
                ? "Confirming payment"
                : "Payment not completed"}
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold md:text-5xl">
            {finalizeStatus === "success"
              ? "Payment Successful"
              : finalizeStatus === "error"
                ? state.failureKind === "declined"
                  ? "Payment Declined"
                  : "Payment could not be completed"
                : finalizeStatus === "verifying" || finalizeStatus === "pending"
                  ? "Confirming your payment..."
                  : "Thank you for your order."}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-muted-foreground">
            {finalizeStatus === "success" && orderDetails
              ? `Thank you for your patronage. Order ${orderDetails.reference} is confirmed.`
              : finalizeStatus === "verifying" || finalizeStatus === "pending"
                ? "Please wait while we confirm your payment."
                : `Your payment reference ${reference ?? "is unavailable"} has not been confirmed.`}
          </p>

          {finalizeStatus === "success" && orderDetails && (
            <div className="mx-auto mt-6 max-w-xl rounded-2xl border border-border bg-surface p-5 text-left">
              <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
                <span className="text-sm text-muted-foreground">Final amount</span>
                <strong>
                  {new Intl.NumberFormat("en-NG", {
                    style: "currency",
                    currency: orderDetails.currency,
                  }).format(orderDetails.total)}
                </strong>
              </div>
              <div className="mt-4 space-y-3">
                {orderDetails.items.map((item, index) => (
                  <div key={`${item.name}-${index}`} className="flex justify-between gap-4 text-sm">
                    <span className="min-w-0">
                      {item.name} × {item.quantity}
                    </span>
                    <span className="shrink-0">
                      {new Intl.NumberFormat("en-NG", {
                        style: "currency",
                        currency: orderDetails.currency,
                      }).format(item.lineTotal)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {state.payment === "paid" && state.receipt !== "ready" && (
            <div
              className="mx-auto mt-4 max-w-md rounded-xl border border-border bg-surface p-4"
              role="status"
            >
              <p className="text-sm text-muted-foreground">
                {state.receipt === "error"
                  ? "We couldn't load your receipt right now."
                  : state.receipt === "loading"
                    ? "Loading your receipt..."
                    : "Receipt is being prepared."}
              </p>
              <button
                type="button"
                disabled={state.receipt === "loading"}
                onClick={() => void lookupReceipt()}
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold disabled:opacity-50"
              >
                <RefreshCw className="size-4" />
                {state.receipt === "loading" ? "Loading Receipt" : "Retry Receipt"}
              </button>
            </div>
          )}

          {/* Payment status feedback */}
          {finalizeStatus === "pending" && (
            <div className="mx-auto mt-4 max-w-md rounded-xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-950/20">
              <p className="text-sm text-orange-700 dark:text-orange-400">{finalizeMessage}</p>
            </div>
          )}
          {(finalizeStatus === "error" || finalizeStatus === "pending") && reference && (
            <div className="mx-auto mt-4 max-w-md space-y-3">
              <div
                className={`rounded-xl border p-4 ${
                  finalizeStatus === "error"
                    ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20"
                    : "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/20"
                }`}
              >
                <p
                  className={`text-sm ${
                    finalizeStatus === "error"
                      ? "text-red-700 dark:text-red-400"
                      : "text-orange-700 dark:text-orange-400"
                  }`}
                >
                  {finalizeMessage}
                </p>
              </div>
              {state.failureKind === "declined" ? (
                <Link
                  to="/checkout"
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-semibold hover:bg-accent transition"
                >
                  <RefreshCw className="size-4" />
                  Return to checkout and retry payment
                </Link>
              ) : (
                <button
                  onClick={() => {
                    void attemptFinalize();
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-semibold hover:bg-accent transition"
                >
                  <RefreshCw className="size-4" />
                  Retry payment verification
                </button>
              )}
            </div>
          )}

          {/* Receipt download + contact */}
          <div className="mt-6 space-y-3">
            {orderDetails?.receiptToken && (
              <div className="flex flex-wrap justify-center gap-3">
                <a
                  href={`${receiptUrl}?format=pdf`}
                  download
                  className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand/90"
                >
                  <Download className="size-4" />
                  Download Receipt
                </a>
                <a
                  href={receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-3 text-sm font-semibold"
                >
                  View / Print Receipt
                </a>
              </div>
            )}
            {orderDetails && whatsappUrl && (
              <div className="mt-4 rounded-xl border border-border bg-surface p-4">
                <p className="text-sm text-muted-foreground">Need help with your order?</p>
                <a
                  href={whatsappUrl || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline"
                >
                  <WhatsAppIcon className="size-4" />
                  Message us on WhatsApp
                </a>
              </div>
            )}
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/shop"
              search={{}}
              className="inline-flex min-h-12 items-center rounded-xl bg-inverse px-6 text-sm font-semibold text-inverse-foreground"
            >
              Continue shopping
            </Link>
            <Link
              to="/"
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold"
            >
              <PackageCheck className="size-4" />
              Back home
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
