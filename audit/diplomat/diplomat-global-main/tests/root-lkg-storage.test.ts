import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Storage-safety contracts for the root last-known-good cache
 * (src/routes/__root.tsx). The public storefront must survive every hostile
 * storage condition without crashing: unavailable storage, corrupted JSON,
 * wrong cache schema, quota failures and SSR (no window at all).
 *
 * The module keeps module-level state, so each test gets a fresh import.
 */

type StorageBag = Partial<Record<"getItem" | "setItem" | "removeItem", unknown>>;

function fakeStorage(overrides: StorageBag = {}): Storage {
  return {
    getItem: (key: string) => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    ...overrides,
  } as unknown as Storage;
}

/** Fresh module import per test so the in-memory LKG singleton is clean. */
async function freshModule() {
  vi.resetModules();
  return import("../src/routes/__root");
}

function setWindow(storage: unknown | (() => never)): void {
  const w = {} as Record<string, unknown>;
  if (typeof storage === "function") {
    Object.defineProperty(w, "sessionStorage", { get: storage as () => never });
  } else {
    w.sessionStorage = storage;
  }
  (globalThis as Record<string, unknown>).window = w;
}

function clearWindow(): void {
  delete (globalThis as Record<string, unknown>).window;
}

const goodPayload = {
  socialLinks: [],
  siteSettings: { whatsapp_number: "08012345678" },
  categories: [],
};

describe("root LKG cache — storage safety contracts", () => {
  beforeEach(() => {
    clearWindow();
  });

  it(
    "SSR: no window at all — read returns null and write never throws",
    { timeout: 30_000 },
    async () => {
      const mod = await freshModule();
      expect(mod.readRootSharedLkg()).toBeNull();
      expect(() => mod.writeRootSharedLkg(goodPayload)).not.toThrow();
      // Memory value still served afterwards.
      expect(mod.readRootSharedLkg()).toEqual(goodPayload);
    },
  );

  it("storage getter itself throws (browser security denial) — no crash", async () => {
    setWindow(() => {
      throw new Error("SecurityError: denied");
    });
    const mod = await freshModule();
    expect(mod.readRootSharedLkg()).toBeNull();
    expect(() => mod.writeRootSharedLkg(goodPayload)).not.toThrow();
    expect(mod.readRootSharedLkg()).toEqual(goodPayload);
  });

  it("sessionStorage is undefined — no crash, memory fallback works", async () => {
    setWindow(undefined);
    const mod = await freshModule();
    expect(mod.readRootSharedLkg()).toBeNull();
    expect(() => mod.writeRootSharedLkg(goodPayload)).not.toThrow();
    expect(mod.readRootSharedLkg()).toEqual(goodPayload);
  });

  it("corrupted JSON is safely discarded", async () => {
    const backing = new Map<string, string>([["dg-root-shared-lkg-v1", "{not-json!!"]]);
    setWindow(
      fakeStorage({
        getItem: (key: string) => backing.get(key) ?? null,
        setItem: (key: string, value: string) => void backing.set(key, value),
      }),
    );
    const mod = await freshModule();
    expect(mod.readRootSharedLkg()).toBeNull();
  });

  it("wrong cache schema (missing socialLinks array) is discarded — poisoned entries never render", async () => {
    const poisoned = JSON.stringify({ socialLinks: "not-an-array", siteSettings: {} });
    setWindow(
      fakeStorage({
        getItem: () => poisoned,
        setItem: () => undefined,
      }),
    );
    const mod = await freshModule();
    expect(mod.readRootSharedLkg()).toBeNull();
  });

  it("quota failure on write keeps the in-memory value working", async () => {
    setWindow(
      fakeStorage({
        getItem: () => null,
        setItem: () => {
          throw new DOMException("quota", "QuotaExceededError");
        },
      }),
    );
    const mod = await freshModule();
    expect(() => mod.writeRootSharedLkg(goodPayload)).not.toThrow();
    expect(mod.readRootSharedLkg()).toEqual(goodPayload);
  });

  it("happy path: written value round-trips through storage", async () => {
    const backing = new Map<string, string>();
    setWindow(
      fakeStorage({
        getItem: (key: string) => backing.get(key) ?? null,
        setItem: (key: string, value: string) => void backing.set(key, value),
      }),
    );
    const mod = await freshModule();
    mod.writeRootSharedLkg(goodPayload);
    // Force a memory-miss to prove storage was actually used.
    vi.resetModules();
    const mod2 = await import("../src/routes/__root");
    // New module instance has empty memory but same mocked window storage.
    expect(mod2.readRootSharedLkg()).toEqual(goodPayload);
  });
});
