import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, ExternalLink, Calendar, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/dashboard/backup/schedule")({
  head: () => ({
    meta: [
      { title: "Backup Schedule — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: SchedulePage,
});

function SchedulePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Backup Schedule</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Automatic backup configuration managed by Supabase
        </p>
      </div>

      {/* Current Schedule */}
      <Card className="bg-white dark:bg-[#1a1a1e]">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/30">
              <Calendar className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Automatic Daily Backups
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                Supabase automatically backs up your database every day. The schedule is managed by
                Supabase infrastructure and cannot be configured from this admin panel.
              </p>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Backup Type
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                    Managed by Supabase
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Frequency</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                    Automatic
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Configuration
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                    View in Supabase Dashboard
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* PITR Info */}
      <Card className="bg-white dark:bg-[#1a1a1e]">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900/30">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Point-in-Time Recovery (PITR)
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                Available on Supabase Pro plans and above. PITR allows you to restore your database
                to any point in time within the retention window, giving you more granular recovery
                than daily snapshots alone.
              </p>
              <ul className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                <li>• Availability depends on your Supabase plan — check your project settings</li>
                <li>• Allows recovery to any point within the retention window</li>
                <li>• Enable and manage in your Supabase Dashboard</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Manage */}
      <Card className="bg-white dark:bg-[#1a1a1e]">
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            Manage Backups
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            To view backup history, configure retention, or enable PITR, visit your Supabase project
            settings.
          </p>
          <a
            href="https://supabase.com/dashboard/project/_/settings/backups"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0891b2] text-white text-sm font-medium hover:opacity-90 transition"
          >
            Open Backup Settings <ExternalLink className="h-4 w-4" />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
