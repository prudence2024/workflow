// Canonical FAQ fallback content — pure data, importable from client and
// server code. The public /faq route uses it when no published `faq` page
// exists; the Pages admin uses it to preload editable content.
export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS_FALLBACK: FaqItem[] = [
  {
    question: "How long does delivery take?",
    answer:
      "Lagos orders typically arrive within 1–2 business days; nationwide orders take 2–5 business days depending on location. You'll be contacted if anything affects your delivery window.",
  },
  {
    question: "Do you deliver outside Lagos?",
    answer:
      "Yes. We deliver nationwide across Nigeria. Delivery fees and timelines are shown at checkout before you pay.",
  },
  {
    question: "Is there free delivery?",
    answer:
      "Lagos deliveries are free on orders over ₦300,000. Other locations show the exact fee at checkout.",
  },
  {
    question: "How can I pay?",
    answer:
      "Payments are processed securely through Paystack — card, bank transfer and USSD. Your order is confirmed once payment is verified.",
  },
  {
    question: "What is your return policy?",
    answer:
      "Products that arrive damaged, defective or significantly different from the description can be returned within the stated window. See the Warranty & returns page for the full process.",
  },
  {
    question: "How do I start a warranty claim?",
    answer:
      "Contact support with your order number, the product serial number, a description of the issue and photos or video. Do not send the product before receiving return instructions.",
  },
  {
    question: "Are your products new or used?",
    answer:
      "We sell new and certified pre-owned devices. The condition is always stated clearly on the product page before you buy.",
  },
  {
    question: "Can I request a product you don't stock?",
    answer:
      "Yes — use the Request page with the product details and we'll source it and come back to you with availability and pricing.",
  },
];
