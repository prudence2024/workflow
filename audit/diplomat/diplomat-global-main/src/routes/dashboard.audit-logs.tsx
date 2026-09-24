import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Shield,
  Search,
  X,
  Clock,
  Globe,
  User,
  MapPin,
  FileText,
  AlertTriangle,
  CheckCircle,
  LogIn,
  Settings,
  DollarSign,
  Users,
  Activity,
} from "lucide-react";
import {
  adminListAuditLogs,
  adminMarkAllNotificationsRead,
  adminDeleteAuditLogs,
  adminClearAuditLogsBefore,
} from "@/lib/admin/server-fns";
import { toast } from "sonner";
import { Pagination } from "@/components/admin/pagination";

/** Human-readable action labels */
const ACTION_LABELS: Record<string, string> = {
  unauthorized_admin_access: "Unauthorized admin access attempt",
  inactive_admin_access: "Inactive admin access attempt",
  admin_session_started: "Admin session started",
  admin_permission_denied: "Permission denied",
  "member.invite": "Staff invitation created",
  "member.invite.failed": "Staff invitation failed",
  "member.invite.partial": "Staff invitation partial failure",
  "product.create": "Product created",
  "product.update": "Product updated",
  "product.archive": "Product archived",
  "coupon.create": "Coupon created",
  "coupon.update": "Coupon updated",
  "coupon.delete": "Coupon deleted",
  "customer.update": "Customer updated",
  "email.marketing": "Marketing email sent",
  "email.transactional": "Transactional email sent",
  "contacts.import": "Contacts imported",
  "settings.update": "Settings updated",
};

/** Category filters for audit log categorization */
interface AuditFilter {
  id: string;
  label: string;
  icon: React.ReactNode;
  predicate: (log: any) => boolean;
}

function getAuditFilters(): AuditFilter[] {
  return [
    { id: "all", label: "All", icon: <Activity className="h-3.5 w-3.5" />, predicate: () => true },
    {
      id: "security",
      label: "Security",
      icon: <Shield className="h-3.5 w-3.5" />,
      predicate: (l) =>
        l.entity_type === "security" ||
        l.action.includes("unauthorized") ||
        l.action.includes("permission_denied"),
    },
    {
      id: "login",
      label: "Login Activity",
      icon: <LogIn className="h-3.5 w-3.5" />,
      predicate: (l) => l.action === "admin_session_started" || l.action === "admin_session_ended",
    },
    {
      id: "staff",
      label: "Staff / RBAC",
      icon: <Users className="h-3.5 w-3.5" />,
      predicate: (l) =>
        l.action.startsWith("member.") || l.action.includes("staff") || l.action.includes("role"),
    },
    {
      id: "system",
      label: "System Changes",
      icon: <Settings className="h-3.5 w-3.5" />,
      predicate: (l) =>
        l.action.includes("settings") ||
        l.action.includes("product") ||
        l.action.includes("category") ||
        l.action.includes("hero") ||
        l.action.includes("blog"),
    },
    {
      id: "financial",
      label: "Financial / Sensitive",
      icon: <DollarSign className="h-3.5 w-3.5" />,
      predicate: (l) =>
        l.action.includes("coupon") ||
        l.action.includes("refund") ||
        l.action.includes("order") ||
        l.action.includes("payment") ||
        l.action.includes("expense"),
    },
  ];
}

