import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  Settings,
  Save,
  Building,
  Phone,
  MessageCircle,
  Plus,
  Trash2,
  GripVertical,
  Truck,
  Package,
} from "lucide-react";
import { adminGetSiteSettings, adminUpdateSiteSettings } from "@/lib/admin/server-fns";
import { parseAnnouncements, DEFAULT_ANNOUNCEMENTS, type Announcement } from "@/lib/site-settings";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  loader: async () => {
    try {
      const { adminGetSiteSettings } = await import("@/lib/admin/server-fns");
      const res = await adminGetSiteSettings();
      return { settings: res.settings ?? {} };
    } catch {
      return { settings: {} };
    }
  },
  component: SettingsPage,
});

function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Record<string, string>>({
    company_name: "",
    support_email: "",
    phone: "",
    whatsapp_url: "",
    location: "",
    bn_number: "",
    website_url: "",
    tagline: "",
    ga_measurement_id: "",
    ga_enabled: "",
    google_maps_directions_url: "",
    delivery_fee: "7500",
    free_delivery_enabled: "false",
    free_delivery_threshold: "0",
    low_stock_alerts_enabled: "true",
    low_stock_threshold_default: "5",
    phone_lock_nigeria: "false",
  });
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [newAnnouncement, setNewAnnouncement] = useState("");
  const [rotationInterval, setRotationInterval] = useState(8);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loaderData = Route.useLoaderData();
  const fetchSettings = useServerFn(adminGetSiteSettings);
  const saveSettings = useServerFn(adminUpdateSiteSettings);

  // Initialize from loader data (SSR), then set loading false
  useEffect(() => {
    const s = loaderData.settings;
    if (s && Object.keys(s).length > 0) {
      const { announcement_text, ...rest } = s;
      setSettings((prev) => ({
        ...prev,
        ...rest,
        ga_measurement_id: s.ga_measurement_id || "",
        ga_enabled: s.ga_enabled || "",
      }));
      const stored = s.announcements ?? "";
      const parsed = parseAnnouncements(stored);
      if (parsed.length > 0) {
        setAnnouncements(parsed);
      } else if (announcement_text) {
        // Legacy: only announcement_text exists (single string, possibly ||| separated)
        const legacyParsed = parseAnnouncements(announcement_text);
        if (legacyParsed.length > 0) {
          // Merge legacy with defaults so the admin can see and manage all announcements
          const defaultTexts = new Set(legacyParsed.map((a) => a.text));
          const extraDefaults = DEFAULT_ANNOUNCEMENTS.filter((d) => !defaultTexts.has(d.text));
          setAnnouncements(
            [...legacyParsed, ...extraDefaults].map((a, i) => ({ ...a, sort_order: i })),
          );
        } else {
          setAnnouncements([]);
        }
      } else {
        // No announcements in DB at all — load defaults so admin can manage them
        setAnnouncements(DEFAULT_ANNOUNCEMENTS.map((a, i) => ({ ...a, sort_order: i })));
      }
      const interval = parseInt(s.announcement_rotation_interval || "8", 10);
      setRotationInterval(isNaN(interval) || interval < 2 ? 8 : Math.min(interval, 30));
    }
    setLoading(false);
  }, []);

  const addAnnouncement = () => {
    const text = newAnnouncement.trim();
    if (!text) return;
    setAnnouncements((prev) => [
      ...prev,
      { id: `ann-${Date.now()}`, text, enabled: true, sort_order: prev.length },
    ]);
    setNewAnnouncement("");
  };

  const removeAnnouncement = (index: number) => {
    setAnnouncements((prev) =>
      prev.filter((_, i) => i !== index).map((a, i) => ({ ...a, sort_order: i })),
    );
  };

  const toggleAnnouncement = (index: number) => {
    setAnnouncements((prev) =>
      prev.map((a, i) => (i === index ? { ...a, enabled: !a.enabled } : a)),
    );
  };

  const moveAnnouncement = (index: number, direction: -1 | 1) => {
    setAnnouncements((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((a, i) => ({ ...a, sort_order: i }));
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const res = await saveSettings({
      data: {
        settings: {
          ...settings,
          announcements: JSON.stringify(announcements),
          announcement_text: announcements.find((a) => a.enabled)?.text || "",
          announcement_rotation_interval: String(rotationInterval),
        },
      },
    });
    setSaving(false);
    if (res.ok) {
      await router.invalidate();
      toast.success("Settings saved!");
    } else toast.error(res.message);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage your website settings
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Save className="h-4 w-4 mr-2" /> {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-white dark:bg-[#0F0F12]">
          <CardHeader>
            <CardTitle className="flex items-center text-gray-900 dark:text-white">
              <Building className="h-5 w-5 mr-2" /> Business Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Company Name
              </label>
              <Input
                value={settings.company_name}
                onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Shown in the site header, footer, page title, and email templates.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Tagline
              </label>
              <Input
                value={settings.tagline}
                onChange={(e) => setSettings({ ...settings, tagline: e.target.value })}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Short slogan displayed beneath the company name in the hero section.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Business Number
              </label>
              <Input
                value={settings.bn_number}
                onChange={(e) => setSettings({ ...settings, bn_number: e.target.value })}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Official registration number shown on receipts and business-information pages.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-[#0F0F12]">
          <CardHeader>
            <CardTitle className="flex items-center text-gray-900 dark:text-white">
              <Phone className="h-5 w-5 mr-2" /> Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Support Email
              </label>
              <Input
                value={settings.support_email}
                onChange={(e) => setSettings({ ...settings, support_email: e.target.value })}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Shown in footer and contact page. Also receives copy of contact form messages.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Phone</label>
              <Input
                value={settings.phone}
                onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Displayed as a click-to-call link in the footer and contact page.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                WhatsApp URL
              </label>
              <Input
                value={settings.whatsapp_url}
                onChange={(e) => setSettings({ ...settings, whatsapp_url: e.target.value })}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Full URL (e.g. https://wa.me/234...) for the WhatsApp chat button.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Lock Phone Inputs to Nigeria
                </label>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  When ON: all phone inputs show only Nigeria. Server rejects non-Nigerian numbers.
                  When OFF: Nigeria pre-selected but users can choose any country.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.phone_lock_nigeria === "true"}
                onClick={() =>
                  setSettings({
                    ...settings,
                    phone_lock_nigeria: settings.phone_lock_nigeria === "true" ? "false" : "true",
                  })
                }
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2",
                  settings.phone_lock_nigeria === "true"
                    ? "bg-brand"
                    : "bg-gray-200 dark:bg-gray-700",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                    settings.phone_lock_nigeria === "true" ? "translate-x-5" : "translate-x-0",
                  )}
                />
              </button>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Business Address
              </label>
              <Textarea
                value={settings.location}
                onChange={(e) => setSettings({ ...settings, location: e.target.value })}
                rows={4}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Authoritative address used by receipts, the footer, contact pages, and business
                communications.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Website URL
              </label>
              <Input
                type="url"
                value={settings.website_url}
                onChange={(e) => setSettings({ ...settings, website_url: e.target.value })}
                placeholder="https://www.example.com"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Official public website shown on receipts and business communications.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Google Maps Directions URL
              </label>
              <Input
                value={settings.google_maps_directions_url || ""}
                onChange={(e) =>
                  setSettings({ ...settings, google_maps_directions_url: e.target.value })
                }
                placeholder="https://www.google.com/maps/place/..."
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Opens the business location in Google Maps when visitors click Get Directions.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-[#0F0F12]">
          <CardHeader>
            <CardTitle className="flex items-center text-gray-900 dark:text-white">
              <Truck className="h-5 w-5 mr-2" /> Delivery Settings
            </CardTitle>
            <CardDescription>
              Configure delivery fees and free delivery thresholds for customers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Delivery Fee (₦)
              </label>
              <Input
                type="number"
                value={settings.delivery_fee}
                onChange={(e) => setSettings({ ...settings, delivery_fee: e.target.value })}
                placeholder="7500"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Standard delivery fee charged to customers. Set to 0 for free delivery.
              </p>
            </div>
            <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
              <div className="space-y-1">
                <label
                  htmlFor="free-delivery-enabled"
                  className="text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Free Delivery
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Apply free delivery when the post-discount merchandise total reaches the saved
                  threshold. Turning this off preserves the threshold.
                </p>
              </div>
              <Switch
                id="free-delivery-enabled"
                checked={settings.free_delivery_enabled === "true"}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, free_delivery_enabled: String(checked) })
                }
                aria-label="Enable free delivery threshold"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Free Delivery Threshold (₦)
              </label>
              <Input
                type="number"
                value={settings.free_delivery_threshold}
                onChange={(e) =>
                  setSettings({ ...settings, free_delivery_threshold: e.target.value })
                }
                placeholder="250000"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Post-discount merchandise totals at or above this amount qualify when free delivery
                is enabled. A zero threshold never grants automatic free delivery.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-[#0F0F12] lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center text-gray-900 dark:text-white">
              <MessageCircle className="h-5 w-5 mr-2" /> Announcement Bar
            </CardTitle>
            <CardDescription>
              Manage announcements shown at the top of the public website. Enabled announcements
              rotate automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Rotation interval */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <CustomSelect
                label="Rotation interval"
                value={String(rotationInterval)}
                onChange={(v) => setRotationInterval(Number(v))}
                options={[
                  { value: "5", label: "5 seconds" },
                  { value: "8", label: "8 seconds" },
                  { value: "10", label: "10 seconds" },
                  { value: "15", label: "15 seconds" },
                  { value: "20", label: "20 seconds" },
                ]}
                className="w-full sm:w-48"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Only applies when 2+ announcements are enabled
              </span>
            </div>

            {/* Existing announcements */}
            {announcements.length > 0 && (
              <div className="space-y-2">
                {announcements.map((ann, index) => (
                  <div
                    key={ann.id}
                    className={`flex items-center gap-2 rounded-lg border p-3 transition ${ann.enabled ? "border-gray-200 dark:border-gray-700" : "border-gray-200/50 dark:border-gray-700/50 opacity-60"}`}
                  >
                    <GripVertical className="h-4 w-4 shrink-0 text-gray-400" />
                    <button
                      type="button"
                      onClick={() => toggleAnnouncement(index)}
                      className={`shrink-0 rounded-full w-9 h-5 transition-colors ${ann.enabled ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`}
                      aria-label={ann.enabled ? "Disable announcement" : "Enable announcement"}
                    >
                      <span
                        className={`block w-4 h-4 rounded-full bg-white transition-transform shadow ${ann.enabled ? "translate-x-4" : "translate-x-0.5"}`}
                      />
                    </button>
                    <span
                      className="flex-1 text-sm text-gray-900 dark:text-white truncate"
                      title={ann.text}
                    >
                      {ann.text}
                    </span>
                    <button
                      type="button"
                      onClick={() => moveAnnouncement(index, -1)}
                      disabled={index === 0}
                      className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveAnnouncement(index, 1)}
                      disabled={index === announcements.length - 1}
                      className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeAnnouncement(index)}
                      className="shrink-0 rounded p-1 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                      title="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new announcement */}
            <div className="flex gap-2">
              <Input
                value={newAnnouncement}
                onChange={(e) => setNewAnnouncement(e.target.value)}
                placeholder="Add a new announcement..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addAnnouncement();
                  }
                }}
              />
              <Button
                type="button"
                onClick={addAnnouncement}
                variant="outline"
                className="shrink-0"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {announcements.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                No announcements configured. Add one above to display on the storefront.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-[#0F0F12]">
          <CardHeader>
            <CardTitle className="flex items-center text-gray-900 dark:text-white">
              <Package className="h-5 w-5 mr-2" /> Inventory Alerts
            </CardTitle>
            <CardDescription>
              Default low-stock behaviour for products. Individual thresholds are set per product in
              Product Create/Edit. This is separate from the free-delivery threshold above.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
              <div className="space-y-1">
                <label
                  htmlFor="low-stock-alerts"
                  className="text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Low Stock Alerts:{" "}
                  {settings.low_stock_alerts_enabled === "true" ? "Enabled" : "Disabled"}
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Warn when a product's available stock falls to its threshold or below.
                </p>
              </div>
              <Switch
                id="low-stock-alerts"
                checked={settings.low_stock_alerts_enabled === "true"}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, low_stock_alerts_enabled: String(checked) })
                }
                aria-label="Enable low stock alerts"
              />
            </div>
            <div>
              <label
                htmlFor="inventory-default-threshold"
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Default Low Stock Threshold
              </label>
              <Input
                type="number"
                min="0"
                id="inventory-default-threshold"
                step="1"
                max="1000000"
                value={settings.low_stock_threshold_default}
                onChange={(e) =>
                  setSettings({ ...settings, low_stock_threshold_default: e.target.value })
                }
                placeholder="5"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Applied to new products and products without a specific threshold. Products keep
                their own saved threshold once set.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-[#0F0F12] lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center text-gray-900 dark:text-white">
              <svg
                className="h-5 w-5 mr-2"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
              Analytics
            </CardTitle>
            <CardDescription>
              Configure analytics tracking. GA4 Measurement ID is configuration, not a secret.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.ga_enabled === "true"}
                  onChange={(e) =>
                    setSettings({ ...settings, ga_enabled: e.target.checked ? "true" : "" })
                  }
                  className="accent-brand"
                />
                Enable Google Analytics (GA4)
              </label>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                GA4 Measurement ID
              </label>
              <Input
                value={settings.ga_measurement_id}
                onChange={(e) => setSettings({ ...settings, ga_measurement_id: e.target.value })}
                placeholder="G-XXXXXXXXXX"
                disabled={settings.ga_enabled !== "true"}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                e.g. G-XXXXXXXXXX. Found in your Google Analytics property settings.
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                <strong>Vercel Analytics</strong> — Installed and active on this deployment.{" "}
                <a
                  href="https://vercel.com/dashboard/analytics"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand underline"
                >
                  View in Vercel Dashboard →
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
