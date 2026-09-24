import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Mail, CheckCircle, AlertCircle } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { publicUnsubscribe } from "@/lib/admin/server-fns";

export const Route = createFileRoute("/unsubscribe")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: search.token ? String(search.token) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Unsubscribe — Diplomat Global" },
      { name: "description", content: "Unsubscribe from Diplomat Global marketing emails." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const { token } = Route.useSearch();
  const unsubscribe = useServerFn(publicUnsubscribe);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleUnsubscribe = async () => {
    if (!token) {
      setStatus("error");
      setMessage("Invalid unsubscribe link. Please check the link in your email.");
      return;
    }
    setStatus("loading");
    try {
      const res = await unsubscribe({ data: { token } });
      if (res.ok) {
        setStatus("success");
        setMessage(res.message);
      } else {
        setStatus("error");
        setMessage(res.message);
      }
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again later.");
    }
  };

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main className="mx-auto max-w-lg px-5 py-16 sm:px-6 md:py-24 text-center">
        {status === "idle" && (
          <>
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-500 mb-4">
              <Mail className="h-7 w-7" />
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-gray-900 dark:text-white md:text-3xl">
              Unsubscribe from Marketing Emails
            </h1>
            <p className="mt-4 text-muted-foreground max-w-md mx-auto">
              You will stop receiving promotional emails and marketing newsletters from Diplomat
              Global. Transactional emails (order confirmations, receipts) will continue as needed.
            </p>
            <button
              onClick={handleUnsubscribe}
              className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition"
            >
              Confirm Unsubscribe
            </button>
            <p className="mt-6 text-xs text-gray-400">
              Your customer record and order history will be preserved.
            </p>
          </>
        )}

        {status === "loading" && (
          <div className="py-16">
            <span className="h-8 w-8 border-2 border-gray-300 border-t-[#0891b2] rounded-full animate-spin inline-block" />
            <p className="mt-4 text-muted-foreground">Processing your request...</p>
          </div>
        )}

        {status === "success" && (
          <div className="py-8">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 mb-4">
              <CheckCircle className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Unsubscribed</h2>
            <p className="mt-3 text-muted-foreground max-w-md mx-auto">{message}</p>
            <a
              href="/"
              className="mt-6 inline-flex items-center gap-2 text-sm text-[#0891b2] hover:underline"
            >
              Return to Diplomat Global
            </a>
          </div>
        )}

        {status === "error" && (
          <div className="py-8">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 mb-4">
              <AlertCircle className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Something Went Wrong
            </h2>
            <p className="mt-3 text-muted-foreground max-w-md mx-auto">{message}</p>
            <a
              href="/"
              className="mt-6 inline-flex items-center gap-2 text-sm text-[#0891b2] hover:underline"
            >
              Return to Diplomat Global
            </a>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
