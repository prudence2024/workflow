import type { ReactNode } from "react";
import { MarketingNav } from "@/components/marketing/Nav";
import { MarketingFooter } from "@/components/marketing/Footer";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <MarketingNav />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}
