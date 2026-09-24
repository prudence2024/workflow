import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertCircle, Clock, RefreshCw, Shield, Send } from "lucide-react";
import {
  adminGetIntegrationStatus,
  adminTestTelegram,
  adminTelegramDiagnose,
  adminRegisterTelegramWebhook,
  adminRegisterTelegramCommands,
  adminGetTelegramWebhookInfo,
} from "@/lib/admin/server-fns";
import { toast } from "sonner";

/* ── Professional brand icons (inline SVGs) ── */
function ClerkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3a3 3 0 110 6 3 3 0 010-6zm0 14.2a7.2 7.2 0 01-6-3.22c.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08a7.2 7.2 0 01-6 3.22z"
        fill="currentColor"
      />
    </svg>
  );
}
function SupabaseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M13.5 2.5L3 9.5l10.5 7-4.5 5 12-7z" />
      <path d="M3 14.5L13.5 21.5 18 16.5 7.5 9.5z" opacity="0.7" />
    </svg>
  );
}
function CloudinaryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
    </svg>
  );
}
function ResendIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 7l-10 7L2 7" />
    </svg>
  );
}
function BrevoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  );
}
function PaystackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 18V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2zM5 6h14v12H5V6zm3 9h2v-2H8v2zm4 0h2v-2h-2v2zm4 0h2v-2h-2v2zm-8-4h2V9H8v2zm4 0h2V9h-2v2zm4 0h2V9h-2v2z" />
    </svg>
  );
}
function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}
function UpstashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}
function SentryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1C6 1 1 6 1 12s5 11 11 11 11-5 11-11S18 1 12 1zm0 4c.5 0 1 .2 1.4.6l5 5c.4.4.6.9.6 1.4v4c0 .5-.2 1-.6 1.4l-5 5c-.4.4-.9.6-1.4.6s-1-.2-1.4-.6l-5-5c-.4-.4-.6-.9-.6-1.4v-4c0-.5.2-1 .6-1.4l5-5c.4-.4.9-.6 1.4-.6z" />
    </svg>
  );
}

const BRAND_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  clerk: ClerkIcon,
  supabase: SupabaseIcon,
  cloudinary: CloudinaryIcon,
  resend: ResendIcon,
  brevo: BrevoIcon,
  paystack: PaystackIcon,
  telegram: TelegramIcon,
  redis: UpstashIcon,
  sentry: SentryIcon,
};

