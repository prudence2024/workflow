"use client";

import { Button, LinkButton } from "@/components/ui/Button";

export function ReceiptActions({ downloadHref }: { downloadHref: string }) {
  return <div className="receipt-no-print flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => window.print()}>Print receipt</Button><LinkButton href={downloadHref}>Download receipt</LinkButton></div>;
}
