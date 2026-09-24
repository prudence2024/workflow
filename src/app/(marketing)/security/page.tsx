import { Section, SectionHeading } from "@/components/marketing/Section";
import { Alert } from "@/components/ui/Surfaces";

const PRINCIPLES = [
  { title: "No bypass, ever", body: "The platform never attempts to bypass CAPTCHA, OTP, anti-bot challenges, or access controls. Detected challenges stop automation and become Human Action Required." },
  { title: "Multi-tenant isolation", body: "Every business record belongs to an organization. Server-side authorization checks organization membership on every request." },
  { title: "Role-based access", body: "Owner, Admin, Manager, Member, and Viewer roles define exactly what each teammate can see and do." },
  { title: "Idempotent operations", body: "Submissions, emails, and scheduled actions use idempotency protection so retries never duplicate a successful operation." },
  { title: "Auditability", body: "Every meaningful operation generates an activity event and an audit log entry — nothing happens invisibly." },
  { title: "Secure sessions", body: "Sessions use httpOnly, secure cookies; passwords are hashed with bcrypt and never stored in plain text." },
];

export default function SecurityPage() {
  return (
    <Section className="pt-16">
      <SectionHeading eyebrow="Security" title="Reliable, safe, and observable by design." />
      <div className="mt-6 max-w-2xl">
        <Alert tone="info" title="Human Action Required, by design">
          Whenever a worker detects a CAPTCHA, OTP, or anti-bot challenge, automation stops immediately. The platform
          never attempts circumvention — the record is flagged for a human to complete.
        </Alert>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {PRINCIPLES.map((p) => (
          <div key={p.title} className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-5">
            <p className="font-display text-[14.5px] font-semibold text-[var(--color-ink)]">{p.title}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-muted)]">{p.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
