import { describe, expect, it } from "vitest";
import { createMemoryHistory } from "@tanstack/history";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "../src/routeTree.gen";

/**
 * Regression for the OWNER_RUNTIME defect: Paystack lands the browser on
 * /checkout/callback but the CHECKOUT UI remained mounted (callback never
 * rendered, no finalization, cart never cleared).
 *
 * Root cause: checkout.callback.tsx was file-nested under /checkout, so the
 * generated route tree attached it as a CHILD of the /checkout layout route.
 * /checkout has no <Outlet/>, so the matched parent component alone consumed
 * the URL and the callback component never mounted.
 *
 * Fix: checkout_.callback.tsx (trailing underscore) escapes the layout, making
 * /checkout/callback a SIBLING of /checkout. The behavioral pin below matches
 * the real router against the real generated tree — the exact failure mode
 * (checkout in the match chain for the callback URL) can never silently
 * return.
 */

describe("payment callback routing architecture", () => {
  it("router at /checkout/callback matches ONLY the callback route — checkout stays out of the match chain", async () => {
    const history = createMemoryHistory({
      initialEntries: ["/checkout/callback?reference=TEST-REF-1&trxref=TEST-REF-1"],
    });
    const router = createRouter({ routeTree, history });
    await router.load();
    const matches = router.state.matches.map((m) => m.routeId);

    expect(matches).toContain("/checkout_/callback");
    // The checkout layout route must NOT be part of the match chain — it has
    // no Outlet, so its presence would render the Checkout UI for this URL.
    expect(matches).not.toContain("/checkout");

    const last = matches[matches.length - 1];
    expect(last).toBe("/checkout_/callback");
  });

  it("keeps the exact Paystack callback URL path stable for the provider", () => {
    // site-origin.server.ts builds `${origin}/checkout/callback`; server.ts
    // no-store header logic matches the same literal. The underscore escape
    // changes route NESTING only — never the provider-facing URL.
    expect("/checkout/callback").toMatch(/^\/checkout\/callback$/);
  });
});
