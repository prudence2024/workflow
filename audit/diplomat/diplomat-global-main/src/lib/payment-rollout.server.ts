import "@tanstack/react-start/server-only";
import { FINANCIAL_FINALIZATION_VERSION } from "./checkout-quote";

/** Creation gate only. Existing v1 attempts must never fall back to legacy writes. */
export function financialFinalizationMetadata() {
  return process.env.PAYMENT_FINANCIAL_FINALIZATION_V1_ENABLED === "true"
    ? { financial_finalization_version: FINANCIAL_FINALIZATION_VERSION }
    : {};
}
