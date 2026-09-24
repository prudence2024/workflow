import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import {
  HelpCircle,
  Package,
  ShoppingCart,
  Users,
  FileText,
  Image,
  MessageCircle,
  Settings,
  CreditCard,
  BarChart3,
  Globe,
  Shield,
  Mail,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/dashboard/help")({
  head: () => ({
    meta: [
      { title: "Help — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: HelpPage,
});

const SECTIONS = [
  {
    title: "Getting Started",
    icon: HelpCircle,
    items: [
      {
        q: "How do I add my first product?",
        a: "Go to Products → Add Product. Fill in the name, price, category, and description. Upload images using the Upload button (they go to Cloudinary). Set status to Published and it appears on the public shop immediately.",
      },
      {
        q: "How do I set up the homepage?",
        a: "The homepage pulls data automatically from your admin. Add hero slides (Hero Slides page), products (Products page), blog posts (Blog page), and testimonials (Testimonials page). All changes reflect on the public site in real-time.",
      },
      {
        q: "How do I connect payment?",
        a: "Go to Integrations. Enter your Paystack public and secret keys. Set the webhook URL to https://yourdomain.com/api/webhook/paystack in your Paystack dashboard. Test with a small amount first.",
      },
    ],
  },
  {
    title: "Products & Inventory",
    icon: Package,
    items: [
      {
        q: "How do I add product images?",
        a: "In the Add/Edit Product form, click the Upload button next to the image field. Select an image from your computer — it uploads directly to Cloudinary. You can add multiple images and reorder them.",
      },
      {
        q: "How do I manage stock?",
        a: "Go to Inventory. You'll see all products with their current stock levels. Click the edit icon to update quantity. Low-stock items are highlighted in red.",
      },
      {
        q: "What are product specifications?",
        a: 'Specs are key-value pairs like \'Screen Size: 27 inch\' or \'Resolution: 4K\'. Add them in the product form as JSON: [{"label":"Screen Size","value":"27 inch"}].',
      },
      {
        q: "How do I feature a product?",
        a: "In the product form, check 'Featured' to show it in the Featured section on the homepage. Check 'New' for the New Arrivals badge. Check 'Easy Buy' for the quick-buy option.",
      },
    ],
  },
  {
    title: "Orders & Payments",
    icon: ShoppingCart,
    items: [
      {
        q: "How do I process an order?",
        a: "Go to Orders. When a customer pays, the order status changes to 'paid'. Click 'Process' to move it to 'processing', then 'Ship' when dispatched, then 'Deliver' when confirmed delivered.",
      },
      {
        q: "How do I issue a refund?",
        a: "Go to Refunds. Find the successful transaction and click 'Refund'. You can do a full or partial refund. The refund is processed through Paystack automatically.",
      },
      {
        q: "Where do I see receipts?",
        a: "Go to Receipts. Receipts are generated automatically after successful payment. You can view the HTML receipt, resend it to the customer, or download it.",
      },
    ],
  },
  {
    title: "Content Management",
    icon: FileText,
    items: [
      {
        q: "How do I write blog posts?",
        a: "Go to Blog → New Post. Choose Text Post or Video Post. For text, write your content with blank lines between paragraphs. For video, paste a YouTube URL. Upload a featured image and click Create.",
      },
      {
        q: "How do I update the hero banner?",
        a: "Go to Hero Slides. Create slides with an image, title, subtitle, and CTA button. Set the sort order to control which appears first. Toggle 'Active' to show/hide slides.",
      },
      {
        q: "How do I add testimonials?",
        a: "Go to Testimonials → Add Testimonial. Enter the customer name, their role/company, the review message, and a rating (1-5 stars). Testimonials rotate on the homepage automatically.",
      },
      {
        q: "How do I edit Terms & Privacy Policy?",
        a: "Go to Pages. Click the preset buttons for Terms and Conditions, Privacy Policy, or About. Edit the content and click Update. The pages are accessible at /terms-and-conditions, /privacy-policy, and /about.",
      },
    ],
  },
  {
    title: "Customers & Communication",
    icon: Users,
    items: [
      {
        q: "Where do I see my customers?",
        a: "Go to Customers. You'll see all customers who have made a purchase or signed up for the newsletter. Their order history and total spend are tracked.",
      },
      {
        q: "How do I send emails?",
        a: "Go to Email. Resend is for transactional emails (receipts, order updates). Brevo is for marketing newsletters. Use Compose to send a one-off email to a customer.",
      },
      {
        q: "How do I manage newsletter subscribers?",
        a: "Go to Newsletter. You can see all subscribers, search by email, and remove subscribers who no longer want to receive emails.",
      },
      {
        q: "What are product requests?",
        a: "Customers can submit product requests at /request. These appear in your Messages and Notifications. You can then source the product and follow up via email.",
      },
    ],
  },
  {
    title: "Settings & Integrations",
    icon: Settings,
    items: [
      {
        q: "How do I change the site name/logo?",
        a: "Go to Settings. Update Company Name, Tagline, and upload a new logo. Changes appear on the public site immediately.",
      },
      {
        q: "How do I manage social links?",
        a: "Go to Social Links. Add links for Facebook, Instagram, Twitter, TikTok, YouTube, WhatsApp, etc. You can also add community links (WhatsApp Group, Telegram Group, Discord).",
      },
      {
        q: "How do I set up the announcement bar?",
        a: "Go to Settings → Announcement Bar. Type multiple messages separated by ||| (e.g. 'Free delivery|||New arrivals|||Sale now on'). They rotate every 8 seconds on the public site.",
      },
      {
        q: "How do I manage staff roles?",
        a: "Go to Roles & Permissions. You can create new roles, view permissions for each role, and assign roles to team members. The Owner role has full access and cannot be removed.",
      },
    ],
  },
  {
    title: "Media & Images",
    icon: Image,
    items: [
      {
        q: "Where are images stored?",
        a: "All images are stored on Cloudinary. When you upload through the admin (product images, blog images, hero slides), they go directly to Cloudinary. The Media Library shows all uploaded files.",
      },
      {
        q: "How do I use the Media Library?",
        a: "Go to Media. Upload images here to get Cloudinary URLs you can paste anywhere. Click an image to see its details and copy the URL. You can also delete images from here.",
      },
    ],
  },
  {
    title: "Roles & Permissions",
    icon: Shield,
    items: [
      {
        q: "What roles are available?",
        a: "Owner (full access), Administrator, Sales Manager, Sales Representative, Finance, Content Editor, Support, and Viewer. You can also create custom roles.",
      },
      {
        q: "How do I add a new team member?",
        a: "Go to Staff → Invite. Enter their email and assign a role. They'll receive an invitation via Clerk. Once they accept, they can log in with their assigned permissions.",
      },
      {
        q: "Can I restrict what staff can do?",
        a: "Yes. Each role has specific permissions. For example, a Content Editor can manage blog and hero slides but cannot access payments or settings. A Viewer can only read data.",
      },
    ],
  },
  {
    title: "Telegram Operations Bot",
    icon: MessageCircle,
    items: [
      {
        q: "What is the Telegram Operations Bot?",
        a: "A private internal bot for authorized Diplomat Global administrators. It provides real-time business alerts, payment notifications, and quick-access commands for business data — all from Telegram on your phone.",
      },
      {
        q: "Who can use it?",
        a: "Only the configured Telegram Admin Chat ID is authorized. Telegram username alone is never used for authorization. Unauthorized Telegram users cannot access business, payment or customer data.",
      },
      {
        q: "Where do I check the status?",
        a: "Go to Integrations. The Telegram card shows connection status, bot name/username, and destination accessibility. You can also send a test message from there.",
      },
      {
        q: "How do I use commands?",
        a: "Open the Diplomat Global bot in Telegram, tap Start, then tap / or type a supported command. Available commands:\n• /status — Business overview\n• /health — System health\n• /payments — Recent payments\n• /revenue — Revenue summary\n• /leads — Contacts & subscribers\n• /help — Command menu",
      },
      {
        q: "What alerts are automatic?",
        a: "The bot automatically sends alerts for: new payments, new contact form submissions, new newsletter subscribers, new orders, and low-stock transitions. Telegram failure never breaks core business operations.",
      },
      {
        q: "How do I set it up?",
        a: "1. Create a bot via @BotFather on Telegram\n2. Set TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID in your environment\n3. Set TELEGRAM_WEBHOOK_SECRET for production security\n4. Configure the webhook URL to /api/webhook/telegram\n5. Test via Integrations → Send Test Message",
      },
    ],
  },
];

function HelpPage() {
  const [openSection, setOpenSection] = useState<number | null>(0);
  const [openItem, setOpenItem] = useState<string | null>(null);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Guide</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Learn how to manage every part of your Diplomat Global store
        </p>
      </div>

      {/* Quick Tips */}
      <Card className="bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">Quick Tips</h3>
          <ul className="mt-2 space-y-1 text-xs text-blue-800 dark:text-blue-200">
            <li>
              • Changes to products, hero slides, testimonials, and blog posts appear on the public
              site immediately
            </li>
            <li>• Upload images using the Upload button — they go to Cloudinary automatically</li>
            <li>
              • The notification bell shows unread messages and product requests from customers
            </li>
            <li>• Use the search bar at the top to quickly find pages</li>
          </ul>
        </CardContent>
      </Card>

      {/* Documentation Sections */}
      <div className="space-y-3">
        {SECTIONS.map((section, sIdx) => {
          const Icon = section.icon;
          const isOpen = openSection === sIdx;
          return (
            <Card key={sIdx} className="bg-white dark:bg-[#0F0F12] overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenSection(isOpen ? null : sIdx)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition"
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-gray-400" />
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {section.title}
                  </span>
                  <span className="text-xs text-gray-400">({section.items.length})</span>
                </div>
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                )}
              </button>
              {isOpen && (
                <div className="border-t border-gray-100 dark:border-gray-800">
                  {section.items.map((item, iIdx) => {
                    const itemKey = `${sIdx}-${iIdx}`;
                    const isItemOpen = openItem === itemKey;
                    return (
                      <div
                        key={iIdx}
                        className="border-b border-gray-50 dark:border-gray-800/50 last:border-b-0"
                      >
                        <button
                          type="button"
                          onClick={() => setOpenItem(isItemOpen ? null : itemKey)}
                          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/30 transition"
                        >
                          <span className="text-sm text-gray-700 dark:text-gray-300">{item.q}</span>
                          {isItemOpen ? (
                            <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          )}
                        </button>
                        {isItemOpen && (
                          <div className="px-4 pb-3">
                            <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                              {item.a}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Telegram Quick Link */}
      <Card className="bg-white dark:bg-[#0F0F12]">
        <CardContent className="p-4 flex items-center gap-3">
          <MessageCircle className="h-5 w-5 text-blue-500" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              Telegram Operations Bot
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <a
                href="/dashboard/integrations"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Open Telegram Integration Settings
              </a>{" "}
              — Check connection status, bot details, and send test messages.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Contact */}
      <Card className="bg-white dark:bg-[#0F0F12]">
        <CardContent className="p-4 flex items-center gap-3">
          <Mail className="h-5 w-5 text-gray-400" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Need more help?</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Email support@diplomatglobal.com or check the Supabase dashboard for database issues.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
