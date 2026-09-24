import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import * as React from "react";
import { finalizePayment } from "@/lib/payment-finalize.server";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import {
  hasAuthoritativeFailure,
  isConfirmedPayment,
  type PaymentFailureKind,
} from "@/lib/payment-client-state";
import { useStore } from "@/components/store-provider";
import { clearCheckoutDraft } from "@/lib/checkout-draft";

const finalizePaymentFn = createServerFn({ method: "POST" })
  .validator((input: { reference: string }) => input)
  .handler(async ({ data }) => {
    // Set Vercel bypass cookie so the subsequent redirect to
    // /order-success also passes Vercel Preview Protection.
    try {
      const { setVercelBypassCookie } = await import("@/lib/vercel-bypass.server");
      setVercelBypassCookie();
    } catch {
      // Preview bypass configuration is optional outside protected previews.
    }
    return finalizePayment(data.reference);
  });

export const Route = createFileRoute("/checkout_/callback")({
  head: () => ({
    meta: [
      { title: "Confirming payment — Diplomat Global" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: CheckoutCallback,
});

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

function CheckoutCallback() {
  const [status, setStatus] = React.useState<"verifying" | "success" | "pending" | "error">(
    "verifying",
  );
  const [message, setMessage] = React.useState("");
  const [failureKind, setFailureKind] = React.useState<PaymentFailureKind | null>(null);
  const [retryCount, setRetryCount] = React.useState(0);
  const referenceRef = React.useRef<string | null>(null);
  const { clearCart } = useStore();

  const attemptFinalize = React.useCallback(
    async (reference: string, attempt: number) => {
      try {
        setStatus("verifying");
        setMessage(
          attempt > 0
            ? `Retrying... (attempt ${attempt + 1}/${MAX_RETRIES + 1})`
            : "Verifying your payment with Paystack...",
        );
        const result = await finalizePaymentFn({ data: { reference } });

        if (isConfirmedPayment(result)) {
          setStatus("success");
          setMessage("Payment confirmed! Redirecting...");
          // Authoritative paid: clear through the React store so in-memory state,
          // persisted storage and every mounted consumer agree — a raw
          // localStorage delete here would let the provider re-persist the
          // purchased items on the next render.
          clearCart();
          clearCheckoutDraft();
          try {
            localStorage.removeItem("dg-checkout-attempt-id");
          } catch {
            // private browsing — safe to ignore
          }
          const tokenParam = result.receipt_token ? `&token=${result.receipt_token}` : "";
          setTimeout(() => {
            window.location.href = `/order-success?reference=${reference}${tokenParam}`;
          }, 800);
        } else if (
          result.message?.includes("pending") ||
          result.message?.includes("not successful")
        ) {
          // Payment may still be processing at Paystack
          if (attempt < MAX_RETRIES) {
            setStatus("pending");
            setMessage("Your payment is still being processed. Please wait...");
            setRetryCount(attempt + 1);
            setTimeout(() => attemptFinalize(reference, attempt + 1), RETRY_DELAY_MS);
          } else {
            setStatus("error");
            setMessage(
              "We could not confirm your payment. Please check your email for confirmation or contact support. Do NOT attempt to pay again.",
            );
          }
        } else if (hasAuthoritativeFailure(result)) {
          // Provider-verified end state: never auto-retry a definitive result.
          setFailureKind(result.failure_kind);
          setStatus("error");
          setMessage(
            result.failure_kind === "declined"
              ? `Your payment was declined by the payment provider${result.provider_reason ? `: ${result.provider_reason}` : ""}. Your cart and details have been preserved — you can safely retry payment.`
              : result.message ||
                  "This payment attempt did not go through. Your cart and details have been preserved.",
          );
        } else {
          setFailureKind(null);
          setStatus("error");
          setMessage(result.message || "Payment verification could not be completed.");
        }
      } catch {
        if (attempt < MAX_RETRIES) {
          setStatus("pending");
          setMessage("Having trouble connecting. Retrying...");
          setRetryCount(attempt + 1);
          setTimeout(() => attemptFinalize(reference, attempt + 1), RETRY_DELAY_MS);
        } else {
          setStatus("error");
          setMessage(
            "We could not verify your payment due to a connection issue. Your payment may still be processing. Please contact support if you were charged.",
          );
        }
      }
    },
    [clearCart],
  );

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") || params.get("trxref");
    referenceRef.current = reference;
    if (!reference) {
      setStatus("error");
      setMessage("No payment reference found. Please return to checkout and try again.");
      return;
    }
    attemptFinalize(reference, 0);
  }, [attemptFinalize]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md text-center space-y-6">
        {status === "verifying" && (
          <div className="space-y-4">
            <Loader2 className="h-12 w-12 text-brand mx-auto animate-spin" />
            <h1 className="text-xl font-semibold text-foreground">Confirming Payment</h1>
            <p className="text-sm text-muted-foreground">
              {message || "Verifying your payment with Paystack..."}
            </p>
            <p className="text-xs text-muted-foreground">
              This usually takes a few seconds. Please do not close this page.
            </p>
          </div>
        )}

        {status === "pending" && (
          <div className="space-y-4">
            <Loader2 className="h-12 w-12 text-orange-500 mx-auto animate-spin" />
            <h1 className="text-xl font-semibold text-foreground">Payment Processing</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
              <p className="text-xs text-orange-700 dark:text-orange-400">
                Please wait while we confirm your payment. You will be redirected automatically.
              </p>
            </div>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <h1 className="text-xl font-semibold text-foreground">Payment Confirmed!</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <AlertCircle
              className={`mx-auto h-12 w-12 ${failureKind === "declined" ? "text-orange-500" : "text-red-500"}`}
            />
            <h1 className="text-xl font-semibold text-foreground">
              {failureKind === "declined" ? "Payment Declined" : "Payment Issue"}
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
            <div className="flex flex-col gap-3 pt-4">
              {failureKind === "declined" ? (
                <a
                  href="/checkout"
                  className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition"
                >
                  Return to checkout and retry
                </a>
              ) : (
                <button
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition"
                >
                  Try Again
                </button>
              )}
              <a
                href="/"
                className="text-sm text-muted-foreground hover:text-foreground transition"
              >
                Return to store
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