function humanizeAction(action: string): string {
  return (
    ACTION_LABELS[action] || action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function getActionBadgeVariant(
  action: string,
): "destructive" | "default" | "secondary" | "outline" {
  if (action.includes("unauthorized") || action.includes("inactive") || action.includes("failed"))
    return "destructive";
  if (action.includes("established") || action.includes("created") || action.includes("update"))
    return "default";
  return "outline";
}

function getResultIcon(result: string | undefined) {
  if (result === "blocked") return <AlertTriangle className="h-4 w-4 text-red-500" />;
  if (result === "authorized") return <CheckCircle className="h-4 w-4 text-green-500" />;
  return <Shield className="h-4 w-4 text-gray-400" />;
}

export const Route = createFileRoute("/dashboard/audit-logs")({
  validateSearch: (search: Record<string, unknown>) => ({
    event: search.event ? String(search.event) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Audit Logs — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AuditLogsPage,
});

function AuditLogsPage() {
  const { event: highlightEventId } = Route.useSearch();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const filters = getAuditFilters();

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [clearDate, setClearDate] = useState("");

  const fetchLogs = useServerFn(adminListAuditLogs);
  const markAllRead = useServerFn(adminMarkAllNotificationsRead);
  const deleteLogs = useServerFn(adminDeleteAuditLogs);
  const clearBefore = useServerFn(adminClearAuditLogsBefore);

  const load = async () => {
    setLoading(true);
    const res = await fetchLogs({ data: { search, page, pageSize: 10, category: activeFilter } });
    setLogs(res.logs || []);
    setTotal(res.total || 0);
    setLoading(false);
    // If URL has event param, auto-open that event's detail drawer
    if (highlightEventId) {
      const match = (res.logs || []).find((l: any) => String(l.id) === highlightEventId);
      if (match) setSelectedLog(match);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [search, activeFilter]);
  useEffect(() => {
    load();
    markAllRead().catch(() => {});
  }, [page, search, activeFilter]);

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Permanently delete ${selectedIds.size} audit log(s)? This cannot be undone.`))
      return;
    const res = await deleteLogs({ data: { ids: Array.from(selectedIds) } });
    if (res.ok) {
      toast.success(`Deleted ${res.deleted} audit log(s)`);
      setSelectedIds(new Set());
      load();
    } else {
      toast.error(res.message || "Delete failed");
    }
  };

  const handleClearBefore = async () => {
    if (!clearDate) return;
    if (!confirm(`Permanently delete ALL audit logs before ${clearDate}? This cannot be undone.`))
      return;
    const res = await clearBefore({ data: { before_date: clearDate } });
    if (res.ok) {
      toast.success(`Deleted ${res.deleted} audit log(s) before ${clearDate}`);
      setShowClearDialog(false);
      setClearDate("");
      load();
    } else {
      toast.error(res.message || "Clear failed");
    }
  };

  const toggleSelectLog = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Server handles category filtering now; logs are already filtered
  const filteredLogs = logs;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Audit Logs</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {total} security and administration events
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            aria-label="Search by action or entity..."
            placeholder="Search by action or entity..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${
                  activeFilter === f.id
                    ? "bg-[#0891b2] text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
            >
              {f.icon}
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {/* Delete controls */}
      <div className="flex items-center gap-3">
        {selectedIds.size > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteSelected}
            className="gap-1.5"
          >
            Delete {selectedIds.size} selected
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowClearDialog(!showClearDialog)}
          className="text-gray-500"
        >
          Clear old logs...
        </Button>
        {showClearDialog && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={clearDate}
              onChange={(e) => setClearDate(e.target.value)}
              className="px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm"
            />
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearBefore}
              disabled={!clearDate}
            >
              Clear
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowClearDialog(false)}>
              Cancel
            </Button>
          </div>
        )}
      </div>
      <Card className="bg-white dark:bg-[#0F0F12]">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredLogs.length && filteredLogs.length > 0}
                      onChange={() => {
                        if (selectedIds.size === filteredLogs.length) {
                          setSelectedIds(new Set());
                        } else {
                          setSelectedIds(new Set(filteredLogs.map((l: any) => l.id)));
                        }
                      }}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Action
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Entity
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden sm:table-cell">
                    Actor
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log: any) => (
                  <tr
                    key={log.id}
                    className={`border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors ${selectedIds.has(log.id) ? "bg-blue-50 dark:bg-blue-900/10" : ""}`}
                  >
                    <td className="w-10 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(log.id)}
                        onChange={() => toggleSelectLog(log.id)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3" onClick={() => setSelectedLog(log)}>
                      <Badge variant={getActionBadgeVariant(log.action)} className="text-xs">
                        {humanizeAction(log.action)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3" onClick={() => setSelectedLog(log)}>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {log.entity_type}
                      </span>
                      {log.entity_id && (
                        <span className="text-xs text-gray-400 ml-1">
                          ({log.entity_id.slice(0, 8)}…)
                        </span>
                      )}
                    </td>
                    <td
                      className="px-4 py-3 hidden sm:table-cell"
                      onClick={() => setSelectedLog(log)}
                    >
                      <div className="text-xs">
                        {log.metadata?.display_name || log.metadata?.verified_email ? (
                          <>
                            {log.metadata?.display_name && (
                              <div className="font-medium text-gray-700 dark:text-gray-300">
                                {log.metadata.display_name}
                              </div>
                            )}
                            {log.metadata?.verified_email && (
                              <div className="text-gray-500 dark:text-gray-400 truncate max-w-[180px]">
                                {log.metadata.verified_email}
                              </div>
                            )}
                            {log.metadata?.role && (
                              <Badge variant="outline" className="mt-0.5 text-[10px]">
                                {log.metadata.role}
                              </Badge>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-500 font-mono">
                            {log.clerk_user_id?.slice(0, 20) || "system"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {new Date(log.created_at).toLocaleString("en-NG")}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredLogs.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-12 text-center text-gray-500 dark:text-gray-400"
                    >
                      <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">No events in this category</p>
                      <p className="text-xs mt-1">
                        Audit entries matching this filter will appear here
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Pagination page={page} totalItems={total} pageSize={10} onPageChange={setPage} />

      {/* Audit Detail Drawer */}
      {selectedLog && <AuditDetailDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />}
    </div>
  );
}

function AuditDetailDrawer({ log, onClose }: { log: any; onClose: () => void }) {
  const meta = log.metadata || {};
  const result = meta.result || "unknown";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      {/* Drawer */}
      <div className="relative bg-white dark:bg-[#0F0F12] rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto border border-gray-200 dark:border-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            {getResultIcon(result)}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {humanizeAction(log.action)}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{log.action}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="p-2">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Result */}
          <DetailRow
            icon={<Shield className="h-4 w-4" />}
            label="Result"
            value={
              <Badge
                variant={
                  result === "blocked"
                    ? "destructive"
                    : result === "authorized"
                      ? "default"
                      : "outline"
                }
              >
                {result}
              </Badge>
            }
          />

          {/* Display Name */}
          {meta.display_name && (
            <DetailRow
              icon={<User className="h-4 w-4" />}
              label="Name"
              value={<span className="text-sm font-medium">{meta.display_name}</span>}
            />
          )}

          {/* Actor */}
          <DetailRow
            icon={<User className="h-4 w-4" />}
            label="Actor (Clerk ID)"
            value={
              <span className="font-mono text-xs break-all">{log.clerk_user_id || "unknown"}</span>
            }
          />

          {/* Session ID */}
          {meta.session_id && (
            <DetailRow
              icon={<FileText className="h-4 w-4" />}
              label="Session ID"
              value={<span className="font-mono text-xs break-all">{meta.session_id}</span>}
            />
          )}

          {/* Verified Email */}
          {meta.verified_email && (
            <DetailRow
              icon={<FileText className="h-4 w-4" />}
              label="Verified Email"
              value={<span className="text-sm">{meta.verified_email}</span>}
            />
          )}

          {/* Route */}
          {meta.route && (
            <DetailRow
              icon={<MapPin className="h-4 w-4" />}
              label="Requested Route"
              value={
                <span className="font-mono text-sm">
                  {meta.method && <span className="text-gray-400 mr-1">{meta.method}</span>}
                  {meta.route}
                </span>
              }
            />
          )}

          {/* Reason */}
          {meta.reason && (
            <DetailRow
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Reason"
              value={<span className="text-sm">{meta.reason}</span>}
            />
          )}

          {/* Role */}
          {meta.role && (
            <DetailRow
              icon={<User className="h-4 w-4" />}
              label="Role"
              value={<Badge variant="outline">{meta.role}</Badge>}
            />
          )}

          {/* IP Address */}
          <DetailRow
            icon={<Globe className="h-4 w-4" />}
            label="IP Address"
            value={<span className="font-mono text-sm">{log.ip_address || "not captured"}</span>}
          />

          {/* User Agent */}
          {log.user_agent && (
            <DetailRow
              icon={<Globe className="h-4 w-4" />}
              label="User Agent"
              value={
                <span className="text-xs break-all text-gray-500 dark:text-gray-400">
                  {log.user_agent}
                </span>
              }
            />
          )}

          {/* Entity */}
          <DetailRow
            icon={<FileText className="h-4 w-4" />}
            label="Entity"
            value={
              <span className="text-sm">
                {log.entity_type}
                {log.entity_id && <span className="text-gray-400 ml-1">({log.entity_id})</span>}
              </span>
            }
          />

          {/* Date/Time */}
          <DetailRow
            icon={<Clock className="h-4 w-4" />}
            label="Date/Time"
            value={
              <span className="text-sm">
                {new Date(log.created_at).toLocaleString("en-NG", {
                  dateStyle: "full",
                  timeStyle: "long",
                })}
              </span>
            }
          />

          {/* Full Metadata */}
          {Object.keys(meta).length > 0 && (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                Raw Metadata
              </p>
              <pre className="text-xs bg-gray-50 dark:bg-gray-900 rounded-lg p-3 overflow-x-auto text-gray-600 dark:text-gray-400 font-mono">
                {JSON.stringify(meta, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-gray-400">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
        <div className="mt-0.5">{value}</div>
      </div>
    </div>
  );
}
