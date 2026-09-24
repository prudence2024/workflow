/**
 * Returns fallback/default page content for known slugs.
 * Used by Pages admin to preload existing public content when no DB row exists.
 *
 * This allows the owner to edit existing content without recreating pages.
 */
import { createServerFn } from "@tanstack/react-start";
import { FAQ_ITEMS_FALLBACK } from "./faq-fallback";

const TERMS_FALLBACK = [
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

const PRIVACY_FALLBACK = [
  {
    title: "Information we collect",
    paragraphs: [
      "When you visit the site, place an order or contact us, we may collect your name, email address, phone number, delivery address and payment reference. Browsing data such as pages viewed and device type may also be collected automatically.",
    ],
  },
  {
    title: "How we use your information",
    paragraphs: [
      "We use personal information to process orders, arrange delivery, communicate about your purchase, improve our website and respond to enquiries. Marketing communications are sent only with your consent and you can opt out at any time.",
    ],
  },
  {
    title: "Sharing your information",
    paragraphs: [
      "We share information only with service providers necessary to fulfil orders (payment processing, delivery couriers, email delivery). We do not sell your personal data to third parties.",
    ],
  },
  {
    title: "Data security",
    paragraphs: [
      "We use industry-standard encryption and security measures to protect your personal information. Payment card details are processed securely through Paystack and are never stored on our servers.",
    ],
  },
  {
    title: "Your rights",
    paragraphs: [
      "You can request access to the personal information we hold about you, ask for corrections, or request deletion. Contact us at support@diplomatglobal.com.ng for any data-related requests.",
    ],
  },
  {
    title: "Contact",
    paragraphs: [
      "For questions about this privacy policy or how we handle your data, contact us at support@diplomatglobal.com.ng.",
    ],
  },
];

const WARRANTY_FALLBACK = [
  {
    title: "Warranty coverage",
    paragraphs: [
      "Every product sold by Diplomat Global comes with a clear warranty period stated at the time of purchase. Warranty covers manufacturing defects and faults in materials under normal use conditions.",
    ],
  },
  {
    title: "What is not covered",
    paragraphs: [
      "Warranty does not cover physical damage from accidents, liquid damage, unauthorised modifications, normal wear and tear, or damage caused by power surges or improper use.",
    ],
  },
  {
    title: "How to make a claim",
    paragraphs: [
      "Contact our support team with your order number, a description of the issue and photographs if applicable. We will assess the claim and guide you through the process.",
    ],
  },
  {
    title: "Returns process",
    paragraphs: [
      "If a product arrives damaged, defective or significantly different from what was described, you may request a return within the specified window. Items must be returned in their original packaging where possible.",
    ],
  },
  {
    title: "Refunds",
    paragraphs: [
      "Approved refunds are processed to the original payment method within 5–10 business days. Delivery fees are non-refundable unless the return is due to our error.",
    ],
  },
  {
    title: "Contact",
    paragraphs: [
      "For warranty claims or return requests, reach out to support@diplomatglobal.com.ng or call +234 803 575 1338 during business hours.",
    ],
  },
];

const ABOUT_FALLBACK = {
  heading: "Technology you can buy with confidence.",
  description:
    "We help professionals, creators, students and businesses choose quality-checked technology with honest specifications, clear pricing and dependable after-sales support.",
  founder: {},
  faq: [],
};

const FALLBACK_MAP: Record<string, { title: string; content: string }> = {
  "terms-and-conditions": {
    title: "Terms and conditions",
    content: JSON.stringify(TERMS_FALLBACK),
  },
  "privacy-policy": {
    title: "Privacy policy",
    content: JSON.stringify(PRIVACY_FALLBACK),
  },
  warranty: {
    title: "Warranty & returns",
    content: JSON.stringify(WARRANTY_FALLBACK),
  },
  about: {
    title: "About Diplomat Global",
    content: JSON.stringify(ABOUT_FALLBACK),
  },
  faq: {
    title: "Frequently asked questions",
    content: JSON.stringify(FAQ_ITEMS_FALLBACK),
  },
};

/**
 * Get fallback content for a known page slug.
 * Returns null if slug is not a known page.
 */
export const getPageFallbackContent = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const fallback = FALLBACK_MAP[slug.toLowerCase().trim()];
    if (!fallback) return { content: null, title: null };
    return { content: fallback.content, title: fallback.title };
  });