export const Route = createFileRoute("/dashboard/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [diagResult, setDiagResult] = useState<any>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [regLoading, setRegLoading] = useState(false);
  const [cmdLoading, setCmdLoading] = useState(false);
  const [whInfo, setWhInfo] = useState<any>(null);
  const [whInfoLoading, setWhInfoLoading] = useState(false);

  const fetchStatus = useServerFn(adminGetIntegrationStatus);
  const testTelegram = useServerFn(adminTestTelegram);
  const diagnoseTelegram = useServerFn(adminTelegramDiagnose);
  const registerWebhook = useServerFn(adminRegisterTelegramWebhook);
  const registerCommands = useServerFn(adminRegisterTelegramCommands);
  const getWebhookInfo = useServerFn(adminGetTelegramWebhookInfo);

  const load = async () => {
    setLoading(true);
    const res = await fetchStatus();
    if (res.integrations) setIntegrations(res.integrations);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Integrations</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {integrations.filter((i) => i.configured).length} of {integrations.length} configured
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {integrations.map((intg) => (
          <Card key={intg.provider} className="bg-white dark:bg-[#0F0F12]">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  {(() => {
                    const IconComponent = BRAND_ICONS[intg.provider];
                    return IconComponent ? (
                      <div className="grid size-10 place-items-center rounded-xl bg-gray-100 dark:bg-gray-800">
                        <IconComponent className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      </div>
                    ) : (
                      <div className="grid size-10 place-items-center rounded-xl bg-gray-100 dark:bg-gray-800">
                        <span className="text-lg">⚙️</span>
                      </div>
                    );
                  })()}
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {intg.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{intg.description}</p>
                  </div>
                </div>
                <Badge
                  className={
                    intg.provider === "resend" && intg.configured && !intg.operational
                      ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                      : intg.configured && !intg.operational && intg.provider === "telegram"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                        : intg.configured
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                  }
                >
                  {intg.provider === "resend" && intg.configured && !intg.operational ? (
                    <>
                      <AlertCircle className="h-3 w-3 mr-1" /> Domain Unverified
                    </>
                  ) : intg.provider === "telegram" && intg.configured && !intg.operational ? (
                    <>
                      <AlertCircle className="h-3 w-3 mr-1" /> Configuration Required
                    </>
                  ) : intg.configured && intg.operational ? (
                    <>
                      <CheckCircle className="h-3 w-3 mr-1" /> Operational
                    </>
                  ) : intg.configured ? (
                    <>
                      <CheckCircle className="h-3 w-3 mr-1" /> Configured
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3 w-3 mr-1" /> Not Configured
                    </>
                  )}
                </Badge>
              </div>

              {/* Credential status */}
              <div className="mt-4 space-y-2 border-t border-gray-100 dark:border-gray-800 pt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 flex items-center gap-1">
                    <Shield className="h-3 w-3" /> Credentials
                  </span>
                  <span
                    className={
                      intg.configured
                        ? intg.provider === "resend" && !intg.operational
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-green-600 dark:text-green-400"
                        : "text-gray-400"
                    }
                  >
                    {intg.configured
                      ? intg.provider === "resend" && !intg.operational
                        ? `API key set — domain ${intg.domain || "not set"} needs verification`
                        : intg.provider === "telegram" && !intg.operational
                          ? intg.status_detail ||
                            "CONFIGURATION REQUIRED — destination chat not verified"
                          : intg.provider === "telegram" && intg.bot_username
                            ? `Bot @${intg.bot_username} verified — destination accessible`
                            : "Server-side configured"
                      : "Missing environment variables"}
                  </span>
                </div>
                {intg.last_tested_at && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Last tested
                    </span>
                    <span className="text-gray-600 dark:text-gray-400">
                      {new Date(intg.last_tested_at).toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                )}
                {intg.last_test_result && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Result</span>
                    <Badge
                      variant={intg.last_test_result === "success" ? "default" : "destructive"}
                      className="text-[10px]"
                    >
                      {intg.last_test_result}
                    </Badge>
                  </div>
                )}
                {intg.updated_by && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Updated by</span>
                    <span className="text-gray-600 dark:text-gray-400 font-mono text-[10px]">
                      {intg.updated_by}
                    </span>
                  </div>
                )}{" "}
              </div>

              {/* Telegram control panel */}
              {intg.provider === "telegram" && intg.configured && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
                  {/* Diagnose button */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    disabled={diagLoading}
                    onClick={async () => {
                      setDiagLoading(true);
                      setDiagResult(null);
                      try {
                        const res = await diagnoseTelegram();
                        setDiagResult(res);
                        if (res.ok) toast.success("Diagnostics complete — check details below");
                        else toast.error(res.error || "Diagnosis failed");
                      } catch (err: any) {
                        toast.error(err.message || "Diagnosis failed");
                      }
                      setDiagLoading(false);
                    }}
                  >
                    {diagLoading ? "Diagnosing..." : "🔍 Diagnose Bot"}
                  </Button>

                  {diagResult && (
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3 text-xs space-y-1.5 font-mono">
                      {diagResult.ok ? (
                        <>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Bot ID:</span>
                            <span>{diagResult.bot?.id || "?"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Bot Name:</span>
                            <span>{diagResult.bot?.name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Bot @username:</span>
                            <span>@{diagResult.bot?.username}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Admin Chat Accessible:</span>
                            <span>{diagResult.chat?.accessible ? "✅ Yes" : "❌ No"}</span>
                          </div>
                          {diagResult.chat?.error && (
                            <div className="text-red-600 dark:text-red-400 text-[11px]">
                              {diagResult.chat.error}
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-gray-500">Chat ID = Bot ID:</span>
                            <span
                              className={
                                diagResult.chatIsBot ? "text-red-600 font-bold" : "text-green-600"
                              }
                            >
                              {diagResult.chatIsBot
                                ? "⚠️ YES — WRONG! Set your own chat ID"
                                : "✅ No (correct)"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Webhook Secret:</span>
                            <span>
                              {diagResult.webhookSecretConfigured ? "✅ Set" : "⚠️ Missing"}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="text-red-600 dark:text-red-400">{diagResult.error}</div>
                      )}
                    </div>
                  )}

                  {/* Register webhook */}
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="https://your-domain.vercel.app"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      className="flex-1 text-xs px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs shrink-0"
                      disabled={regLoading || !webhookUrl}
                      onClick={async () => {
                        setRegLoading(true);
                        try {
                          const res = await registerWebhook({ data: { url: webhookUrl } });
                          if (res.ok) toast.success(`Webhook registered: ${res.webhookUrl}`);
                          else toast.error(res.message || "Registration failed");
                        } catch (err: any) {
                          toast.error(err.message || "Failed");
                        }
                        setRegLoading(false);
                      }}
                    >
                      {regLoading ? "..." : "📡 Register"}
                    </Button>
                  </div>

                  {/* Register commands */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    disabled={cmdLoading}
                    onClick={async () => {
                      setCmdLoading(true);
                      try {
                        const res = await registerCommands();
                        if (res.ok)
                          toast.success(
                            `Commands registered: ${(res as any).commands?.join(", ")}`,
                          );
                        else toast.error((res as any).message || "Failed");
                      } catch (err: any) {
                        toast.error(err.message || "Failed");
                      }
                      setCmdLoading(false);
                    }}
                  >
                    {cmdLoading ? "Registering..." : "📋 Register Command Menu"}
                  </Button>

                  {/* Webhook info */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    disabled={whInfoLoading}
                    onClick={async () => {
                      setWhInfoLoading(true);
                      setWhInfo(null);
                      try {
                        const res = await getWebhookInfo();
                        setWhInfo(res);
                      } catch (err: any) {
                        toast.error(err.message || "Failed");
                      }
                      setWhInfoLoading(false);
                    }}
                  >
                    {whInfoLoading ? "Loading..." : "ℹ️ Webhook Info"}
                  </Button>

                  {whInfo && (
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3 text-xs space-y-1 font-mono">
                      {whInfo.ok ? (
                        <>
                          <div className="flex justify-between">
                            <span className="text-gray-500">URL:</span>
                            <span className="break-all">{whInfo.url}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Pending Updates:</span>
                            <span>{whInfo.pendingUpdateCount}</span>
                          </div>
                          {whInfo.lastErrorDate && (
                            <div className="flex justify-between">
                              <span className="text-gray-500">Last Error:</span>
                              <span className="text-red-600">{whInfo.lastErrorMessage}</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-red-600 dark:text-red-400">{whInfo.error}</div>
                      )}
                    </div>
                  )}

                  {/* Send test message */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    disabled={testingTelegram}
                    onClick={async () => {
                      setTestingTelegram(true);
                      try {
                        const res = await testTelegram();
                        if (res.ok) toast.success("Test message sent to Telegram!");
                        else toast.error(res.message || "Test failed");
                      } catch (err: any) {
                        toast.error(err.message || "Test failed");
                      }
                      setTestingTelegram(false);
                    }}
                  >
                    <Send className="h-3 w-3 mr-1" />{" "}
                    {testingTelegram ? "Sending..." : "Send Test Message"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {loading && integrations.length === 0 && (
          <div className="col-span-full flex items-center justify-center py-12 text-gray-400">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" /> Loading...
          </div>
        )}
      </div>

      {/* Security notice */}
      <Card className="bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Security Notice
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                All API keys and secrets are stored server-side only. They are never exposed to the
                browser. To update credentials, modify the environment variables on your hosting
                platform (Vercel, etc.).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
