import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

const FALLBACK_SECTIONS = [
  {
    title: "Warranty coverage",
    paragraphs: [
      "Eligible products include the warranty period stated on the product page or sales receipt. Coverage applies to confirmed manufacturing or hardware faults under normal use.",
    ],
  },
  {
    title: "What is not covered",
    paragraphs: [
      "Accidental damage, liquid exposure, unauthorised repair, misuse, normal wear, software issues and damage caused by unstable power are generally excluded unless expressly stated otherwise.",
    ],
  },
  {
    title: "Start a claim",
    paragraphs: [
      "Contact support@diplomatglobal.com.ng with your order number, product serial number, a description of the issue and clear photos or video. Do not send a product before receiving return instructions.",
    ],
  },
  {
    title: "Inspection and resolution",
    paragraphs: [
      "Returned items are inspected before repair, replacement, store credit or refund is approved. Data backup and account removal remain the customer's responsibility before a device is submitted.",
    ],
  },
];

export const Route = createFileRoute("/warranty")({
  head: () => ({
    meta: [
      { title: "Warranty & returns — Diplomat Global" },
      {
        name: "description",
        content:
          "Coverage details, exclusions and the claims process for Diplomat Global warranty and returns.",
      },
    ],
  }),
  loader: async () => {
    try {
      const { getPublicPageBySlug } = await import("@/lib/admin/server-fns");
      const result = await getPublicPageBySlug({ data: { slug: "warranty" } });
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
    return { sections: FALLBACK_SECTIONS, pageTitle: "Warranty & returns" };
  },
  component: Warranty,
});

function Warranty() {
  const { sections, pageTitle } = Route.useLoaderData();
  return (
    <LegalPage
      eyebrow="Customer care"
      title={pageTitle || "Warranty & returns"}
      intro="Clear support for faults, delivery issues and eligible returns."
      sections={sections}
    />
  );
}
