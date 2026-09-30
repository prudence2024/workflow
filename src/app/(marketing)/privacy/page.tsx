import { Section, SectionHeading } from "@/components/marketing/Section";

export default function PrivacyPage() {
  return (
    <Section className="pt-16">
      <SectionHeading eyebrow="Privacy" title="Privacy policy" />
      <div className="prose mt-8 max-w-2xl space-y-5 text-[13.5px] leading-relaxed text-[var(--color-ink-soft)]">
        <p>
          Workflow stores the information you and your organization submit — including contact records, campaign
          data, and communication logs — solely to operate the platform on your behalf.
        </p>
        <p>
          Data belonging to your organization is isolated from other organizations. We do not sell personal data.
          Files such as import spreadsheets, exports, and generated documents are stored in dedicated object storage,
          separate from the relational database that holds structured records.
        </p>
        <p>
          You may request export or deletion of your organization's data at any time by contacting support. Sessions
          are secured with httpOnly, secure cookies and expire automatically.
        </p>
        <p>This is a template privacy policy for the Workflow product preview and should be reviewed by counsel before commercial use.</p>
      </div>
    </Section>
  );
}
