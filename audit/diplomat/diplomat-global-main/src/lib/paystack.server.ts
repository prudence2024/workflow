import crypto from "crypto";
import "@tanstack/react-start/server-only";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY?.trim();
const PAYSTACK_BASE_URL = "https://api.paystack.co";

export interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    id: number;
    domain: string;
    amount: number;
    currency: string;
    source: string;
    reason: string | null;
    status: string;
    reference: string;
    metadata: any;
    created_at: string;
    channel: string;
    gateway_response: string;
    paid_at: string;
    customer: { email: string; customer_code: string };
    authorization: any;
  };
}

function getHeaders() {
  if (!PAYSTACK_SECRET_KEY) throw new Error("PAYSTACK_SECRET_KEY not configured");
  return {
    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  };
}

/**
 * Initialize a Paystack transaction.
 * Amount is in Naira — Paystack expects kobo, so multiply by 100.
 */
export async function initializeTransaction(input: {
  email: string;
  amount: number; // In Naira
  reference: string;
  callback_url?: string;
  metadata?: Record<string, any>;
}): Promise<PaystackInitializeResponse> {
  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      email: input.email,
      amount: Math.round(input.amount * 100), // Convert Naira to kobo
      reference: input.reference,
      callback_url: input.callback_url,
      metadata: input.metadata || {},
    }),
  });
  const data = await res.json();
  if (!data.status) {
    throw new Error(`Paystack initialization failed: ${data.message}`);
  }
  return data;
}

/**
 * Verify a Paystack transaction by reference.
 */
export async function verifyTransaction(reference: string): Promise<PaystackVerifyResponse> {
  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${reference}`, {
    method: "GET",
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!data.status) {
    throw new Error(`Paystack verification failed: ${data.message}`);
  }
  return data;
}

/**
 * Validate Paystack webhook signature (HMAC-SHA512).
 */
export function validateWebhookSignature(payload: string, signature: string): boolean {
  // Paystack uses PAYSTACK_SECRET_KEY for HMAC-SHA512 webhook verification.
  // There is no separate webhook secret in Paystack's architecture.
  if (!PAYSTACK_SECRET_KEY) return false;

  const hmac = crypto.createHmac("sha512", PAYSTACK_SECRET_KEY);
  hmac.update(payload);
  const digest = hmac.digest("hex");
  return digest === signature;
}

export function isPaystackConfigured(): boolean {
  return Boolean(PAYSTACK_SECRET_KEY);
}
