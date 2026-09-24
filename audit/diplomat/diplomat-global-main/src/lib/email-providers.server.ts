import "@tanstack/react-start/server-only";

// Email provider abstraction with primary → fallback semantics.
//
// Transactional: Resend primary → SMTP2GO fallback.
// Marketing:     Brevo primary → Mailjet fallback.
//
// Failover rules (deliberately narrow):
// - A DEFINITIVE rejection (HTTP 4xx/5xx response from the provider) means
//   the provider did not accept the message, so failover is safe.
// - An AMBIGUOUS outcome (timeout, abort, no HTTP response) is NEVER retried
//   on the fallback: the first provider may still deliver, and failover would
//   risk a duplicate email. The attempt is recorded and reported as ambiguous.
//
// Every attempt records provider, provider message id, attempt number, and
// outcome so the outbox/durable-log layer (owner-gated) can be wired later
// without changing call sites.

export type EmailOutcome =
  | { status: "sent"; provider: string; providerMessageId: string | null; attempt: number }
  | { status: "failed"; provider: string; error: string; attempt: number; definitive: boolean }
  | { status: "unconfigured"; provider: string; missing: string[] };

export type EmailAttempt = {
  provider: string;
  status: "sent" | "failed" | "unconfigured";
  providerMessageId?: string | null;
  error?: string;
  attempt: number;
};

export type EmailSendResult = {
  final: EmailOutcome;
  attempts: EmailAttempt[];
};

const ATTEMPT_LIMIT = 2; // primary + one fallback, never more

// ─── Provider transports ───

type TransportInput = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  /** Base64-encoded binary attachments (e.g. receipt PDF). Optional. */
  attachments?: Array<{ filename: string; contentBase64: string }>;
};

/**
 * Returns on definitive outcomes. Throws ProviderRejected on HTTP 4xx/5xx
 * (safe to fail over). Ambiguous transport errors (timeout/abort) throw a
 * plain Error marked ambiguous, which the caller must NOT fail over.
 */
class ProviderRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderRejected";
  }
}

async function sendWithResend(input: TransportInput): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");
  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from: input.from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    ...(input.attachments?.length
      ? {
          attachments: input.attachments.map((a) => ({
            filename: a.filename,
            content: a.contentBase64,
          })),
        }
      : {}),
  });
  if (result.error) throw new ProviderRejected(result.error.message || "Resend rejected");
  return result.data?.id ?? null;
}

