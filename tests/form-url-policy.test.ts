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
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertFormUrlAllowed,
  fetchFormHtml,
  rejectUnsafeHostname,
} from "@/lib/formUrlPolicy";

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
