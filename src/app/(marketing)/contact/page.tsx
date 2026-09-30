import { Section, SectionHeading } from "@/components/marketing/Section";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Label, Textarea } from "@/components/ui/Field";

export default function ContactPage() {
  return (
    <Section className="pt-16">
      <div className="grid gap-12 lg:grid-cols-2">
        <div>
          <SectionHeading
            eyebrow="Contact"
            title="Talk to us about your operation."
            description="Tell us about the process you're trying to run — registrations, enrollment, onboarding, or something else — and we'll help you map it to Workflow."
          />
          <div className="mt-8 space-y-3 text-[13.5px] text-[var(--color-ink-soft)]">
            <p>support@formflow.ops</p>
            <p>Response within 1 business day on all plans.</p>
          </div>
        </div>
        <form className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-sm)]">
          <FieldGroup>
            <Label htmlFor="name">Full name</Label>
            <Input id="name" name="name" placeholder="Grace Johnson" required />
          </FieldGroup>
          <FieldGroup>
            <Label htmlFor="email">Work email</Label>
            <Input id="email" name="email" type="email" placeholder="grace@organization.org" required />
          </FieldGroup>
          <FieldGroup>
            <Label htmlFor="message">What are you trying to run?</Label>
            <Textarea id="message" name="message" placeholder="We register 800 conference attendees every quarter…" required />
          </FieldGroup>
          <Button type="submit" className="w-full">
            Send message
          </Button>
          <p className="text-[11.5px] text-[var(--color-muted)]">
            This form is a preview placeholder — connect it to your inbox provider before launch.
          </p>
        </form>
      </div>
    </Section>
  );
}
