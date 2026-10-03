import "server-only";
import { lookup as dnsLookup } from "node:dns";
import { isIP } from "node:net";
import { promisify } from "node:util";

const lookup = promisify(dnsLookup);

/**
 * SSRF-safe form URL policy (security skill: fail closed, validate redirects).
 *
 * Every form fetch or browser navigation MUST pass through
 * `assertFormUrlAllowed()` first — including each redirect hop. Rejected:
 * non-http(s) schemes, credentials in URL, localhost / loopback / private /
 * link-local / multicast / unspecified addresses, cloud metadata endpoints,
 * single-label internal hostnames.
 */

export const FORM_FETCH_TIMEOUT_MS = 10_000;
export const FORM_FETCH_MAX_BYTES = 2_000_000;
export const FORM_FETCH_MAX_REDIRECTS = 3;

const METADATA_IPS = new Set(["169.254.169.254", "fd00:ec2::254", "100.100.100.200"]);

function ipv4Blocked(num: number): boolean {
  const b0 = (num >>> 24) & 0xff;
  const b1 = (num >>> 16) & 0xff;
  if (b0 === 10) return true; // 10/8
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true; // 172.16/12
  if (b0 === 192 && b1 === 168) return true; // 192.168/16
  if (b0 === 127) return true; // loopback
  if (b0 === 169 && b1 === 254) return true; // link-local (incl. cloud metadata)
  if (b0 === 0) return true; // unspecified / current network
  if (b0 >= 224) return true; // multicast + reserved
  // Carrier-grade NAT 100.64/10 is routable but never a form host.
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;
  return false;
}

function ipv6Blocked(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fec0:") || lower.startsWith("fc") || lower.startsWith("fd"))
    return true; // link-local, site-local, unique-local
  if (lower.startsWith("ff")) return true; // multicast
  if (METADATA_IPS.has(lower)) return true;
  return false;
}

function addressBlocked(ip: string): boolean {
  if (METADATA_IPS.has(ip)) return true;
  const family = isIP(ip);
  if (family === 4) {
    const num =
      ip
        .split(".")
        .reduce((acc, part) => acc * 256 + Number(part), 0) >>> 0;
    return ipv4Blocked(num);
  }
  if (family === 6) return ipv6Blocked(ip);
  return true; // unparseable is not trusted
}

/** Hostname checks that need no DNS: localhost, single-label, credentials. */
export function rejectUnsafeHostname(parsed: URL): string | null {
  if (parsed.username !== "" || parsed.password !== "") {
    return "credentials in URL are not allowed";
  }
  const host = parsed.hostname.toLowerCase().replace(/\.+$/, "");
  if (host === "localhost") return "localhost is not allowed";
  if (host !== "localhost" && !host.includes(".") && isIP(host) === 0) {
    return "internal hostnames are not allowed";
  }
  if (host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    return "internal hostnames are not allowed";
  }
  return null;
}

/**
 * Validate one URL (the original or a redirect target). Resolves DNS and
 * rejects blocked addresses, including cloud metadata endpoints reached
 * through a public hostname.
 */
export async function assertFormUrlAllowed(raw: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Enter a valid, authorized form URL starting with http(s)://");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) form URLs are allowed");
  }
  const hostnameProblem = rejectUnsafeHostname(parsed);
  if (hostnameProblem) throw new Error(hostnameProblem);

  // Literal-IP hosts are checked without DNS.
  if (isIP(parsed.hostname) !== 0) {
    if (addressBlocked(parsed.hostname)) {
      throw new Error("That address is not allowed for form analysis");
    }
    return parsed;
  }

  let addresses: string[];
  try {
    addresses = (await lookup(parsed.hostname, { all: true })).map((r) => r.address);
  } catch {
    throw new Error("Could not resolve that form host");
  }
  if (addresses.length === 0 || addresses.some(addressBlocked)) {
    throw new Error("That host resolves to an address that is not allowed for form analysis");
  }
  return parsed;
}

/**
 * Fetch with redirect re-validation, byte cap and timeout. Returns the final
 * URL and the body text. Never follows more than FORM_FETCH_MAX_REDIRECTS.
 */
export async function fetchFormHtml(rawUrl: string): Promise<{ finalUrl: string; html: string }> {
  let current = String(rawUrl);
  for (let hop = 0; hop <= FORM_FETCH_MAX_REDIRECTS; hop += 1) {
    const parsed = await assertFormUrlAllowed(current);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FORM_FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(parsed.toString(), {
        signal: controller.signal,
        redirect: "manual",
        headers: { "User-Agent": "Workflow-FormAnalyzer/1.0" },
      });
    } catch (err) {
      clearTimeout(timeout);
      throw new Error(err instanceof Error && err.name === "AbortError" ? "Request timed out" : "Could not reach that URL");
    } finally {
      clearTimeout(timeout);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error("Could not fetch form (redirect without location)");
      if (hop === FORM_FETCH_MAX_REDIRECTS) throw new Error("Too many redirects");
      current = new URL(location, parsed.toString()).toString();
      await res.arrayBuffer().catch(() => null);
      continue;
    }
    if (!res.ok) throw new Error(`Could not fetch form (HTTP ${res.status})`);

    const reader = res.body?.getReader();
    if (!reader) throw new Error("Could not read that form page");
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > FORM_FETCH_MAX_BYTES) {
        await reader.cancel().catch(() => null);
        throw new Error("That form page is too large to analyze");
      }
      chunks.push(value);
    }
    const html = Buffer.concat(chunks).toString("utf8");
    return { finalUrl: parsed.toString(), html };
  }
  throw new Error("Too many redirects");
}
