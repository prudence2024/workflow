/** Exact development-only allowlist for the owned local testing form. */
export function isAllowedLocalFormRequest(raw, method = "GET", env = process.env) {
  if (env.WORKFLOW_ALLOW_LOCAL_FORM_TEST !== "1" ||
      env.NEON_BRANCH?.toLowerCase() !== "development" ||
      env.NODE_ENV !== "development") return false;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" &&
      url.hostname === "localhost" &&
      url.port === "3000" &&
      !url.search && !url.hash &&
      ((method.toUpperCase() === "GET" && url.pathname === "/testing-form") ||
       (method.toUpperCase() === "POST" && url.pathname === "/api/testing/form-submit"));
  } catch {
    return false;
  }
}
