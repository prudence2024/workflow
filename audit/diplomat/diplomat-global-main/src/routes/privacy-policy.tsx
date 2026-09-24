import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

const FALLBACK_SECTIONS = [
  {
    title: "Information we collect",
    paragraphs: [
      "We may collect your name, contact details, delivery address, order information and messages you send to us. Payment providers process payment credentials; we do not store complete card details.",
    ],
  },
  {
    title: "How we use information",
    paragraphs: [
      "We use information to process orders, arrange delivery, provide support, prevent fraud, improve the store and send marketing only where you have consented.",
    ],
  },
  {
    title: "Sharing and retention",
    paragraphs: [
      "We share only what is necessary with service providers such as payment, delivery, hosting and analytics partners. We keep records only for legitimate operational, legal and accounting needs.",
    ],
  },
  {
    title: "Your choices",
    paragraphs: [
      "You may ask to access, correct or delete eligible personal information and may opt out of marketing at any time by contacting support@diplomatglobal.com.ng.",
    ],
  },
  {
    title: "Security and contact",
    paragraphs: [
      "We use reasonable technical and organisational safeguards. No online system is risk-free. Questions or privacy requests can be sent to support@diplomatglobal.com.ng.",
    ],
  },
];

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({
    meta: [
      { title: "Privacy policy — Diplomat Global" },
      {
        name: "description",
        content: "How Diplomat Global collects, uses and protects customer information.",
      },
    ],
  }),
  loader: async () => {
    try {
      const { getPublicPageBySlug } = await import("@/lib/admin/server-fns");
      const result = await getPublicPageBySlug({ data: { slug: "privacy-policy" } });
      if (result.page?.content) {
        try {
          const parsed = JSON.parse(result.page.content);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return { sections: parsed, pageTitle: result.page.title };
          }
        } catch {
          /* not JSON, use as plain text */
        }
      }
    } catch {
      /* DB unavailable, use fallback */
    }
    return { sections: FALLBACK_SECTIONS, pageTitle: "Privacy policy" };
  },
  component: Privacy,
});

function Privacy() {
  const { sections, pageTitle } = Route.useLoaderData();
  return (
    <LegalPage
      eyebrow="Legal"
      title={pageTitle || "Privacy policy"}
      intro="This policy explains how Diplomat Global Tech-Solutions handles personal information when you browse, contact us or place an order."
      sections={sections}
    />
  );
}
