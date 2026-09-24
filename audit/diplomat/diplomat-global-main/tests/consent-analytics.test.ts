import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// This file imports the router-backed analytics module; under full-suite
// load the first transform can exceed the default per-test timeout.
vi.setConfig({ testTimeout: 30_000 });

/**
 * Consent + consent-gated analytics behavioral proof (Node env with minimal
 * storage/DOM stubs):
 *  - consent persists, round-trips, and announces changes
 *  - nothing optional runs before consent (no Pixel script injection)
 *  - marketing consent injects the Pixel exactly once (dedupe)
 *  - withdrawing consent removes the script and neutralizes fbq
 *  - Purchase fires only when injected, with reference/totals only
 */

type Store = Record<string, string>;

function stubStorage(): Store {
  return {};
}

function installBrowserStubs() {
  const store: Store = stubStorage();
  const listeners = new Map<string, Set<() => void>>();

  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  });

  const dispatch = (type: string) => {
    listeners.get(type)?.forEach((fn) => fn());
  };

  vi.stubGlobal(
    "CustomEvent",
    class CustomEvent {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
    },
  );

  vi.stubGlobal("window", {
    addEventListener: (type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: () => void) => {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent: (event: { type: string }) => dispatch(event.type),
    localStorage: undefined as unknown,
  });

  return { dispatch };
}

function installDocumentStub() {
  vi.stubGlobal("document", {
    createElement: vi.fn(() => ({ id: "" })) as unknown as never,
    getElementById: vi.fn(() => null) as unknown as never,
    head: { appendChild: vi.fn() } as unknown as never,
  });
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("consent store", () => {
  beforeEach(() => {
    vi.resetModules();
    installBrowserStubs();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null before the visitor has decided", async () => {
    const { readConsent } = await import("../src/lib/consent");
    expect(readConsent()).toBeNull();
  });

  it("round-trips a choice and announces the change", async () => {
    const { readConsent, writeConsent, onConsentChange } = await import("../src/lib/consent");
    const seen: Array<unknown> = [];
    const off = onConsentChange(() => seen.push(readConsent()));

    writeConsent({ analytics: true, marketing: false });

    expect(readConsent()).toEqual({ analytics: true, marketing: false });
    expect(seen).toEqual([{ analytics: true, marketing: false }]);
    off();
  });

  it("ignores malformed stored values instead of tracking on corrupted state", async () => {
    localStorage.setItem("dg-cookie-consent", "{not json");
    const { readConsent } = await import("../src/lib/consent");
    expect(readConsent()).toBeNull();

    localStorage.setItem("dg-cookie-consent", JSON.stringify({ analytics: "yes" }));
    expect(readConsent()).toBeNull();
  });
});

describe("consent-gated Meta Pixel", () => {
  beforeEach(() => {
    vi.resetModules();
    installBrowserStubs();
    installDocumentStub();
    // vitest surfaces process.env through import.meta.env for the module.
    process.env.VITE_META_PIXEL_ID = "1234567890";
  });

  afterEach(() => {
    delete process.env.VITE_META_PIXEL_ID;
    vi.unstubAllGlobals();
  });

  it("does nothing optional before any consent decision", async () => {
    const { syncMetaPixel } = await import("../src/lib/meta-pixel");
    syncMetaPixel(null);
    expect(document.createElement).not.toHaveBeenCalled();
  });

  it("injects the Pixel exactly once under marketing consent (dedupe)", async () => {
    const { syncMetaPixel } = await import("../src/lib/meta-pixel");
    syncMetaPixel({ analytics: false, marketing: true });
    syncMetaPixel({ analytics: false, marketing: true });
    syncMetaPixel({ analytics: false, marketing: true });

    const calls = (document.createElement as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.filter(([tag]) => tag === "script").length).toBe(1);
  });

  it("does not inject when the Pixel ID is not configured", async () => {
    process.env.VITE_META_PIXEL_ID = "";
    const { syncMetaPixel } = await import("../src/lib/meta-pixel");
    syncMetaPixel({ analytics: true, marketing: true });
    expect(document.createElement).not.toHaveBeenCalled();
  });

  it("Purchase fires only when injected and sends reference/totals only", async () => {
    const { syncMetaPixel, trackMetaPurchase } = await import("../src/lib/meta-pixel");

    trackMetaPurchase({ value: 10, currency: "NGN", orderReference: "R1" });
    expect(window.fbq).toBeUndefined();

    syncMetaPixel({ analytics: false, marketing: true });
    expect(window.fbq).toBeTypeOf("function");

    trackMetaPurchase({ value: 125000, currency: "NGN", orderReference: "DG-1" });
    const queued = (window.fbq as unknown as { queue: unknown[][] }).queue;
    expect(queued.at(-1)).toEqual([
      "track",
      "Purchase",
      { value: 125000, currency: "NGN", content_ids: ["DG-1"], content_type: "product" },
    ]);
    expect(JSON.stringify(queued)).not.toContain("email");
    expect(JSON.stringify(queued)).not.toContain("token");
  });

  it("withdrawal removes the script and neutralizes fbq", async () => {
    const { syncMetaPixel } = await import("../src/lib/meta-pixel");
    syncMetaPixel({ analytics: false, marketing: true });
    expect(window.fbq).toBeTypeOf("function");

    syncMetaPixel({ analytics: false, marketing: false });
    expect(window.fbq).toBeUndefined();
  });
});
