import type { ReceiptData } from "@/lib/receipts";
import { receiptRows } from "@/lib/receipts";

export function ReceiptDocument({ data }: { data: ReceiptData }) {
  return (
    <article className="receipt-print-page mx-auto max-w-3xl rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-sm)] sm:p-10">
      <div className="flex items-start justify-between gap-6">
        <div><p className="font-display text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Workflow</p><p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">Verified payment receipt</p><h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)]">{data.planName} plan</h1></div>
        <span className="rounded-full bg-[var(--color-success-soft)] px-3 py-1.5 text-xs font-semibold tracking-[0.08em] text-[var(--color-success)]">PAID · VERIFIED</span>
      </div>
      <dl className="mt-8 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">{receiptRows(data).map(([label, value]) => <div key={label} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:justify-between sm:gap-6"><dt className="text-[var(--color-muted)]">{label}</dt><dd className="break-words font-medium text-[var(--color-ink)] sm:text-right">{value}</dd></div>)}</dl>
      <div className="mt-7 flex items-baseline justify-between gap-6 border-t-2 border-[var(--color-ink)] pt-5"><span className="text-lg text-[var(--color-ink)]">Total paid</span><strong className="text-2xl text-[var(--color-ink)]">{data.amount}</strong></div>
      <p className="mt-8 text-xs leading-5 text-[var(--color-muted)]">Generated from a server-verified {data.provider} payment. No payment instrument details are included.</p>
    </article>
  );
}
