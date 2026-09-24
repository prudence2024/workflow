import { Section, SectionHeading } from "@/components/marketing/Section";

export default function TermsPage() {
  return (
    <Section className="pt-16">
      <SectionHeading eyebrow="Terms" title="Terms of service" />
      <div className="prose mt-8 max-w-2xl space-y-5 text-[13.5px] leading-relaxed text-[var(--color-ink-soft)]">
        <p>
          By using FormflowOps you agree to only submit data to forms and destinations you are authorized to interact
          with. You may not use the platform to bypass CAPTCHA, OTP, anti-bot protections, or any access control
          mechanism.
        </p>
        <p>
          Your organization is responsible for the accuracy of imported data and for obtaining consent required to
          contact the people in your records. Usage limits apply according to your plan and are described on the
          Pricing page.
        </p>
        <p>
          We may suspend accounts engaged in abusive automation, unauthorized access attempts, or violations of
          destination websites' terms of service.
        </p>
        <p>This is a template terms of service for the FormflowOps product preview and should be reviewed by counsel before commercial use.</p>
      </div>
    </Section>
  );
}
