const MAX_SAFE_ERROR_LENGTH = 1000;

function redactSensitiveText(value) {
  return value
    .replace(/((?:authorization|cookie|set-cookie|password|secret|api[_-]?key))\s*[:=]\s*[^\r\n]+/gi, "$1=[redacted]")
    .replace(/\b(bearer|token)\b\s*[:=]?\s*[^\s,;]+/gi, "$1 [redacted]")
    .replace(/(?:sk|pk)_(?:test|live)_[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\b/g, "[redacted-token]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/:\/\/([^/\s:@]+):([^@\s]+)@/g, "://[redacted]@");
}

/**
 * Keep enough Playwright/Chromium context to diagnose the worker while
 * redacting credentials, tokens, and obvious PII before persistence/logging.
 */
export function safeBrowserError(error) {
  const isObject = error && typeof error === "object";
  const name = isObject && typeof error.name === "string" ? error.name : "";
  const message = isObject && typeof error.message === "string" ? error.message : String(error ?? "Unknown browser error");
  const stack = isObject && typeof error.stack === "string" ? error.stack : "";
  const raw = [name && !message.startsWith(`${name}:`) ? `${name}: ${message}` : message, stack && stack !== message ? stack : ""]
    .filter(Boolean)
    .join("\n");
  return redactSensitiveText(raw).slice(0, MAX_SAFE_ERROR_LENGTH);
}
