import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CustomSelect } from "@/components/ui/custom-select";
import { Globe, Search, Plus, Edit, Trash2, X, FileText } from "lucide-react";
import {
  adminListSitePages,
  adminCreateSitePage,
  adminUpdateSitePage,
  adminDeleteSitePage,
} from "@/lib/admin/server-fns";
import { getPageFallbackContent } from "@/lib/page-fallbacks.server";
import { joinInFlight } from "@/lib/in-flight-dedupe";
import { pageHref } from "@/lib/public-search";
import { Pagination } from "@/components/admin/pagination";
import { toast } from "sonner";
import {
  LegalSectionsEditor,
  AboutPageEditor,
  FaqPageEditor,
  detectPageType,
  type LegalSection,
  type AboutPageData,
  type PageType,
} from "@/components/page-editors";
import { FAQ_ITEMS_FALLBACK } from "@/lib/faq-fallback";

export const Route = createFileRoute("/dashboard/pages")({
  head: () => ({
    meta: [
      { title: "Pages — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PagesPage,
});

/** Built-in pages that always appear in the list */
const BUILTIN_PAGES = [
  { slug: "about", title: "About Diplomat Global", type: "about" as PageType },
  { slug: "terms-and-conditions", title: "Terms and conditions", type: "legal" as PageType },
  { slug: "privacy-policy", title: "Privacy policy", type: "legal" as PageType },
  { slug: "warranty", title: "Warranty & returns", type: "legal" as PageType },
  { slug: "faq", title: "Frequently asked questions", type: "faq" as PageType },
];

/** Canonical public URL for a page slug (the shared public-search mapping). */
function publicPageHref(slug: string): string {
  return pageHref(slug);
}

function PagesPage() {
  const [search, setSearch] = useState("");
  const [pages, setPages] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPage, setEditingPage] = useState<any>(null);
  const [form, setForm] = useState({
    slug: "",
    title: "",
    content: "",
    status: "draft" as "draft" | "published" | "archived",
  });
  const [legalSections, setLegalSections] = useState<LegalSection[]>([]);
  const [aboutData, setAboutData] = useState<AboutPageData>({});
  const [faqItems, setFaqItems] = useState<{ question: string; answer: string }[]>([]);
  const [pageType, setPageType] = useState<PageType>("generic");
  const [deletingPage, setDeletingPage] = useState<{ id: string; title: string } | null>(null);

  const fetchPages = useServerFn(adminListSitePages);
  const createPage = useServerFn(adminCreateSitePage);
  const updatePage = useServerFn(adminUpdateSitePage);
  const deletePage = useServerFn(adminDeleteSitePage);

  const load = async () => {
    setLoading(true);
    // The page component mounts twice (verified live), so the same request
    // would otherwise be issued twice concurrently. Same key joins it.
    const res = await joinInFlight(`site-pages|${search}|${page}`, () =>
      fetchPages({ data: { search, page, pageSize: 10 } }),
    );
    setPages(res.pages || []);
    setTotal(res.total || 0);
    setLoading(false);
  };

  useEffect(() => {
    setPage(1);
  }, [search]);
  useEffect(() => {
    load();
  }, [page, search]);

  /** Merge DB pages with built-in pages (built-in always shown) */
  const allPages = (() => {
    const dbSlugs = new Set(pages.map((p: any) => p.slug));
    const result = [...pages];
    for (const bp of BUILTIN_PAGES) {
      if (!dbSlugs.has(bp.slug)) {
        // Not in DB yet — show as "not created" built-in
        result.unshift({
          id: null,
          slug: bp.slug,
          title: bp.title,
          status: "not_created",
          content: null,
          isBuiltin: true,
        });
      }
    }
    return result;
  })();

  const openCreate = useCallback(() => {
    setEditingPage(null);
    setForm({ slug: "", title: "", content: "", status: "draft" });
    setLegalSections([]);
    setAboutData({});
    setFaqItems([]);
    setPageType("generic");
    setShowForm(true);
  }, []);

  /** Load fallback content for a known slug */
  const loadFallbackContent = useCallback(async (slug: string) => {
    try {
      const fallback = await getPageFallbackContent({ data: slug });
      if (fallback.content) {
        const type = detectPageType(slug);
        setPageType(type);
        setForm({
          slug,
          title: fallback.title || slug,
          content: fallback.content,
          status: "published",
        });
        if (type === "legal") {
          try {
            const parsed = JSON.parse(fallback.content);
            if (Array.isArray(parsed)) setLegalSections(parsed);
          } catch {
            /* best-effort: use fallback */
          }
        } else if (type === "about") {
          try {
            const parsed = JSON.parse(fallback.content);
            if (parsed && typeof parsed === "object") setAboutData(parsed);
          } catch {
            /* best-effort: use fallback */
          }
        } else if (type === "faq") {
          try {
            const parsed = JSON.parse(fallback.content);
            if (Array.isArray(parsed)) setFaqItems(parsed);
          } catch {
            /* best-effort: use fallback */
          }
        }
        setShowForm(true);
      } else if (detectPageType(slug) === "faq") {
        // Pure client fallback module isn't part of the server fallback map
        setFaqItems(FAQ_ITEMS_FALLBACK);
      }
    } catch {
      /* best-effort: use fallback */
    }
  }, []);

  /** Open a page for editing — loads DB content or fallback */
  const openEdit = useCallback(
    (page: any) => {
      const slug = page.slug || "";
      const content = page.content || "";
      const type = detectPageType(slug);
      setPageType(type);
      setEditingPage(page.id ? page : null); // null if not in DB yet

      // If page has content (from DB), use it
      if (content) {
        setForm({ slug, title: page.title || "", content, status: page.status || "draft" });
        if (type === "legal") {
          try {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) setLegalSections(parsed);
            else setLegalSections([]);
          } catch {
            setLegalSections([]);
          }
        } else if (type === "about") {
          try {
            const parsed = JSON.parse(content);
            if (parsed && typeof parsed === "object") setAboutData(parsed);
            else setAboutData({});
          } catch {
            setAboutData({});
          }
        } else if (type === "faq") {
          try {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) setFaqItems(parsed);
            else setFaqItems([]);
          } catch {
            setFaqItems([]);
          }
        }
        setShowForm(true);
      } else {
        // No DB content — load fallback for known slugs
        setLegalSections([]);
        setAboutData({});
        setFaqItems([]);
        setShowForm(true);
        loadFallbackContent(slug);
      }
    },
    [loadFallbackContent],
  );

  const handleSubmit = async () => {
    if (!form.slug || !form.title) {
      toast.error("Slug and title are required");
      return;
    }
    // Serialize structured content
    let content = form.content;
    if (pageType === "legal" && legalSections.length > 0) {
      content = JSON.stringify(legalSections);
    } else if (pageType === "about") {
      content = JSON.stringify(aboutData);
    } else if (pageType === "faq") {
      const valid = faqItems.filter((item) => item.question.trim() && item.answer.trim());
      if (valid.length === 0) {
        toast.error("Add at least one complete question and answer");
        return;
      }
      content = JSON.stringify(valid);
    }
    const formData = { ...form, content };
    if (editingPage?.id) {
      const res = await updatePage({ data: { page_id: editingPage.id, ...formData } });
      if (res.ok) {
        toast.success("Page updated");
        setShowForm(false);
        load();
      } else toast.error(res.message);
    } else {
      // First save — create the page
      const res = await createPage({ data: formData });
      if (res.ok) {
        toast.success("Page created");
        setShowForm(false);
        load();
      } else toast.error(res.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Pages</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{allPages.length} pages</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0891b2] text-white rounded-lg text-sm font-medium hover:opacity-90 transition"
        >
          <Plus className="h-4 w-4" /> New Page
        </button>
      </div>

      {showForm && (
        <Card className="bg-white dark:bg-[#1a1a1e]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingPage?.id ? "Edit Page" : "New Page"}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                Title *
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    setForm({
                      ...form,
                      title,
                      slug:
                        form.slug ||
                        title
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/(^-|-$)/g, ""),
                    });
                  }}
                  placeholder="Page title"
                  className="appearance-none px-3 py-2.5 pr-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                Slug *
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => {
                    const slug = e.target.value;
                    setForm({ ...form, slug });
                    setPageType(detectPageType(slug));
                  }}
                  placeholder="about-us"
                  className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
              <CustomSelect
                label="Status"
                value={form.status}
                onChange={(v) => setForm({ ...form, status: v as any })}
                options={[
                  { value: "draft", label: "Draft" },
                  { value: "published", label: "Published" },
                  { value: "archived", label: "Archived" },
                ]}
              />
            </div>

            {/* Structured editors for known page types */}
            {pageType === "legal" && (
              <div className="mt-4">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                  Structured Sections Editor
                </p>
                <LegalSectionsEditor sections={legalSections} onChange={setLegalSections} />
              </div>
            )}
            {pageType === "about" && (
              <div className="mt-4">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                  About Page Editor
                </p>
                <AboutPageEditor data={aboutData} onChange={setAboutData} />
              </div>
            )}
            {pageType === "faq" && <FaqPageEditor items={faqItems} onChange={setFaqItems} />}
            {pageType === "generic" && (
              <div className="mt-4">
                <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Content
                  <textarea
                    value={form.content}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                    rows={10}
                    placeholder="Page content..."
                    className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand/30 resize-y"
                  />
                </label>
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <Button
                onClick={handleSubmit}
                className="bg-[#0891b2] hover:bg-[#0e7490] text-white border-none"
              >
                {editingPage?.id ? "Update Page" : "Create Page"}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          aria-label="Search pages..."
          placeholder="Search pages..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <Card className="bg-white dark:bg-[#0F0F12]">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    Title
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">
                    Slug
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                    Updated
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {allPages.map((page: any) => (
                  <tr
                    key={page.id || page.slug}
                    className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {page.isBuiltin && (
                          <FileText className="h-4 w-4 text-brand flex-shrink-0" />
                        )}
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {page.title}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-sm text-gray-500 font-mono">/{page.slug}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={
                          page.status === "published"
                            ? "bg-green-100 text-green-800"
                            : page.status === "not_created"
                              ? "bg-yellow-100 text-yellow-800"
                              : page.status === "draft"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-gray-100 text-gray-600"
                        }
                      >
                        {page.status === "not_created" ? "Not created" : page.status || "draft"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-sm text-gray-500">
                        {page.updated_at
                          ? new Date(page.updated_at).toLocaleDateString("en-NG", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={publicPageHref(page.slug)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`View ${page.title} on the public site`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded text-gray-500 transition hover:bg-gray-100 hover:text-brand dark:hover:bg-gray-800"
                        >
                          <Globe className="h-4 w-4" />
                        </a>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 w-9 p-0"
                          aria-label={`Edit ${page.title}`}
                          onClick={() => openEdit(page)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {page.id && !page.isBuiltin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 w-9 p-0"
                            aria-label={`Delete ${page.title}`}
                            onClick={() =>
                              setDeletingPage({ id: String(page.id), title: page.title })
                            }
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {allPages.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                      <Globe className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">No pages yet</p>
                      <p className="text-xs mt-1">
                        Create pages like About, Terms, Privacy Policy, etc.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalItems={total} pageSize={10} onPageChange={setPage} />
        </CardContent>
      </Card>

      {deletingPage && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-page-title"
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-[#1a1a1e]"
          >
            <h2
              id="delete-page-title"
              className="text-lg font-semibold text-gray-900 dark:text-white"
            >
              Delete “{deletingPage.title}”?
            </h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              This permanently removes the page from the database. The public URL will stop showing
              this page's content. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeletingPage(null)}>
                Cancel
              </Button>
              <Button
                className="bg-red-600 text-white hover:bg-red-700 border-none"
                onClick={async () => {
                  const res = await deletePage({ data: { page_id: deletingPage.id } });
                  if (res.ok) {
                    toast.success("Page deleted");
                    setDeletingPage(null);
                    load();
                  } else {
                    toast.error(res.message);
                  }
                }}
              >
                Delete page
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
