import { describe, expect, it } from "vitest";
import { scrubSentryEvent } from "../src/lib/sentry-scrub";
import type { ErrorEvent } from "@sentry/tanstackstart-react";

function makeEvent(overrides: {
  message?: string;
  stackFilenames?: string[];
  requestUrl?: string;
}): ErrorEvent {
  return {
    exception: {
      values: [
        {
          value: overrides.message ?? "Error: aborted",
          ...(overrides.stackFilenames
            ? {
                stacktrace: {
                  frames: overrides.stackFilenames.map((filename) => ({ filename })),
                },
              }
            : {}),
        },
      ],
    },
    ...(overrides.requestUrl ? { request: { url: overrides.requestUrl } } : {}),
  } as unknown as ErrorEvent;
}

describe("scrubSentryEvent — expected transport cancellation classification", () => {
  it("drops the exact expected Node socket-abort signature", () => {
    const event = makeEvent({
      message: "Error: aborted",
      stackFilenames: [
        "node:internal/errors",
        "node:_http_server",
        "node:_http_incoming",
      ],
      requestUrl: "http://127.0.0.1:4203/assets/link-abc.js?token=secret",
    });
    expect(scrubSentryEvent(event)).toBeNull();
  });

  it("keeps an 'aborted' error without the Node HTTP server stack (genuine application abort)", () => {
    const event = makeEvent({
      message: "Error: aborted",
      stackFilenames: ["src/lib/some-feature.ts"],
    });
    const result = scrubSentryEvent(event);
    expect(result).not.toBeNull();
    expect(result?.exception?.values?.[0]?.value).toBe("Error: aborted");
  });

  it("keeps an 'aborted' error with an empty stack", () => {
    const event = makeEvent({ message: "aborted", stackFilenames: [] });
    expect(scrubSentryEvent(event)).not.toBeNull();
  });

  it("keeps non-abort errors outright (DB, payment, auth, unexpected)", () => {
    for (const message of [
      "Public categories could not be loaded.",
      "Payment verification failed",
      "TypeError: Cannot read properties of undefined",
    ]) {
      const event = makeEvent({ message, stackFilenames: ["node:_http_server"] });
      expect(scrubSentryEvent(event)).not.toBeNull();
    }
  });

  it("keeps an 'aborted' fetch/timeout failure that lacks the socket-close stack", () => {
    const event = makeEvent({
      message: "The operation was aborted due to timeout",
      stackFilenames: ["node:internal/errors", "undici"],
    });
    expect(scrubSentryEvent(event)).not.toBeNull();
  });

  it("still scrubs request data on kept events", () => {
    const event = makeEvent({
      message: "boom",
      stackFilenames: ["src/x.ts"],
      requestUrl: "https://site.com/path?secret=1",
    });
    const result = scrubSentryEvent(event) as ErrorEvent & {
      request: { url: string; data?: unknown };
    };
    expect(result.request.url).toBe("https://site.com/path");
    expect(result.request.data).toBeUndefined();
  });
});
