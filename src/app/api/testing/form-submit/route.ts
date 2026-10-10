import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

function html(body: string, status = 200) {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>Workflow testing form</title></head><body>${body}</body></html>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Development-only confirmation endpoint for the real Playwright worker test. */
export async function POST(request: Request) {
  if (process.env.NEON_BRANCH !== "development") return new Response("Not found", { status: 404 });

  const data = await request.formData();
  const firstName = String(data.get("first_name") ?? "").trim();
  const lastName = String(data.get("last_name") ?? "").trim();
  const email = String(data.get("email") ?? "").trim();
  const message = String(data.get("message") ?? "").trim();
  if (!firstName || !lastName || !/^\S+@\S+\.\S+$/.test(email) || !message) {
    return html("<h1>Submission rejected</h1><p>Required fields are missing.</p>", 400);
  }

  // The reference is intentionally not tied to submitted values and is not
  // persisted. The HTTP confirmation is the controlled target's evidence.
  const reference = randomUUID().slice(0, 8);
  return html(`<h1>Your response has been recorded</h1><p>Smoke-test reference: ${reference}</p>`);
}