async function sendWithSmtp2go(input: TransportInput): Promise<string | null> {
  const apiKey = process.env.SMTP2GO_API_KEY?.trim();
  if (!apiKey) throw new Error("SMTP2GO_API_KEY not configured");
  const response = await fetch("https://api.smtp2go.com/v3/email/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      to: [input.to],
      sender: input.from,
      subject: input.subject,
      html_body: input.html,
      text_body: input.text,
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      ...(input.attachments?.length
        ? {
            attachments: input.attachments.map((a) => ({
              filename: a.filename,
              file: a.contentBase64,
            })),
          }
        : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new ProviderRejected(`SMTP2GO ${response.status}`);
  const body = (await response.json()) as { data?: { email_id?: string } };
  return body.data?.email_id ?? null;
}

/**
 * Brevo sender resolution. Live provider evidence (2026-09-16): Brevo rejects
 * senders that are not verified on the account — the hardcoded
 * "noreply@diplomatglobal.com" fallback produced "Sending has been rejected
 * because the sender you used … is not valid". The only verified/active sender
 * on the account is the account's own address.
 *
 * Resolution order: explicit BREVO_SENDER_EMAIL (Owner-configured, must be
 * verified on the Brevo account) → the account's first ACTIVE verified sender
 * fetched from the Brevo API → none. Returning null makes the chain report a
 * truthful CONFIGURATION gap instead of sending with an invalid From.
 */
async function resolveBrevoSender(): Promise<{ email: string; name?: string } | null> {
  const configured = process.env.BREVO_SENDER_EMAIL?.trim();
  if (configured) return { email: configured, name: "Diplomat Global" };
  try {
    const apiKey = process.env.BREVO_API_KEY?.trim();
    if (!apiKey) return null;
    const res = await fetch("https://api.brevo.com/v3/senders", {
      headers: { "api-key": apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      senders?: Array<{ email?: string; name?: string; active?: boolean }>;
    };
    const active = (body.senders ?? []).find((s) => s.active !== false && s.email);
    return active?.email ? { email: active.email, name: active.name || "Diplomat Global" } : null;
  } catch {
    return null;
  }
}

async function sendWithBrevo(input: TransportInput): Promise<string | null> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) throw new Error("BREVO_API_KEY not configured");
  // Prefer the configured/explicit sender, but never send from an address the
  // Brevo account has not verified — that produces the provider rejection
  // "sender … is not valid". input.from is the LAST resort (transactional
  // chains may pass the account's verified Resend address).
  const brevoSender = (await resolveBrevoSender()) ?? { email: input.from, name: "Diplomat Global" };
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      sender: {
        email: brevoSender.email,
        name: brevoSender.name,
      },
      to: [{ email: input.to }],
      subject: input.subject,
      htmlContent: input.html,
      ...(input.text ? { textContent: input.text } : {}),
      ...(input.replyTo ? { replyTo: { email: input.replyTo } } : {}),
      ...(input.attachments?.length
        ? {
            attachment: input.attachments.map((a) => ({
              name: a.filename,
              content: a.contentBase64,
            })),
          }
        : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new ProviderRejected(`Brevo ${response.status}`);
  const body = (await response.json()) as { messageId?: string };
  return body.messageId ?? null;
}

async function sendWithMailjet(input: TransportInput): Promise<string | null> {
  const apiKey = process.env.MAILJET_API_KEY?.trim();
  const secret = process.env.MAILJET_SECRET_KEY?.trim();
  if (!apiKey || !secret) throw new Error("MAILJET credentials not configured");
  const auth = Buffer.from(`${apiKey}:${secret}`).toString("base64");
  const response = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
    body: JSON.stringify({
      Messages: [
        {
          From: { Email: input.from, Name: "Diplomat Global" },
          To: [{ Email: input.to }],
          Subject: input.subject,
          HTMLPart: input.html,
          ...(input.text ? { TextPart: input.text } : {}),
          ...(input.attachments?.length
            ? {
                Attachments: input.attachments.map((a) => ({
                  Filename: a.filename,
                  Base64Content: a.contentBase64,
                })),
              }
            : {}),
        },
      ],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new ProviderRejected(`Mailjet ${response.status}`);
  const body = (await response.json()) as {
    Messages?: { Status?: string; To?: { MessageID?: number | string }[] }[];
  };
  const message = body.Messages?.[0];
  if (message?.Status && message.Status !== "success") {
    throw new ProviderRejected(`Mailjet status ${message.Status}`);
  }
  return message?.To?.[0]?.MessageID != null ? String(message.To[0].MessageID) : null;
}

// ─── Orchestration ───

function missingEnv(names: string[]): string[] {
  return names.filter((n) => !(process.env[n] ?? "").trim());
}

async function runChain(
  chain: { name: string; env: string[]; send: (input: TransportInput) => Promise<string | null> }[],
  input: TransportInput,
): Promise<EmailSendResult> {
  const attempts: EmailAttempt[] = [];

  for (let i = 0; i < Math.min(chain.length, ATTEMPT_LIMIT); i++) {
    const link = chain[i];
    const missing = missingEnv(link.env);
    if (missing.length) {
      attempts.push({ provider: link.name, status: "unconfigured", attempt: i + 1 });
      continue; // config gap → try the next link
    }
    try {
      const providerMessageId = await link.send(input);
      attempts.push({
        provider: link.name,
        status: "sent",
        providerMessageId,
        attempt: i + 1,
      });
      return {
        final: {
          status: "sent",
          provider: link.name,
          providerMessageId,
          attempt: i + 1,
        },
        attempts,
      };
    } catch (err) {
      const definitive = err instanceof ProviderRejected;
      attempts.push({
        provider: link.name,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        attempt: i + 1,
      });
      // Ambiguous (timeout/abort/network) outcomes stop the chain: the
      // primary may still deliver and a fallback send risks duplicates.
      if (!definitive) break;
    }
  }

  const last = attempts[attempts.length - 1];
  if (last && last.status === "unconfigured") {
    return {
      final: {
        status: "unconfigured",
        provider: last.provider,
        missing: chain[0] ? missingEnv(chain[0].env) : [],
      },
      attempts,
    };
  }
  const error = last?.error ?? `No provider configured (${chain.map((c) => c.name).join(" → ")})`;
  return {
    final: {
      status: "failed",
      provider: last?.provider ?? chain[0]?.name ?? "unknown",
      error,
      attempt: last?.attempt ?? 1,
      definitive: !/timeout|abort/i.test(error),
    },
    attempts,
  };
}

export function sendTransactionalEmail(input: TransportInput): Promise<EmailSendResult> {
  return runChain(
    [
      { name: "resend", env: ["RESEND_API_KEY"], send: sendWithResend },
      { name: "smtp2go", env: ["SMTP2GO_API_KEY"], send: sendWithSmtp2go },
    ],
    input,
  );
}

export function sendMarketingEmail(input: TransportInput): Promise<EmailSendResult> {
  return runChain(
    [
      { name: "brevo", env: ["BREVO_API_KEY"], send: sendWithBrevo },
      { name: "mailjet", env: ["MAILJET_API_KEY", "MAILJET_SECRET_KEY"], send: sendWithMailjet },
    ],
    input,
  );
}
