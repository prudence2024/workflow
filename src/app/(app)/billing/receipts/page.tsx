import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { listPaymentsForWorkspace } from "@/lib/payments";
import { formatReceiptAmount, formatReceiptDate } from "@/lib/receipts";
import { Card, CardBody, CardHeader } from "@/components/ui/Surfaces";

export const dynamic = "force-dynamic";

export default async function ReceiptsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user);
  if (!org) redirect("/onboarding");
  const payments = await listPaymentsForWorkspace(user, org.orgId);
  return <div className="space-y-5"><div><h1 className="font-display text-[22px] font-semibold text-[var(--color-ink)]">Payment history</h1><p className="mt-0.5 text-[13.5px] text-[var(--color-muted)]">Verified payments and receipts for this workspace.</p></div><Card><CardHeader title="Payments" /><CardBody>{payments.length === 0 ? <p className="text-sm text-[var(--color-muted)]">No payments yet. Free workspaces do not generate paid receipts.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-muted)]"><th className="px-2 py-3">Date</th><th className="px-2 py-3">Plan</th><th className="px-2 py-3">Amount</th><th className="px-2 py-3">Status</th><th className="px-2 py-3" /></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id} className="border-b border-[var(--color-border)] last:border-0"><td className="px-2 py-3">{formatReceiptDate(payment.createdAt.toISOString())}</td><td className="px-2 py-3 capitalize">{payment.planKey}</td><td className="px-2 py-3">{formatReceiptAmount(payment.amount, payment.currency)}</td><td className="px-2 py-3 capitalize">{payment.status}</td><td className="px-2 py-3 text-right">{payment.status === "verified" ? <Link className="font-medium text-[var(--color-brand)] hover:underline" href={`/billing/receipts/${payment.id}`}>View receipt</Link> : <span className="text-[var(--color-muted)]">Not available</span>}</td></tr>)}</tbody></table></div>}</CardBody></Card></div>;
}
