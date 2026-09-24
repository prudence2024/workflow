import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Check, X, ChevronDown, ChevronRight } from "lucide-react";
import { adminGetRoles, adminGetAllPermissions } from "@/lib/admin/server-fns";

export const Route = createFileRoute("/dashboard/permissions")({
  head: () => ({
    meta: [
      { title: "Permissions — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PermissionsPage,
});

/** Group permissions by module (e.g. "products" from "products.view") */
function groupPermissions(
  perms: { id: string; key: string; name: string; description?: string }[],
) {
  const groups: Record<string, { id: string; key: string; name: string; description?: string }[]> =
    {};
  for (const perm of perms) {
    const [module] = perm.key.split(".");
    if (!groups[module]) groups[module] = [];
    groups[module].push(perm);
  }
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([module, permissions]) => ({
      module,
      label: module.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      permissions,
    }));
}

const MODULE_ICONS: Record<string, string> = {
  analytics: "📊",
  audit: "📋",
  backup: "💾",
  blog: "📝",
  categories: "📁",
  content: "📄",
  coupons: "🎟️",
  customers: "👤",
  hero: "🖼️",
  integrations: "🔗",
  inventory: "📦",
  messages: "💬",
  newsletter: "📧",
  orders: "🛒",
  pages: "📄",
  payments: "💳",
  products: "🏷️",
  receipts: "🧾",
  refunds: "↩️",
  reviews: "⭐",
  roles: "🛡️",
  settings: "⚙️",
  social_links: "📱",
  staff: "👥",
  testimonials: "💬",
  transactions: "💰",
};

function PermissionsPage() {
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<Record<string, string[]>>({});
  const [allPermissions, setAllPermissions] = useState<any[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const fetchRoles = useServerFn(adminGetRoles);
  const fetchAllPerms = useServerFn(adminGetAllPermissions);

  useEffect(() => {
    (async () => {
      const [rolesRes, permsRes] = await Promise.all([fetchRoles(), fetchAllPerms()]);
      if (rolesRes.roles) setRoles(rolesRes.roles);
      if (rolesRes.permissions) setPermissions(rolesRes.permissions);
      if (permsRes.permissions) {
        setAllPermissions(permsRes.permissions);
        // Expand all groups by default
        const groups = new Set(
          permsRes.permissions.map((p: { key: string }) => p.key.split(".")[0]),
        );
        setExpandedGroups(groups);
      }
    })();
  }, []);

  const toggleGroup = (module: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  };

  const grouped = groupPermissions(allPermissions);

  const getPermCount = (roleId: string) => (permissions[roleId] || []).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Permissions</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Role-based access control matrix · {allPermissions.length} permissions across{" "}
          {roles.length} roles
        </p>
      </div>

      <Card className="bg-white dark:bg-[#0F0F12]">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase min-w-[200px]">
                  Permission
                </th>
                {roles.map((r: any) => (
                  <th
                    key={r.id}
                    className="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase"
                  >
                    <div>{r.name}</div>
                    <div className="text-[10px] font-normal normal-case text-gray-400 mt-0.5">
                      {getPermCount(r.id)} perms
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map((group) => {
                const isExpanded = expandedGroups.has(group.module);

                return (
                  <React.Fragment key={group.module}>
                    {/* Group header row */}
                    <tr className="border-b border-gray-100 dark:border-gray-800/50 bg-gray-50 dark:bg-gray-800/30">
                      <td
                        colSpan={roles.length + 1}
                        className="px-4 py-2.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800/50"
                        onClick={() => toggleGroup(group.module)}
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-400" />
                          )}
                          <span className="text-sm" aria-hidden="true">
                            {MODULE_ICONS[group.module] || "🔧"}
                          </span>
                          <span className="font-semibold text-gray-900 dark:text-white">
                            {group.label}
                          </span>
                          <span className="text-xs text-gray-400">
                            ({group.permissions.length})
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* Permission rows */}
                    {isExpanded &&
                      group.permissions.map((perm) => (
                        <tr
                          key={perm.key}
                          className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/20"
                        >
                          <td className="px-4 py-2 pl-10">
                            <div className="text-sm text-gray-900 dark:text-white">{perm.name}</div>
                            {perm.description && (
                              <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                                {perm.description}
                              </div>
                            )}
                          </td>
                          {roles.map((r: any) => {
                            const rolePerms = permissions[r.id] || [];
                            const hasPerm = rolePerms.includes("*") || rolePerms.includes(perm.key);
                            return (
                              <td key={r.id} className="text-center px-3 py-2">
                                {hasPerm ? (
                                  <Check className="h-4 w-4 text-green-500 mx-auto" />
                                ) : (
                                  <X className="h-4 w-4 text-gray-300 dark:text-gray-600 mx-auto" />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
