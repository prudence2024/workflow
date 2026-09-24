import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  Share2,
  Trash2,
  Plus,
  Edit,
  X,
  ExternalLink,
  Facebook,
  Instagram,
  Twitter,
  Music2,
  Youtube,
  MessageCircle,
  Linkedin,
  Send,
  Users,
  Tv,
  Link as LinkIcon,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  adminListSocialLinks,
  adminCreateSocialLink,
  adminUpdateSocialLink,
  adminDeleteSocialLink,
} from "@/lib/admin/server-fns";
import { Pagination } from "@/components/admin/pagination";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/social-links")({
  head: () => ({
    meta: [
      { title: "Social Links — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: SocialLinksPage,
});

const PLATFORMS = [
  "Facebook",
  "Instagram",
  "X (Twitter)",
  "TikTok",
  "YouTube",
  "WhatsApp",
  "LinkedIn",
  "Telegram",
  "Discord",
  "Twitch",
];

const PLATFORM_ICONS: Record<string, any> = {
  Facebook: Facebook,
  Instagram: Instagram,
  "X (Twitter)": Twitter,
  TikTok: Music2,
  YouTube: Youtube,
  WhatsApp: MessageCircle,
  LinkedIn: Linkedin,
  Telegram: Send,
  Discord: MessageCircle,
  Twitch: Tv,
};
const COMMUNITY_PLATFORMS = [
  "WhatsApp Group",
  "Telegram Group",
  "Discord Server",
  "Facebook Group",
  "LinkedIn Group",
];

function SocialLinksPage() {
  const router = useRouter();
  const [links, setLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingLink, setEditingLink] = useState<any>(null);
  const [form, setForm] = useState({
    platform: "",
    url: "",
    icon: "",
    sort_order: 0,
    is_active: true,
    link_type: "social" as "social" | "contact" | "other",
  });

  const fetchLinks = useServerFn(adminListSocialLinks);
  const createLink = useServerFn(adminCreateSocialLink);
  const updateLink = useServerFn(adminUpdateSocialLink);
  const deleteLink = useServerFn(adminDeleteSocialLink);

  const load = async () => {
    setLoading(true);
    const res = await fetchLinks();
    setLinks(res.links || []);
    setLoading(false);
    return res.links || [];
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditingLink(null);
    setForm({
      platform: "",
      url: "",
      icon: "",
      sort_order: links.length,
      is_active: true,
      link_type: "social",
    });
    setShowForm(true);
  };

  const openEdit = (link: any) => {
    setEditingLink(link);
    setForm({
      platform: link.platform || "",
      url: link.url || "",
      icon: link.icon || "",
      sort_order: link.sort_order || 0,
      is_active: link.is_active ?? true,
      link_type: link.link_type || "social",
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.platform || !form.url) {
      toast.error("Platform and URL are required");
      return;
    }
    if (editingLink) {
      const res = await updateLink({ data: { link_id: editingLink.id, ...form } });
      if (res.ok) {
        toast.success("Link updated");
        setShowForm(false);
        await load();
        await router.invalidate();
      } else toast.error(res.message);
    } else {
      const res = await createLink({ data: form });
      if (res.ok) {
        toast.success("Link created");
        setShowForm(false);
        await load();
        await router.invalidate();
      } else toast.error(res.message);
    }
  };

  const handleDelete = async (id: string, platform: string) => {
    if (!confirm(`Delete ${platform} link?`)) return;
    const res = await deleteLink({ data: { link_id: id } });
    if (res.ok) {
      toast.success("Link deleted");
      await load();
      await router.invalidate();
    } else toast.error(res.message);
  };

  const toggleActive = async (link: any) => {
    const res = await updateLink({ data: { link_id: link.id, is_active: !link.is_active } });
    if (res.ok) {
      toast.success(link.is_active ? "Link hidden" : "Link shown");
      await load();
      await router.invalidate();
    } else toast.error(res.message);
  };

  /** Real reorder: swap sort_order with the adjacent visible link, then refetch. */
  const moveLink = async (index: number, direction: -1 | 1) => {
    const target = links[index + direction];
    const current = links[index];
    if (!target || !current) return;
    const a = await updateLink({
      data: { link_id: current.id, sort_order: target.sort_order ?? index + direction },
    });
    const b = await updateLink({
      data: { link_id: target.id, sort_order: current.sort_order ?? index },
    });
    if (a.ok && b.ok) {
      await load();
      await router.invalidate();
    } else {
      toast.error(a.message || b.message || "Reorder failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Social Links</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {links.length} links — displayed in website footer
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0891b2] text-white rounded-lg text-sm font-medium hover:bg-[#0e9cc0] focus:ring-2 focus:ring-[#0891b2]/50 focus:ring-offset-1 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" /> Add Link
        </button>
      </div>

      {showForm && (
        <Card className="bg-white dark:bg-[#1a1a1e]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingLink ? "Edit Link" : "New Link"}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CustomSelect
                label="Platform *"
                value={form.platform}
                onChange={(v) => {
                  setForm({ ...form, platform: v, icon: v === "custom" ? "" : v });
                }}
                placeholder="Select platform"
                options={[
                  ...PLATFORMS.map((p) => ({ value: p, label: p })),
                  { value: "custom", label: "Custom" },
                ]}
              />
              {form.platform === "custom" && (
                <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Custom Platform Name
                  <input
                    type="text"
                    value={form.icon}
                    onChange={(e) => setForm({ ...form, icon: e.target.value })}
                    placeholder="Platform name"
                    className="appearance-none px-3 py-2.5 pr-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                </label>
              )}
              <CustomSelect
                label="Link Type"
                value={form.link_type}
                onChange={(v) => setForm({ ...form, link_type: v as any })}
                options={[
                  { value: "social", label: "Social Media" },
                  { value: "contact", label: "Community / Group" },
                  { value: "other", label: "Other" },
                ]}
              />
              <div></div>
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 sm:col-span-2">
                URL *
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://..."
                  className="appearance-none px-3 py-2.5 pr-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                Sort Order
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                  min="0"
                  className="appearance-none px-3 py-2.5 pr-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
              <div className="flex items-center gap-4 pt-6">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="accent-brand"
                  />
                  Active
                </label>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                onClick={handleSubmit}
                className="bg-[#0891b2] text-white hover:bg-[#0e9cc0] focus:ring-2 focus:ring-[#0891b2]/50"
              >
                {editingLink ? "Update" : "Create"}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {links.map((link: any, idx: number) => (
          <Card key={link.id} className="bg-white dark:bg-[#0F0F12]">
            <CardContent className="p-3 sm:p-4">
              {/* Top row: icon + platform + badge + actions */}
              <div className="flex items-center gap-3">
                {/* Platform icon */}
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gray-100 dark:bg-gray-800">
                  {PLATFORM_ICONS[link.platform] ? (
                    (() => {
                      const IconComp = PLATFORM_ICONS[link.platform];
                      return <IconComp className="h-4 w-4 text-gray-500" />;
                    })()
                  ) : (
                    <LinkIcon className="h-4 w-4 text-gray-500" />
                  )}
                </div>

                {/* Platform name + type + sort indicator */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {link.platform === "custom" ? link.icon || "Custom Link" : link.platform}
                    </p>
                    <span className="shrink-0 text-[10px] font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 rounded px-1.5 py-0.5">
                      #{link.sort_order ?? idx}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase">
                    {link.link_type || "social"}
                  </p>
                </div>

                {/* Active/Hidden visible status + actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <span
                    className={`inline-flex min-h-6 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      link.is_active
                        ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                        : "bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    }`}
                  >
                    {link.is_active ? "Active" : "Hidden"}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => moveLink(idx, -1)}
                    disabled={idx === 0}
                    title="Move up"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => moveLink(idx, 1)}
                    disabled={idx === links.length - 1}
                    title="Move down"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => openEdit(link)}
                    title="Edit"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => toggleActive(link)}
                    title={link.is_active ? "Hide from site" : "Show on site"}
                  >
                    {link.is_active ? (
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-40" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
                      </span>
                    ) : (
                      <span className="h-3 w-3 rounded-full border-2 border-gray-300 dark:border-gray-600" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    onClick={() => handleDelete(link.id, link.platform)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* URL row — full width, truncated with title tooltip */}
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-[#0891b2] transition min-w-0"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="truncate min-w-0" title={link.url}>
                  {link.url}
                </span>
              </a>
            </CardContent>
          </Card>
        ))}
        {links.length === 0 && !loading && (
          <Card className="bg-white dark:bg-[#0F0F12]">
            <CardContent className="p-8 text-center">
              <Share2 className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-900 dark:text-white">No social links</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
