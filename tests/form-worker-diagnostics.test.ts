import { describe, expect, it } from "vitest";
import { safeBrowserError } from "../scripts/form-worker-diagnostics.mjs";

describe("form worker browser diagnostics", () => {
  it("preserves the full Chromium launch error instead of its first character", () => {
    const error = [
      "Error: browserType.launch: Executable doesn't exist at /ms-playwright/chromium-1234/chrome-linux64/chrome",
      "Call log:",
      "  - <launching> /ms-playwright/chromium-1234/chrome-linux64/chrome --headless",
      "  - <launched> pid=42",
    ].join("\n");

    const safe = safeBrowserError(error);

    expect(safe).toContain("browserType.launch: Executable doesn't exist");
    expect(safe).toContain("Call log:");
    expect(safe).not.toBe("n");
  });

  it("redacts secrets and PII while retaining the error category", () => {
    const safe = safeBrowserError(
      new Error("browserType.launch failed for owner@example.com authorization: Bearer secret-token"),
    );

    expect(safe).toContain("Error: browserType.launch failed");
    expect(safe).toContain("[redacted-email]");
    expect(safe).toContain("authorization=[redacted]");
    expect(safe).not.toContain("secret-token");
  });
});
