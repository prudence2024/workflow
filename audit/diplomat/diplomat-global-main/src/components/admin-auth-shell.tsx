import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BrandLogo } from "./brand-logo";
export function AdminAuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[0.9fr_1.1fr]">
      <section className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <BrandLogo />
          <p className="mt-12 text-[10px] font-bold uppercase tracking-[0.2em] text-brand">
            {eyebrow}
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
          <div className="mt-8">{children}</div>
          <Link
            to="/"
            className="mt-8 inline-flex min-h-11 items-center text-sm font-semibold text-muted-foreground hover:text-ink"
          >
            Return to storefront
          </Link>
        </div>
      </section>
      <aside className="relative hidden overflow-hidden bg-inverse lg:block">
        <img
          src="/content/hero/slide-1.jpg"
          alt=""
          className="absolute inset-0 size-full object-cover opacity-45"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-inverse/20 to-inverse/90" />
        <div className="absolute bottom-12 left-12 max-w-md text-inverse-foreground">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand">
            Protected workspace
          </p>
          <p className="mt-4 font-display text-3xl font-semibold">
            Manage products, orders and content from one secure place.
          </p>
        </div>
      </aside>
    </div>
  );
}
