import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Search, Trash2 } from "lucide-react";
import { adminListSubscribers, adminDeleteSubscriber } from "@/lib/admin/server-fns";
import { Pagination } from "@/components/admin/pagination";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/newsletter")({
  head: () => ({
    meta: [
      { title: "Newsletter — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: NewsletterPage,
});

function NewsletterPage() {
  const [search, setSearch] = useState("");
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchSubscribers = useServerFn(adminListSubscribers);
  const deleteSubscriber = useServerFn(adminDeleteSubscriber);

  const load = async () => {
    setLoading(true);
    const res = await fetchSubscribers({ data: { search, page, pageSize: 10 } });
    setSubscribers(res.subscribers || []);
    setTotal(res.total || 0);
    setLoading(false);
  };

  useEffect(() => {
    setPage(1);
  }, [search]);
  useEffect(() => {
    load();
  }, [page, search]);

  const handleDelete = async (id: string, email: string) => {
    if (!confirm("Remove subscriber " + email + "?")) return;
    const res = await deleteSubscriber({ data: { subscriber_id: id } });
    if (res.ok) {
      toast.success("Subscriber removed");
      load();
    } else toast.error(res.message || "Failed to remove");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Newsletter</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{total} subscribers</p>
      </div>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          aria-label="Search by email..."
          placeholder="Search by email..."
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
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Email
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Status
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Actions
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">
                    Subscribed
                  </th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map((sub: any) => (
                  <tr
                    key={sub.id}
                    className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {sub.email}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={
                          sub.is_active
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-gray-100 text-gray-600"
                        }
                      >
                        {sub.is_active ? "Active" : "Unsubscribed"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleDelete(sub.id, sub.email)}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {new Date(sub.subscribed_at).toLocaleDateString("en-NG", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </td>
                  </tr>
                ))}
                {subscribers.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-12 text-center text-gray-500 dark:text-gray-400"
                    >
                      <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">No subscribers yet</p>
                      <p className="text-xs mt-1">
                        Subscribers will appear after newsletter signups
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
    </div>
  );
}
