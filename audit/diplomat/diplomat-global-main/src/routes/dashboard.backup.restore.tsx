import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { RotateCcw, ExternalLink, AlertTriangle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/dashboard/backup/restore")({
  head: () => ({
    meta: [
      { title: "Restore — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: RestorePage,
});

function RestorePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Restore & Recovery</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Database recovery is managed at the infrastructure level
        </p>
      </div>

      {/* Supabase Info */}
      <Card className="bg-white dark:bg-[#1a1a1e]">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900/30">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Infrastructure-Managed Recovery
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                No application-managed restore points are currently available in this dashboard.
                Database recovery is handled entirely by your Supabase project's
                infrastructure-level backup configuration. Consult your Supabase Dashboard for
                available backups, retention policies, and Point-in-Time Recovery options.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Restore Steps */}
      <Card className="bg-white dark:bg-[#1a1a1e]">
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            How to Restore
          </h2>
          <ol className="space-y-4 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-bold">
                1
              </span>
              <span>
                Log in to your <strong>Supabase Dashboard</strong> with an account that has
                Owner-level access to this project.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-bold">
                2
              </span>
              <span>
                Navigate to <strong>Settings → Backups</strong> in your project settings.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-bold">
                3
              </span>
              <span>
                Select the backup you want to restore from. On Pro plans, you can also use
                Point-in-Time Recovery.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-bold">
                4
              </span>
              <span>
                Follow Supabase's restore wizard. This may take several minutes depending on your
                database size.
              </span>
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* Warning */}
      <Card className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-800 dark:text-amber-200">Important</h3>
              <ul className="mt-2 space-y-1 text-sm text-amber-700 dark:text-amber-300">
                <li>
                  • Database restore will overwrite all current data with the backup snapshot.
                </li>
                <li>
                  • This action cannot be undone — make sure you have a recent backup of any
                  critical new data first.
                </li>
                <li>• Your application will experience downtime during the restore process.</li>
                <li>• Only project Owners can perform database restores in Supabase.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Link */}
      <a
        href="https://supabase.com/dashboard"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0891b2] text-white text-sm font-medium hover:opacity-90 transition"
      >
        Open Supabase Dashboard <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  );
}
