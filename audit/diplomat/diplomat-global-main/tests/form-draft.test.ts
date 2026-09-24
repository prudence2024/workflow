import { describe, expect, it } from "vitest";
import {
  clearFormDraft,
  readFormDraft,
  sanitizeFormDraft,
  writeFormDraft,
  type FormDraftStorage,
} from "../src/lib/form-draft";

/**
 * Minimal sessionStorage stand-in: the storage semantics are pure functions
 * over this exact interface, so the allowlist/sanitize contract is verified
 * without a DOM.
 */
function memoryStorage(): FormDraftStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const FIELDS = ["name", "email", "message", "consent"] as const;

describe("form draft allowlist sanitization", () => {
  it("drops unknown keys and truncates overlong values", () => {
    const sanitized = sanitizeFormDraft(
      {
        name: "Ada",
        card_number: "4111111111111111",
        cvv: "123",
        otp: "000000",
        password: "hunter2",
        authorization_url: "https://pay.example",
        message: "x".repeat(500),
        consent: true,
      },
      FIELDS,
    );
    expect(sanitized).toEqual({ name: "Ada", message: "x".repeat(240), consent: true });
  });

  it("keeps only string and boolean values, ignoring others", () => {
    const sanitized = sanitizeFormDraft({ name: 123, consent: "yes", email: "a@b.co" }, [
      "name",
      "consent",
      "email",
    ] as const);
    expect(sanitized).toEqual({ consent: "yes", email: "a@b.co" });
  });

  it("returns an empty object for non-object input", () => {
    expect(sanitizeFormDraft("junk", FIELDS)).toEqual({});
    expect(sanitizeFormDraft(null, FIELDS)).toEqual({});
    expect(sanitizeFormDraft(["x"], FIELDS)).toEqual({});
  });
});

describe("form draft storage semantics", () => {
  it("restores only allowlisted values from storage", () => {
    const storage = memoryStorage();
    storage.map.set("dg-draft:test", JSON.stringify({ name: "Ada", otp: "9", password: "x" }));
    const values = readFormDraft(storage, "dg-draft:test", FIELDS);
    expect(values).toEqual({ name: "Ada" });
  });

  it("returns empty values for absent, corrupt, or unavailable storage", () => {
    const storage = memoryStorage();
    expect(readFormDraft(storage, "dg-draft:test", FIELDS)).toEqual({});
    storage.map.set("dg-draft:test", "{not json");
    expect(readFormDraft(storage, "dg-draft:test", FIELDS)).toEqual({});
    expect(readFormDraft(null, "dg-draft:test", FIELDS)).toEqual({});
  });

  it("writes sanitized values and persists nothing sensitive", () => {
    const storage = memoryStorage();
    writeFormDraft(storage, "dg-draft:test", { name: "Ada", cvv: "123" }, FIELDS);
    const stored = JSON.parse(storage.map.get("dg-draft:test")!);
    expect(stored).toEqual({ name: "Ada" });
  });

  it("empty drafts are removed instead of stored", () => {
    const storage = memoryStorage();
    storage.map.set("dg-draft:test", "stale");
    writeFormDraft(storage, "dg-draft:test", { name: "", consent: false }, FIELDS);
    expect(storage.map.has("dg-draft:test")).toBe(false);
  });

  it("clear removes the stored draft", () => {
    const storage = memoryStorage();
    writeFormDraft(storage, "dg-draft:test", { name: "Ada" }, FIELDS);
    clearFormDraft(storage, "dg-draft:test");
    expect(storage.map.has("dg-draft:test")).toBe(false);
    expect(() => clearFormDraft(null, "dg-draft:test")).not.toThrow();
  });

  it("survives storage failures without throwing", () => {
    const throwing: FormDraftStorage = {
      getItem: () => {
        throw new Error("quota");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => writeFormDraft(throwing, "dg-draft:test", { name: "Ada" }, FIELDS)).not.toThrow();
    expect(readFormDraft(throwing, "dg-draft:test", FIELDS)).toEqual({});
    expect(() => clearFormDraft(throwing, "dg-draft:test")).not.toThrow();
  });
});
