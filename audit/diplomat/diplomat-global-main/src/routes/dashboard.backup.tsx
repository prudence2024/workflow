import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Database,
  Download,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  Shield,
  FileText,
} from "lucide-react";
import { adminListAuditLogs, adminExportData } from "@/lib/admin/server-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/backup")({
  head: () => ({
    meta: [
      { title: "Backup & Restore — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: BackupPage,
});

function BackupPage() {
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const fetchAuditLogs = useServerFn(adminListAuditLogs);
  const exportData = useServerFn(adminExportData);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchAuditLogs({ data: { search: "backup" } });
      setBackups(res.logs || []);
    } catch {
      /* best-effort: use fallback */
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Backup & Restore</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Database backup status and restore options
        </p>
      </div>

      {/* Architecture explanation */}
      <Card className="bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <Database className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                How backups work
              </p>
              <p className="mt-1 text-xs leading-relaxed text-blue-700 dark:text-blue-300">
                This application stores data in Supabase PostgreSQL. Backups, restore, and
                scheduling are managed by Supabase — not this application. Your role is to verify
                your Supabase plan includes the backup features you need, and to use the Supabase
                Dashboard for any restore operations.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Supabase Backup Status */}
      <Card className="bg-white dark:bg-[#0F0F12]">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="grid size-12 place-items-center rounded-xl bg-blue-100 dark:bg-blue-900/30">
              <Database className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Supabase Automatic Backups
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Backups are provisioned and managed entirely by Supabase. Daily backups are included
                on all plans; point-in-time recovery requires Pro or above.
              </p>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-lg bg-surface p-4">
                  <p className="text-xs font-medium text-gray-500 uppercase">Daily Backups</p>
                  <p className="mt-1 text-sm font-semibold text-green-600 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle className="h-3.5 w-3.5" /> Active
                  </p>
                  <p className="mt-1 text-xs text-gray-400">Managed by Supabase</p>
                </div>
                <div className="rounded-lg bg-surface p-4">
                  <p className="text-xs font-medium text-gray-500 uppercase">
                    Point-in-Time Recovery
                  </p>
                  <p className="mt-1 text-sm font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> Check Plan
                  </p>
                  <p className="mt-1 text-xs text-gray-400">Requires Pro plan</p>
                </div>
                <div className="rounded-lg bg-surface p-4">
                  <p className="text-xs font-medium text-gray-500 uppercase">Retention</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                    Plan-dependent
                  </p>
                  <p className="mt-1 text-xs text-gray-400">Check your Supabase plan</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Manual Export */}
      <Card className="bg-white dark:bg-[#0F0F12]">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="grid size-12 place-items-center rounded-xl bg-brand/10">
              <Download className="h-6 w-6 text-brand" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Manual Data Export
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Export specific tables or your full database via the Supabase SQL Editor. This
                application does not provide a built-in export tool — use the Supabase Dashboard
                directly.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  variant="default"
                  size="sm"
                  disabled={exporting}
                  onClick={async () => {
                    setExporting(true);
                    try {
                      const res = await exportData();
                      if (res.ok && res.csv) {
                        // Download CSV (combined)
                        const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = res.filename || "diplomat-global-export.csv";
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        // Also download manifest as JSON
                        if (res.manifest) {
                          const manifestBlob = new Blob([JSON.stringify(res.manifest, null, 2)], {
                            type: "application/json",
                          });
                          const manifestUrl = URL.createObjectURL(manifestBlob);
                          const ma = document.createElement("a");
                          ma.href = manifestUrl;
                          ma.download = `diplomat-global-manifest-${new Date().toISOString().slice(0, 10)}.json`;
                          document.body.appendChild(ma);
                          ma.click();
                          document.body.removeChild(ma);
                          URL.revokeObjectURL(manifestUrl);
                        }
                        toast.success(
                          `Exported ${res.manifest?.total_rows || 0} rows from ${res.manifest?.table_count || 0} tables + manifest`,
                        );
                      } else {
                        toast.error(res.message || "Export failed");
                      }
                    } catch (err: any) {
                      toast.error(err.message || "Export failed");
                    }
                    setExporting(false);
                  }}
                >
                  <Download className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">{exporting ? "Exporting..." : "Export Application Data (CSV + Manifest)"}</span>
                  <span className="sm:hidden">{exporting ? "Exporting..." : "Export CSV"}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={exporting}
                  onClick={async () => {
                    setExporting(true);
                    try {
                      const [{ default: JSZip }, res] = await Promise.all([
                        import("jszip"),
                        exportData(),
                      ]);
                      if (res.ok && res.tableJson && res.manifest) {
                        const zip = new JSZip();
                        const dateStr = new Date().toISOString().slice(0, 10);
                        // manifest.json
                        zip.file("manifest.json", JSON.stringify(res.manifest, null, 2));
                        // schema-info.json
                        zip.file(
                          "schema-info.json",
                          JSON.stringify(
                            {
                              application: "diplomat-global",
                              exported_at: res.manifest.exported_at,
                              table_count: res.manifest.table_count,
                              total_rows: res.manifest.total_rows,
                              tables: Object.entries(res.manifest.tables).map(
                                ([name, info]: [string, any]) => ({
                                  name,
                                  row_count: info.row_count,
                                  has_error: !!info.error,
                                }),
                              ),
                            },
                            null,
                            2,
                          ),
                        );
                        // relationships.json
                        zip.file(
                          "relationships.json",
                          JSON.stringify(
                            {
                              orders: {
                                customer_id: "customers.id",
                                coupon_id: "coupons.id (nullable)",
                              },
                              order_items: {
                                order_id: "orders.id (CASCADE)",
                                product_id: "products.id (SET NULL)",
                              },
                              payment_transactions: {
                                order_id: "orders.id",
                              },
                              receipts: {
                                order_id: "orders.id",
                              },
                              expenses: {
                                created_by: "admin_users.id (nullable)",
                              },
                              reviews: {
                                product_id: "products.id",
                              },
                            },
                            null,
                            2,
                          ),
                        );
                        // tables/ directory — JSON files
                        const tablesFolder = zip.folder("tables")!;
                        for (const [table, json] of Object.entries(res.tableJson)) {
                          tablesFolder.file(`${table}.json`, json);
                        }
                        // Generate and download ZIP
                        const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `diplomat-backup-${dateStr}.zip`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        toast.success(
                          `ZIP exported: ${Object.keys(res.tableJson).length} tables, ${res.manifest.total_rows} rows`,
                        );
                      } else {
                        toast.error(res.message || "Export failed");
                      }
                    } catch (err: any) {
                      toast.error(err.message || "Export failed");
                    }
                    setExporting(false);
                  }}
                >
                  <FileText className="h-4 w-4 mr-1" /> Full ZIP Archive
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    toast.info("Use Supabase Dashboard → SQL Editor for full PostgreSQL backup")
                  }
                >
                  <FileText className="h-4 w-4 mr-1" /> Full SQL Backup Guide
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Restore Warning */}
      <Card className="bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="grid size-12 place-items-center rounded-xl bg-amber-100 dark:bg-amber-900/30">
              <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100">Restore</h2>
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                Restore must be performed through the Supabase Dashboard by an account with
                Owner-level access to your Supabase project. This is a destructive operation that
                replaces all current data with the backup snapshot. There is no undo.
              </p>
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                Before restoring, consider: (1) taking a manual export of current data, (2)
                notifying your team, (3) verifying the backup snapshot date.
              </p>
              <div className="mt-4">
                <a
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-amber-900/20 px-4 py-2 text-sm font-semibold text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition"
                >
                  <Shield className="h-4 w-4" /> Open Supabase Dashboard
                </a>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Backup Audit History */}
      <Card className="bg-white dark:bg-[#0F0F12]">
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Backup History</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Audit trail of backup-related actions
          </p>
          {backups.length === 0 ? (
            <div className="mt-6 text-center py-8 text-gray-400">
              <Database className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No backup actions recorded yet</p>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {backups.map((log: any) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 dark:border-gray-800 p-3 min-w-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="shrink-0 text-[10px]">{log.action}</Badge>
                    <span className="text-sm text-gray-600 dark:text-gray-400 truncate">
                      {log.entity_type}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
