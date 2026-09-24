export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  image: string;
  category: string;
  date: string;
  readTime: string;
  watchTime?: string;
  content: string[];
  videoUrl?: string;
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "iphone-15-pro-review",
    title: "iPhone 15 Pro review: what Nigerian buyers should know",
    excerpt:
      "A practical look at performance, battery life, camera quality and who should upgrade.",
    image: "/content/blog/iphone-15-pro-review.jpg",
    category: "Reviews",
    date: "2026-07-18",
    readTime: "6 min read",
    watchTime: "6 min watch",
    videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    content: [
      "The iPhone 15 Pro remains a strong option for buyers who value a dependable camera, long software support and a compact premium build. Its biggest improvements are most noticeable to creators and people upgrading from much older models.",
      "Before buying, compare storage capacity, battery health and warranty coverage rather than focusing only on the exterior condition. A professionally checked device with transparent after-sales support is often the safer long-term purchase.",
      "For Nigerian users, USB-C compatibility is especially useful because it reduces the number of cables needed across phones, laptops and accessories. Always confirm network compatibility and request a complete device inspection before payment.",
    ],
  },
  {
    slug: "best-tech-under-200k",
    title: "Five smart tech upgrades under ₦200,000",
    excerpt:
      "Useful accessories and devices that improve work, study and entertainment without overspending.",
    image: "/content/blog/top-5-phones-under-200k.jpg",
    category: "Buying guides",
    date: "2026-07-11",
    readTime: "5 min read",
    content: [
      "A thoughtful setup upgrade does not always require a flagship budget. Portable displays, reliable hubs, storage and productivity accessories can make a larger daily difference than an expensive impulse purchase.",
      "Start by identifying the bottleneck in your current setup. Remote workers may benefit most from a second screen, while creators may need faster storage and students may prioritise battery life and portability.",
      "Buy products with clear specifications, warranty terms and local support. The cheapest listing is not necessarily the lowest-cost option once replacement risk and delivery uncertainty are considered.",
    ],
  },
  {
    slug: "used-vs-brand-new-tech",
    title: "UK-used or brand new? A transparent buying guide",
    excerpt: "How to evaluate condition, warranty, price and long-term value before choosing.",
    image: "/content/blog/uk-used-vs-brand-new.jpg",
    category: "Advice",
    date: "2026-07-03",
    readTime: "7 min read",
    content: [
      "Brand-new devices offer the clearest warranty and battery expectations, while professionally inspected used devices can provide excellent value. The right choice depends on your budget, risk tolerance and intended lifespan.",
      "For used technology, request battery and diagnostic information, confirm that security locks have been removed, and inspect ports, displays, cameras and wireless connectivity. Avoid sellers who cannot explain their testing process.",
      "A trustworthy retailer should describe condition honestly, provide a written return or warranty policy and remain reachable after the sale. Those protections matter more than labels such as clean or premium used.",
    ],
  },
];

export const TESTIMONIALS = [
  {
    name: "Adebayo K.",
    role: "Creative professional",
    rating: 5,
    message:
      "The monitor arrived exactly as described, setup was easy, and support checked in after delivery. That level of care made the difference.",
  },
  {
    name: "Chioma N.",
    role: "Business owner",
    rating: 5,
    message:
      "Clear pricing, patient answers and fast Lagos delivery. I knew what I was buying before I paid and the product has performed perfectly.",
  },
  {
    name: "Tunde O.",
    role: "Remote engineer",
    rating: 5,
    message:
      "My workstation upgrade was smooth from recommendation to delivery. The team understood the ports and display requirements instead of just selling a box.",
  },
  {
    name: "Amaka E.",
    role: "Returning customer",
    rating: 5,
    message:
      "I have purchased more than once because the products are quality checked and the after-sales support is genuinely responsive.",
  },
];

export const getBlogPost = (slug: string) => BLOG_POSTS.find((post) => post.slug === slug);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Deterministic date label — avoids locale/timezone mismatch between SSR and client. */
export function formatPostDate(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return `${MONTHS[(month ?? 1) - 1]} ${day}, ${year}`;
}
