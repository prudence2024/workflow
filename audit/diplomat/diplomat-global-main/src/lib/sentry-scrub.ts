import type { ErrorEvent } from "@sentry/tanstackstart-react";

/**
 * Exact stack markers of an expected Node HTTP client-socket cancellation:
 * the client closed the connection mid-request (navigation, reload,
 * connection drop). Stable across Node 18/20/22 — verified against the
 * runtime event this classification was written for.
 */
const EXPECTED_SOCKET_ABORT_STACK_MARKERS = [
  "abortIncoming",
  "socketOnClose",
  "node:_http_server",
  "node:_http_incoming",
];

export function scrubSentryEvent(event: ErrorEvent): ErrorEvent | null {
  if (event.request) {
    delete event.request.headers;
    delete event.request.cookies;
    delete event.request.data;
    if (event.request.url) {
      try {
        const url = new URL(event.request.url, "https://redacted.invalid");
        event.request.url = `${url.origin === "https://redacted.invalid" ? "" : url.origin}${url.pathname}`;
      } catch {
        event.request.url = event.request.url.split(/[?#]/, 1)[0];
      }
    }
  }
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
  }

  const firstException = event.exception?.values?.[0];
  const message = firstException?.value ?? "";
  const stack = firstException?.stacktrace?.frames?.map((f) => f.filename ?? "").join("\n") ?? "";

  // Narrow classification: only the proven expected transport-cancellation
  // signature is dropped. Any other abort (fetch aborts, timeouts, unknown
  // stacks, or genuine application aborts) remains captured.
  const isNodeSocketAbort =
    /aborted$/i.test(message.trim()) &&
    stack.length > 0 &&
    EXPECTED_SOCKET_ABORT_STACK_MARKERS.some((marker) => stack.includes(marker));

  if (isNodeSocketAbort) {
    return null;
  }
  return event;
}
