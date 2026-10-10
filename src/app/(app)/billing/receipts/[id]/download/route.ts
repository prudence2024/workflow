import { redirect } from "next/navigation";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { getVerifiedPaymentForWorkspace, toReceiptPaymentInput } from "@/lib/payments";
import { receiptDataFromPayment, receiptFilename, renderReceiptPdf } from "@/lib/receipts";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user);
  if (!org) redirect("/onboarding");
  const { id } = await params;
  const payment = await getVerifiedPaymentForWorkspace(user, org.orgId, id);
  if (!payment) return new Response("Receipt not found", { status: 404 });
  const data = receiptDataFromPayment(toReceiptPaymentInput(payment));
  return new Response(renderReceiptPdf(data) as unknown as BodyInit, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${receiptFilename(data.transactionReference)}"`, "cache-control": "private, no-store" } });
}
