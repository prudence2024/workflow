import "@tanstack/react-start/server-only";
import { sendTransactionalEmail as sendViaProviderChain } from "./email-providers.server";

export type ContactMessage = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

function getEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const owner = process.env.CONTACT_OWNER_EMAIL?.trim();
  return apiKey && from && owner ? { apiKey, from, owner } : null;
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!,
  );
}

export async function sendContactEmails(input: ContactMessage) {
  const config = getEmailConfig();
  if (!config) return { sent: false as const, reason: "unconfigured" as const };
  const safe = {
    name: escapeHtml(input.name),
    email: escapeHtml(input.email),
    subject: escapeHtml(input.subject),
    message: escapeHtml(input.message).replace(/\n/g, "<br />"),
  };
  const submissionId = crypto.randomUUID();
  const ownerResult = await sendViaProviderChain({
    from: config.from,
    to: config.owner,
    replyTo: input.email,
    subject: `Website enquiry: ${input.subject}`,
    html: `<h1>New website enquiry</h1><p><strong>From:</strong> ${safe.name} (${safe.email})</p><p><strong>Subject:</strong> ${safe.subject}</p><p>${safe.message}</p>`,
    text: `New website enquiry\nFrom: ${input.name} <${input.email}>\nSubject: ${input.subject}\n\n${input.message}`,
  });
  if (ownerResult.final.status !== "sent") {
    console.error("Owner contact email failed", {
      provider: ownerResult.final.provider,
      status: ownerResult.final.status,
    });
    return { sent: false as const, reason: "provider_error" as const };
  }
  const senderResult = await sendViaProviderChain({
    from: config.from,
    to: input.email,
    subject: "We received your message",
    html: `<p>Hello ${safe.name},</p><p>Thank you for contacting Diplomat Global Tech-Solutions. We received your message about “${safe.subject}” and will reply as soon as possible.</p>`,
    text: `Hello ${input.name},\n\nThank you for contacting Diplomat Global Tech-Solutions. We received your message about "${input.subject}" and will reply as soon as possible.`,
  });
  if (senderResult.final.status !== "sent") {
    console.error("Contact acknowledgement email failed", {
      provider: senderResult.final.provider,
      status: senderResult.final.status,
    });
  }
  return { sent: true as const, acknowledgementSent: senderResult.final.status === "sent" };
}

/** Generic transactional email sender — used by receipts, notifications, etc. */
export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Optional binary attachments (base64), e.g. the canonical receipt PDF. */
  attachments?: Array<{ filename: string; contentBase64: string }>;
}): Promise<{ sent: boolean; error?: string; provider?: string }> {
  const result = await sendViaProviderChain({
    from: process.env.RESEND_FROM_EMAIL?.trim() || "diplomatglobaltechs@gmail.com",
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    ...(input.attachments?.length ? { attachments: input.attachments } : {}),
  });
  if (result.final.status !== "sent") {
    const error =
      result.final.status === "failed" ? result.final.error : "Email provider not configured.";
    console.error("Transactional email failed:", {
      to: input.to,
      provider: result.final.provider,
      error,
    });
    // Create notification for email failure
    try {
      const { notifications } = await import("@/lib/notifications");
      await notifications.resendFailure(input.subject || "transactional", error);
    } catch (err) {
      // Notification failure must not affect email flow
    }
    return { sent: false, error, provider: result.final.provider };
  }
  return { sent: true, provider: result.final.provider };
}
