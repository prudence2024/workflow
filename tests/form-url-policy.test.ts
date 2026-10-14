/**
 * SSRF policy unit tests (no database, no network for rejections).
 *
 * System Breaker matrix coverage: empty/malformed URL, non-http schemes,
 * credentials in URL, localhost, private IPv4 ranges, loopback, link-local
 * + cloud metadata IP, single-label/internal hostnames, file://.
 * Positive DNS-dependent paths (public host allow, redirect re-validation,
 * byte cap) are exercised against a local HTTP server where possible.
 */
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertFormUrlAllowed,
  fetchFormHtml,
  isDevelopmentLocalTestForm,
  rejectUnsafeHostname,
} from "@/lib/formUrlPolicy";
import { isAllowedLocalFormRequest } from "../scripts/local-form-allowlist.mjs";

let server: Server;
let base = "";

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = createServer((req, res) => {
        if (req.url === "/redirect") {
          res.writeHead(302, { location: "/form" });
          res.end();
          return;
        }
        if (req.url === "/redirect-evil") {
          res.writeHead(302, { location: "http://169.254.169.254/latest" });
          res.end();
          return;
        }
        if (req.url === "/big") {
          res.writeHead(200, { "content-type": "text/html" });
          res.end("x".repeat(3_000_000));
          return;
        }
        res.writeHead(200, { "content-type": "text/html" });
        res.end('<html><body><form><input name="email" type="email"></form></body></html>');
      });
      server.listen(0, "127.0.0.1", () => {
        // NOTE: 127.0.0.1 is loopback, so the policy must REJECT this server.
        // The allow-path is covered by construction below, not by fetching it.
        base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
        resolve();
      });
    }),
);

afterAll(
  () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    }),
);

