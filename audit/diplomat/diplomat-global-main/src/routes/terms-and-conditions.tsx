import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

const FALLBACK_SECTIONS = [
  {
    title: "Orders and availability",
    paragraphs: [
      "An order is confirmed after payment is verified and we accept it. Product availability, specifications and pricing may change; we will contact you if an item becomes unavailable or a material listing error is discovered.",
    ],
  },
  {
    title: "Payment and delivery",
    paragraphs: [
      "Payments are processed through the methods shown at checkout. Delivery estimates are not guarantees and may be affected by location, access, courier operations or events outside our control.",
    ],
  },
  {
    title: "Returns and warranty",
    paragraphs: [
      "Returns and warranty claims must follow the published warranty policy. Products should be inspected promptly and any delivery damage reported with supporting photographs.",
    ],
  },
  {
    title: "Acceptable use",
    paragraphs: [
      "You must not misuse the site, attempt unauthorised access, submit false information or interfere with store operations.",
    ],
  },
  {
    title: "Contact",
    paragraphs: [
      "Questions about an order or these terms can be sent to support@diplomatglobal.com.ng. Nothing in these terms removes rights that cannot lawfully be excluded.",
    ],
  },
];

export const Route = createFileRoute("/terms-and-conditions")({
  head: () => ({
    meta: [
      { title: "Terms and conditions — Diplomat Global" },
      {
        name: "description",
        content:
          "The terms governing purchases, payment, delivery, returns and acceptable use of the Diplomat Global online store.",
      },
    ],
  }),
  loader: async () => {
    try {
      const { getPublicPageBySlug } = await import("@/lib/admin/server-fns");
      const result = await getPublicPageBySlug({ data: { slug: "terms-and-conditions" } });
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
    return { sections: FALLBACK_SECTIONS, pageTitle: "Terms and conditions" };
  },
  component: Terms,
});

function Terms() {
  const { sections, pageTitle } = Route.useLoaderData();
  return (
    <LegalPage
      eyebrow="Legal"
      title={pageTitle || "Terms and conditions"}
      intro="These terms govern purchases and use of the Diplomat Global online store."
      sections={sections}
    />
  );
}
