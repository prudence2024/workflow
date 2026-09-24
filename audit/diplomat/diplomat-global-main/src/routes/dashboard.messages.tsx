import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Search, Mail, MailOpen, Trash2 } from "lucide-react";
import {
  adminListMessages,
  adminMarkMessageRead,
  adminDeleteMessage,
} from "@/lib/admin/server-fns";
import { Pagination } from "@/components/admin/pagination";
import { toast } from "sonner";

const searchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).catch(1),
  search: z.string().optional().default(""),
});

export const Route = createFileRoute("/dashboard/messages")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Messages — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: MessagesPage,
});

function MessagesPage() {
  const { page: urlPage, search: urlSearch } = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard/messages" });
  const [search, setSearch] = useState(urlSearch || "");
  const [messages, setMessages] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(urlPage || 1);
  const [loading, setLoading] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const fetchMessages = useServerFn(adminListMessages);
  const markRead = useServerFn(adminMarkMessageRead);
  const deleteMsg = useServerFn(adminDeleteMessage);

  const load = async () => {
    setLoading(true);
    const res = await fetchMessages({
      data: { search, unread_only: unreadOnly, page, pageSize: 10 },
    });
    setMessages(res.messages || []);
    setTotal(res.total || 0);
    setLoading(false);
  };

  useEffect(() => {
    setPage(1);
    navigate({ search: { page: 1, search }, replace: true });
  }, [search, unreadOnly]);
  useEffect(() => {
    if (page !== urlPage) navigate({ search: { page, search }, replace: true });
  }, [page]);
  useEffect(() => {
    load();
  }, [page, search, unreadOnly]);

  const handleMarkRead = async (id: string) => {
    const res = await markRead({ data: { message_id: id } });
    if (res.ok) {
      toast.success("Marked as read");
      load();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this message?")) return;
    const res = await deleteMsg({ data: { message_id: id } });
    if (res.ok) {
      toast.success("Message deleted");
      load();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Messages</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {total} contact form submissions
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            aria-label="Search messages..."
            placeholder="Search messages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          variant={unreadOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setUnreadOnly(!unreadOnly)}
        >
          <Mail className="h-4 w-4 mr-2" /> {unreadOnly ? "Unread only" : "Show all"}
        </Button>
      </div>
      <div className="space-y-3">
        {messages.map((msg: any) => (
          <Card
            key={msg.id}
            className={`bg-white dark:bg-[#1a1a1e] border-gray-200 dark:border-[#2a2a2e] ${!msg.is_read ? "border-l-4 border-l-blue-500" : ""}`}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {msg.name}
                    </span>
                    <span className="text-xs text-gray-500">{msg.email}</span>
                    {!msg.is_read && (
                      <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                        New
                      </Badge>
                    )}
                  </div>
                  {msg.subject && (
                    <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                      {msg.subject}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{msg.message}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {new Date(msg.created_at).toLocaleString("en-NG")}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!msg.is_read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-blue-600"
                      onClick={() => handleMarkRead(msg.id)}
                      title="Mark as read"
                    >
                      <MailOpen className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-red-500"
                    onClick={() => handleDelete(msg.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {messages.length === 0 && !loading && (
          <Card className="bg-white dark:bg-[#0F0F12]">
            <CardContent className="p-8 text-center">
              <MessageSquare className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                No messages yet
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Messages from the contact form will appear here
              </p>
            </CardContent>
          </Card>
        )}
      </div>
      <Pagination page={page} totalItems={total} pageSize={10} onPageChange={setPage} />
    </div>
  );
}