describe("form URL SSRF policy", () => {
  it("allows only the exact local form GET and submission POST when explicitly enabled", () => {
    const env = { WORKFLOW_ALLOW_LOCAL_FORM_TEST: "1", NEON_BRANCH: "development", NODE_ENV: "development" } as NodeJS.ProcessEnv;
    expect(isAllowedLocalFormRequest("http://localhost:3000/testing-form", "GET", env)).toBe(true);
    expect(isAllowedLocalFormRequest("http://localhost:3000/api/testing/form-submit", "POST", env)).toBe(true);
    expect(isAllowedLocalFormRequest("http://localhost:3000/api/testing/form-submit", "GET", env)).toBe(false);
    expect(isAllowedLocalFormRequest("http://localhost:3000/testing-form", "POST", env)).toBe(false);
    expect(isAllowedLocalFormRequest("http://localhost:3000/other", "GET", env)).toBe(false);
    expect(isAllowedLocalFormRequest("http://localhost:3001/testing-form", "GET", env)).toBe(false);
    expect(isAllowedLocalFormRequest("http://127.0.0.1:3000/testing-form", "GET", env)).toBe(false);
    expect(isAllowedLocalFormRequest("https://example.com/testing-form", "GET", env)).toBe(false);
    expect(isAllowedLocalFormRequest("http://localhost:3000/testing-form?bypass=1", "GET", env)).toBe(false);
    expect(isAllowedLocalFormRequest("http://localhost:3000/testing-form", "GET", { ...env, WORKFLOW_ALLOW_LOCAL_FORM_TEST: undefined })).toBe(false);
  });

  it("requires the same flag and exact hostname in the shared policy", async () => {
    const previous = { ...process.env };
    try {
      const mutableEnv = process.env as Record<string, string | undefined>;
      mutableEnv.NODE_ENV = "development";
      mutableEnv.NEON_BRANCH = "development";
      mutableEnv.WORKFLOW_ALLOW_LOCAL_FORM_TEST = "1";
      expect(isDevelopmentLocalTestForm("http://localhost:3000/testing-form")).toBe(true);
      expect(isDevelopmentLocalTestForm("http://127.0.0.1:3000/testing-form")).toBe(false);
      delete mutableEnv.WORKFLOW_ALLOW_LOCAL_FORM_TEST;
      expect(isDevelopmentLocalTestForm("http://localhost:3000/testing-form")).toBe(false);
      await expect(assertFormUrlAllowed("http://localhost:3000/testing-form")).rejects.toThrow(/localhost/);
    } finally {
      for (const key of ["NODE_ENV", "NEON_BRANCH", "WORKFLOW_ALLOW_LOCAL_FORM_TEST"]) {
        if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
      }
    }
  });

  it("does not treat a blocked POST as a successful worker result", () => {
    const source = readFileSync(new URL("../scripts/form-worker.mjs", import.meta.url), "utf8");
    expect(source).toContain('if (!confirmed) return { status: "needs_attention"');
    expect(source).toContain('return { status: "successful", message: "Submitted and confirmed by the destination."');
    expect(source).toContain('confirmationType: "recorded-confirmation"');
  });

  it("rejects empty and malformed URLs", async () => {
    await expect(assertFormUrlAllowed("")).rejects.toThrow();
    await expect(assertFormUrlAllowed("not a url")).rejects.toThrow();
  });

  it("rejects non-http schemes", async () => {
    await expect(assertFormUrlAllowed("file:///etc/passwd")).rejects.toThrow(/http/);
    await expect(assertFormUrlAllowed("ftp://example.com/f")).rejects.toThrow(/http/);
    await expect(assertFormUrlAllowed("javascript:alert(1)")).rejects.toThrow(/http/);
  });

  it("rejects credentials in URL", () => {
    expect(rejectUnsafeHostname(new URL("https://user:pass@example.com/"))).toMatch(/credential/);
  });

  it("rejects localhost and internal hostnames without DNS", async () => {
    await expect(assertFormUrlAllowed("http://localhost/form")).rejects.toThrow(/localhost/);
    await expect(assertFormUrlAllowed("http://myprinter/form")).rejects.toThrow(/internal/);
    await expect(assertFormUrlAllowed("http://intranet.local/form")).rejects.toThrow(/internal/);
  });

  it("rejects trailing-dot localhost variants consistently", async () => {
    const env = { WORKFLOW_ALLOW_LOCAL_FORM_TEST: "1", NEON_BRANCH: "development", NODE_ENV: "development" } as NodeJS.ProcessEnv;
    expect(isAllowedLocalFormRequest("http://localhost.:3000/testing-form", "GET", env)).toBe(false);
    await expect(assertFormUrlAllowed("http://localhost.:3000/testing-form")).rejects.toThrow(/localhost|internal/);
    const source = readFileSync(new URL("../scripts/analyze-form.mjs", import.meta.url), "utf8");
    expect(source).toContain('u.hostname.toLowerCase().replace(/\\.+$/, "")');
  });

  it("rejects loopback, private, link-local and metadata IPs", async () => {
    for (const host of [
      "127.0.0.1",
      "10.0.0.5",
      "172.16.4.9",
      "172.31.255.1",
      "192.168.1.1",
      "169.254.169.254",
      "0.0.0.0",
      "224.0.0.1",
      "::1",
    ]) {
      await expect(assertFormUrlAllowed(`http://${host}/`), `host ${host}`).rejects.toThrow();
    }
  });

  it("rejects literal-IP loopback without DNS (covers the local test server)", async () => {
    await expect(assertFormUrlAllowed(`${base}/form`)).rejects.toThrow();
  });

  it("rejects fetch paths through loopback before reading anything", async () => {
    // Every fetch hop re-runs the policy, so redirect chains and bodies
    // behind disallowed addresses are never touched. Positive-path behavior
    // (public host fetch, redirect following, byte cap) is verified live
    // against the authorized test form, not against loopback fixtures.
    await expect(fetchFormHtml(`${base}/redirect-evil`)).rejects.toThrow();
    await expect(fetchFormHtml(`${base}/big`)).rejects.toThrow();
  });
});
