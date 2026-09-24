import { CreditCard, Headphones, ShieldCheck, Truck } from "lucide-react";

const ITEMS = [
  {
    Icon: ShieldCheck,
    title: "12-month warranty",
    body: "Local coverage on every hardware unit.",
  },
  {
    Icon: CreditCard,
    title: "Secure payment",
    body: "Protected card, transfer and USSD checkout.",
  },
  {
    Icon: Truck,
    title: "Nationwide delivery",
    body: "Clear delivery updates across Nigeria.",
  },
  {
    Icon: Headphones,
    title: "Direct support",
    body: "Practical help from a real product specialist.",
  },
] as const;

/** Seamless horizontal marquee of trust signals. Home + product pages only. */
export function TrustBadges() {
  const doubled = [...ITEMS, ...ITEMS];
  return (
    <section
      aria-label="Why shop with Diplomat Global"
      className="border-y border-border/60 bg-surface"
    >
      <div className="marquee-pause relative overflow-hidden py-10">
        <div className="animate-marquee flex w-max items-center gap-14 pr-14">
          {doubled.map(({ Icon, title, body }, index) => (
            <div key={index} className="flex w-72 shrink-0 items-center gap-4">
              <div className="grid size-11 shrink-0 place-items-center rounded-full bg-brand/10 text-brand ring-1 ring-brand/20">
                <Icon className="size-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-surface to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-surface to-transparent" />
      </div>
    </section>
  );
}
