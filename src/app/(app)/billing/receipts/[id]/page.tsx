import { notFound, redirect } from "next/navigation";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { getVerifiedPaymentForWorkspace, toReceiptPaymentInput } from "@/lib/payments";
import { receiptDataFromPayment } from "@/lib/receipts";
import { ReceiptDocument } from "@/components/billing/ReceiptDocument";
import { ReceiptActions } from "@/components/billing/ReceiptActions";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user);
  if (!org) redirect("/onboarding");
  const { id } = await params;
  const payment = await getVerifiedPaymentForWorkspace(user, org.orgId, id);
  if (!payment) notFound();
  const data = receiptDataFromPayment(toReceiptPaymentInput(payment));
  return <div className="space-y-4"><div className="receipt-no-print flex items-center justify-between gap-4"><div><h1 className="font-display text-[22px] font-semibold text-[var(--color-ink)]">Receipt</h1><p className="text-sm text-[var(--color-muted)]">{data.receiptNumber}</p></div><ReceiptActions downloadHref={`/billing/receipts/${data.id}/download`} /></div><ReceiptDocument data={data} /></div>;
}
