import "server-only";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

export type SendEmailResult = {
  ok: boolean;
  provider: "resend" | "simulated";
  providerMessageId?: string;
  error?: string;
};

/**
 * Sends an email through Resend when an API key is configured, otherwise
 * simulates delivery. Either way, the caller is responsible for recording
 * the outcome as a `messages` row so the contact timeline stays truthful.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "Form Ops <notifications@formops.dev>";

  if (!apiKey) {
    return { ok: true, provider: "simulated", providerMessageId: `sim_${Date.now()}` };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: input.to, subject: input.subject, html: input.html }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, provider: "resend", error: text.slice(0, 500) };
    }
    const data = (await res.json()) as { id?: string };
    return { ok: true, provider: "resend", providerMessageId: data.id };
  } catch (err) {
    return { ok: false, provider: "resend", error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => variables[key] ?? "");
}
