import { NextResponse } from "next/server";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { convergeVerifiedPayment, getPaymentForWorkspace, PaymentProviderUnavailableError, PaymentVerificationError, verifyPaystackReference } from "@/lib/payments";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const org = await getCurrentOrg(user);
  if (!org) return NextResponse.json({ error: "Workspace required" }, { status: 403 });
  const body = await request.json().catch(() => null) as { paymentId?: string; reference?: string } | null;
  if (!body?.paymentId || !body.reference) return NextResponse.json({ error: "Payment verification details are required" }, { status: 400 });
  const payment = await getPaymentForWorkspace(user, org.orgId, body.paymentId);
  if (!payment || payment.provider !== "paystack" || payment.providerReference !== body.reference || payment.status !== "pending") return NextResponse.json({ error: "Payment verification could not be started" }, { status: 400 });
  try {
    const verified = await verifyPaystackReference({ reference: body.reference, expectedAmount: payment.amount, expectedCurrency: payment.currency });
    const result = await convergeVerifiedPayment({ paymentId: payment.id, ...verified });
    return NextResponse.json({ status: result.status, receiptId: result.id });
  } catch (error) {
    if (error instanceof PaymentProviderUnavailableError) return NextResponse.json({ error: "Payment provider is not available" }, { status: 503 });
    if (error instanceof PaymentVerificationError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: "Payment verification failed" }, { status: 502 });
  }
}
