import type { PaymentSuccessOrderSummary } from "./payment-client-state";

export type SuccessOrder = Omit<PaymentSuccessOrderSummary, "paymentStatus"> & {
  paymentStatus: string;
  receiptToken?: string;
};
export interface PaymentSuccessState {
  payment: "checking" | "pending" | "paid" | "failed";
  /** Provider-verified failure taxonomy; null = transport/verification ambiguity. */
  failureKind: "declined" | "failed" | null;
  receipt: "idle" | "loading" | "ready" | "pending" | "error";
  order: SuccessOrder | null;
  message: string;
}
export const initialPaymentSuccessState: PaymentSuccessState = {
  payment: "checking",
  failureKind: null,
  receipt: "idle",
  order: null,
  message: "",
};
export type PaymentSuccessEvent =
  | { type: "paid"; order: SuccessOrder; receipt: "ready" | "pending" | "error" }
  | {
      type: "payment";
      status: "checking" | "pending" | "failed";
      message: string;
      failureKind?: "declined" | "failed" | null;
    }
  | { type: "receipt"; status: "loading" | "pending" | "error" };

export function paymentSuccessReducer(
  state: PaymentSuccessState,
  event: PaymentSuccessEvent,
): PaymentSuccessState {
  if (event.type === "paid")
    return {
      payment: "paid",
      failureKind: null,
      receipt: event.receipt,
      order: event.order,
      message: "",
    };
  if (event.type === "receipt") return { ...state, receipt: event.status };
  // Paid is monotonic within this payment's mounted page, including late responses.
  if (state.payment === "paid") return state;
  return {
    ...state,
    payment: event.status,
    failureKind: event.failureKind ?? (event.status === "failed" ? null : state.failureKind),
    message: event.message,
  };
}
