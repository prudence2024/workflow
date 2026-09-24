import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Plus,
  Edit,
  Trash2,
  X,
  Lock,
  Users,
  ChevronDown,
  ChevronRight,
  Save,
  CheckSquare,
  Square,
} from "lucide-react";
import {
  adminGetRoles,
  adminGetAllPermissions,
  adminListMembers,
  adminUpdateMemberRole,
  adminCreateRole,
  adminUpdateRole,
  adminDeleteRole,
} from "@/lib/admin/server-fns";
import { toast } from "sonner";
import { CustomSelect } from "@/components/ui/custom-select";

export const Route = createFileRoute("/dashboard/roles")({
  head: () => ({
    meta: [
      { title: "Roles — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: RolesPage,
});

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  admin: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  sales_manager: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  sales_rep: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
  finance: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  editor: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  support: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
  viewer: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400",
};

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
  // Sort modules alphabetically
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

function RolesPage() {
  const [roles, setRoles] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<Record<string, string[]>>({});
  const [allPermissions, setAllPermissions] = useState<any[]>([]);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const [editPerms, setEditPerms] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [newRole, setNewRole] = useState({ name: "", key: "", description: "" });
  const [savingPerms, setSavingPerms] = useState(false);

  const fetchRoles = useServerFn(adminGetRoles);
  const fetchAllPerms = useServerFn(adminGetAllPermissions);
  const fetchMembers = useServerFn(adminListMembers);
  const updateMemberRole = useServerFn(adminUpdateMemberRole);
  const createRole = useServerFn(adminCreateRole);
  const updateRole = useServerFn(adminUpdateRole);
  const deleteRole = useServerFn(adminDeleteRole);

  const load = useCallback(async () => {
    const [r, m, p] = await Promise.all([fetchRoles(), fetchMembers(), fetchAllPerms()]);
    if (r.roles) setRoles(r.roles);
    if (r.permissions) setPermissions(r.permissions);
    if (m.members) setMembers(m.members);
    if (p.permissions) setAllPermissions(p.permissions);
  }, []);

  useEffect(() => {
    load();
  }, []);

  const getMemberCount = (roleId: string) =>
    members.filter((m: any) => m.role_id === roleId).length;
  const getActiveCount = (roleId: string) =>
    members.filter((m: any) => m.role_id === roleId && m.active).length;
  const getPendingCount = (roleId: string) =>
    members.filter((m: any) => m.role_id === roleId && !m.active && !m.clerk_user_id).length;

  const isOwner = (roleId: string) => {
    const role = roles.find((r: any) => r.id === roleId);
    return role?.key === "owner";
  };

  const handleCreateRole = async () => {
    if (!newRole.name || !newRole.key) {
      toast.error("Name and key are required");
      return;
    }
    const res = await createRole({
      data: {
        name: newRole.name,
        key: newRole.key.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
        description: newRole.description,
      },
    });
    if (res.ok) {
      toast.success("Role created");
      setShowCreateRole(false);
      setNewRole({ name: "", key: "", description: "" });
      load();
    } else toast.error(res.message);
  };

  const handleRoleChange = async (memberId: string, newRole: string, memberName: string) => {
    if (!confirm(`Change ${memberName}'s role?`)) return;
    const res = await updateMemberRole({ data: { member_id: memberId, role: newRole } });
    if (res.ok) {
      toast.success("Role updated — access changes take effect immediately");
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role_id: newRole } : m)));
    } else toast.error(res.message);
  };

  const handleEditRole = (roleId: string) => {
    if (isOwner(roleId)) {
      toast.error("Cannot edit Owner role");
      return;
    }
    setEditingRole(roleId);
    const role = roles.find((r: any) => r.id === roleId);
    setEditForm({ name: role?.name || "", description: role?.description || "" });
    // Load current permissions for this role
    setEditPerms(new Set(permissions[roleId] || []));
    setExpandedGroups(new Set());
  };

  const togglePerm = (key: string) => {
    setEditPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleGroup = (groupPerms: { key: string }[]) => {
    const keys = groupPerms.map((p) => p.key);
    const allSelected = keys.every((k) => editPerms.has(k));
    setEditPerms((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (allSelected) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  const toggleGroupExpanded = (module: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  };

  const handleSavePermissions = async () => {
    if (!editingRole) return;
    if (!editForm.name.trim()) {
      toast.error("Role name is required");
      return;
    }
    setSavingPerms(true);
    // Map permission keys to IDs
    const permIds = allPermissions.filter((p) => editPerms.has(p.key)).map((p) => p.id);
    const res = await updateRole({
      data: {
        role_id: editingRole,
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        permission_ids: permIds,
      },
    });
    setSavingPerms(false);
    if (res.ok) {
      toast.success("Role updated — permissions take effect immediately");
      setEditingRole(null);
      load();
    } else toast.error(res.message);
  };

  const handleDeleteRole = async (roleId: string, roleName: string) => {
    if (isOwner(roleId)) {
      toast.error("Cannot delete Owner role");
      return;
    }
    if (!confirm(`Delete the "${roleName}" role? Members with this role will lose access.`)) return;
    const res = await deleteRole({ data: { role_id: roleId } });
    if (res.ok) {
      toast.success("Role deleted");
      load();
    } else toast.error(res.message);
  };

  const grouped = groupPermissions(allPermissions);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Roles & Permissions</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {roles.length} defined roles · {allPermissions.length} permissions · {members.length}{" "}
            total members
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateRole(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0891b2] text-white rounded-lg text-sm font-medium hover:opacity-90 transition"
        >
          <Plus className="h-4 w-4" /> Create Role
        </button>
      </div>

      {showCreateRole && (
        <Card className="bg-white dark:bg-[#1a1a1e]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Create New Role
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowCreateRole(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                Role Name *
                <input
                  type="text"
                  value={newRole.name}
                  onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                  placeholder="e.g. QA Tester"
                  className="appearance-none px-3 py-2.5 pr-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                Key (auto-generated)
                <input
                  type="text"
                  value={newRole.key || newRole.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}
                  readOnly
                  className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm font-mono"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                Description
                <input
                  type="text"
                  value={newRole.description}
                  onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                  placeholder="What this role can do"
                  className="appearance-none px-3 py-2.5 pr-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                onClick={handleCreateRole}
                className="bg-[#0891b2] text-white hover:opacity-90"
              >
                Create Role
              </Button>
              <Button variant="outline" onClick={() => setShowCreateRole(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Permission Editor (when editing a role) */}
      {editingRole && (
        <Card className="bg-white dark:bg-[#1a1a1e] border-brand/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Edit Role: {editForm.name}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Configure what this role can access
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEditingRole(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Name & Description */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-300">Role Name</span>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="appearance-none px-3 py-2.5 pr-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-300">Description</span>
                <input
                  type="text"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="appearance-none px-3 py-2.5 pr-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
            </div>

            {/* Permission Groups */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Permissions ({editPerms.size} of {allPermissions.length} selected)
                </h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditPerms(new Set(allPermissions.map((p) => p.key)));
                    }}
                    className="text-xs text-brand hover:underline"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditPerms(new Set())}
                    className="text-xs text-gray-500 hover:underline"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {grouped.map((group) => {
                const groupKeys = group.permissions.map((p) => p.key);
                const selectedCount = groupKeys.filter((k) => editPerms.has(k)).length;
                const allSelected = selectedCount === groupKeys.length;
                const someSelected = selectedCount > 0 && !allSelected;
                const isExpanded = expandedGroups.has(group.module);

                return (
                  <div
                    key={group.module}
                    className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden"
                  >
                    {/* Group Header */}
                    <div
                      className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                      onClick={() => toggleGroupExpanded(group.module)}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleGroup(group.permissions);
                        }}
                        className="flex-shrink-0"
                      >
                        {allSelected ? (
                          <CheckSquare className="h-4 w-4 text-brand" />
                        ) : someSelected ? (
                          <div className="h-4 w-4 border-2 border-brand rounded bg-brand/20 flex items-center justify-center">
                            <div className="h-1.5 w-1.5 bg-brand rounded-sm" />
                          </div>
                        ) : (
                          <Square className="h-4 w-4 text-gray-400" />
                        )}
                      </button>
                      <span className="text-sm" aria-hidden="true">
                        {MODULE_ICONS[group.module] || "🔧"}
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white flex-1">
                        {group.label}
                      </span>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {selectedCount}/{groupKeys.length}
                      </Badge>
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      )}
                    </div>

                    {/* Expanded permissions */}
                    {isExpanded && (
                      <div className="px-4 py-3 space-y-2 border-t border-gray-100 dark:border-gray-800">
                        {group.permissions.map((perm) => (
                          <label
                            key={perm.key}
                            className="flex items-center gap-3 cursor-pointer group"
                            onClick={() => togglePerm(perm.key)}
                          >
                            <input
                              type="checkbox"
                              checked={editPerms.has(perm.key)}
                              onChange={() => togglePerm(perm.key)}
                              className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/30"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-gray-900 dark:text-white">
                                {perm.name}
                              </span>
                              <span className="ml-2 text-xs font-mono text-gray-400">
                                {perm.key}
                              </span>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Save / Cancel */}
            <div className="mt-6 flex gap-3">
              <Button
                onClick={handleSavePermissions}
                disabled={savingPerms}
                className="bg-[#0891b2] text-white hover:opacity-90 gap-2"
              >
                <Save className="h-4 w-4" />
                {savingPerms ? "Saving..." : "Save Permissions"}
              </Button>
              <Button variant="outline" onClick={() => setEditingRole(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Role Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {roles.map((role: any) => (
          <Card key={role.id} className="bg-white dark:bg-[#0F0F12]">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div
                    className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                      isOwner(role.id)
                        ? "bg-purple-100 dark:bg-purple-900/30"
                        : "bg-gray-100 dark:bg-gray-800"
                    }`}
                  >
                    {isOwner(role.id) ? (
                      <Lock className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    ) : (
                      <Shield className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {role.name}
                      </p>
                      {isOwner(role.id) && (
                        <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 text-[10px]">
                          Protected
                        </Badge>
                      )}
                      {role.is_system && !isOwner(role.id) && (
                        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px]">
                          System
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {role.description}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 font-mono">
                      {permissions[role.id]?.length || 0} permissions · {getActiveCount(role.id)}{" "}
                      active members
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Badge
                    className={ROLE_COLORS[role.key] || "bg-gray-100 text-gray-800"}
                    title={`${getActiveCount(role.id)} active, ${getPendingCount(role.id)} pending`}
                  >
                    <Users className="h-3 w-3 mr-1" />
                    {getActiveCount(role.id)}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => handleEditRole(role.id)}
                    title="Edit role & permissions"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  {!isOwner(role.id) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                      onClick={() => handleDeleteRole(role.id, role.name)}
                      title="Delete role"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Quick permission preview */}
              {!editingRole && permissions[role.id] && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <div className="flex flex-wrap gap-1.5">
                    {permissions[role.id].slice(0, 8).map((perm: string) => (
                      <Badge key={perm} variant="outline" className="text-[10px] font-mono">
                        {perm}
                      </Badge>
                    ))}
                    {permissions[role.id].length > 8 && (
                      <Badge variant="outline" className="text-[10px] text-gray-400">
                        +{permissions[role.id].length - 8} more
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Members with role assignment */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Team Members</h2>
        <Card className="bg-white dark:bg-[#0F0F12]">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                      Member
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                      Role
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                      Joined
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member: any) => (
                    <tr
                      key={member.id}
                      className="border-b border-gray-100 dark:border-gray-800/50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-brand/10 flex items-center justify-center text-brand text-xs font-semibold">
                            {member.email?.slice(0, 2).toUpperCase() || "??"}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {member.email || member.display_name || "Unknown"}
                            </p>
                            {member.display_name && (
                              <p className="text-xs text-gray-500">{member.display_name}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {isOwner(member.role_id) ? (
                          <Badge className={ROLE_COLORS["owner"]}>
                            <Lock className="h-3 w-3 mr-1" /> Owner
                          </Badge>
                        ) : (
                          <CustomSelect
                            value={member.role_id}
                            onChange={(v) =>
                              handleRoleChange(
                                member.id,
                                v,
                                member.email || member.display_name || "Unknown",
                              )
                            }
                            options={roles
                              .filter((r: any) => r.key !== "owner")
                              .map((r: any) => ({ value: r.id, label: r.name }))}
                            variant="admin"
                            className="text-xs"
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          className={
                            member.active
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-red-100 text-red-800"
                          }
                        >
                          {member.active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-sm text-gray-500">
                          {member.created_at
                            ? new Date(member.created_at).toLocaleDateString("en-NG", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
