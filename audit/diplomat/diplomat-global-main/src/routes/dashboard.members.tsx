import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useUser } from "@clerk/tanstack-react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users2, Shield, UserCheck, UserX, Trash2 } from "lucide-react";
import {
  adminListMembers,
  adminUpdateMemberRole,
  adminToggleMemberActive,
  adminDeleteMember,
  adminInviteStaff,
} from "@/lib/admin/server-fns";
import { Pagination } from "@/components/admin/pagination";
import { CustomSelect } from "@/components/ui/custom-select";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/members")({
  head: () => ({
    meta: [
      { title: "Members — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: MembersPage,
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

function MembersPage() {
  const { user } = useUser();
  const [members, setMembers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("");
  const [inviting, setInviting] = useState(false);

  const fetchMembers = useServerFn(adminListMembers);
  const updateRole = useServerFn(adminUpdateMemberRole);
  const toggleActive = useServerFn(adminToggleMemberActive);
  const deleteMember = useServerFn(adminDeleteMember);
  const inviteStaff = useServerFn(adminInviteStaff);

  const load = async () => {
    setLoading(true);
    const res = await fetchMembers({ data: { page, pageSize: 10 } });
    setMembers(res.members || []);
    setRoles(res.roles || []);
    setTotal(res.total || 0);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [page]);

  const handleRoleChange = async (memberId: string, newRole: string) => {
    const res = await updateRole({ data: { member_id: memberId, role: newRole } });
    if (res.ok) {
      toast.success("Role updated");
      load();
    } else toast.error(res.message);
  };

  const handleInvite = async () => {
    if (!inviteEmail || !inviteRole) {
      toast.error("Email and role are required");
      return;
    }
    setInviting(true);
    try {
      const res = await inviteStaff({ data: { email: inviteEmail, role: inviteRole } });
      if (res.ok) {
        toast.success(`Invitation sent to ${inviteEmail}`);
        setInviteEmail("");
        setInviteRole("");
        setShowInvite(false);
        load();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to send invitation.");
    } finally {
      setInviting(false);
    }
  };

  const handleToggleActive = async (memberId: string, active: boolean) => {
    const res = await toggleActive({ data: { member_id: memberId, active } });
    if (res.ok) {
      toast.success(active ? "Member activated" : "Member deactivated");
      load();
    } else toast.error(res.message);
  };

  const handleDeleteMember = async (memberId: string, email: string) => {
    if (!confirm(`Remove access for ${email}? They will need a new invitation to regain access.`))
      return;
    const res = await deleteMember({ data: { member_id: memberId } });
    if (res.ok) {
      toast.success("Member access removed. They must be re-invited to regain access.");
      load();
    } else toast.error(res.message);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Members</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage staff access and roles
        </p>
      </div>

      {/* Invite Staff */}
      <Card className="bg-white dark:bg-[#0F0F12]">
        <CardContent className="p-4">
          {!showInvite ? (
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => {
                setShowInvite(true);
                if (!inviteRole && roles.length)
                  setInviteRole(roles.find((r: any) => r.id !== "owner")?.id || "");
              }}
            >
              Invite Staff
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="email"
                  placeholder="Email address"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="appearance-none min-h-10 pr-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 text-sm text-gray-900 dark:text-white"
                />
                <CustomSelect
                  value={inviteRole}
                  onChange={setInviteRole}
                  options={[
                    { value: "", label: "Select role..." },
                    ...roles
                      .filter((r: any) => r.id !== "owner")
                      .map((r: any) => ({ value: r.id, label: r.name })),
                  ]}
                  variant="admin"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={handleInvite}
                    disabled={inviting}
                  >
                    {inviting ? "Sending..." : "Send Invitation"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowInvite(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
              {inviteRole && (
                <p className="text-xs text-gray-500">
                  {roles.find((r: any) => r.id === inviteRole)?.description || ""}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-[#0F0F12]">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    Member
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">
                    Role
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                    Joined
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((member: any) => {
                  const isCurrentUser = member.clerk_user_id === user?.id;
                  const isPending = !member.clerk_user_id;
                  const displayName =
                    member.email || member.clerk_user_id?.slice(0, 20) + "…" || "??";
                  const initials = isPending
                    ? (member.email?.[0] || "?").toUpperCase()
                    : member.clerk_user_id?.slice(-2)?.toUpperCase() || "??";
                  const roleName = member.roles?.name || member.role || "—";
                  return (
                    <tr
                      key={member.id}
                      className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-semibold text-xs">
                            {initials}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {isCurrentUser ? `${user?.fullName || "You"}` : displayName}
                              {isCurrentUser && (
                                <span className="text-xs text-gray-400 ml-1">(you)</span>
                              )}
                              {isPending && (
                                <span className="text-xs text-yellow-500 ml-1">(pending)</span>
                              )}
                            </p>
                            <p className="text-xs text-gray-500 font-mono">
                              {member.email || member.clerk_user_id || "—"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <CustomSelect
                          value={member.role_id || ""}
                          onChange={(v) => handleRoleChange(member.id, v)}
                          options={roles.map((r: any) => ({ value: r.id, label: r.name }))}
                          variant="admin"
                          className="text-xs"
                        />
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
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
                          {new Date(member.created_at).toLocaleDateString("en-NG", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!isCurrentUser && member.role !== "owner" && (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleToggleActive(member.id, !member.active)}
                            >
                              {member.active ? (
                                <>
                                  <UserX className="h-3 w-3 mr-1" /> Deactivate
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-3 w-3 mr-1" /> Activate
                                </>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-red-500 hover:text-red-700"
                              onClick={() => handleDeleteMember(member.id, displayName)}
                            >
                              <Trash2 className="h-3 w-3 mr-1" /> Remove
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {members.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                      <Users2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">No members found</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Role Definitions */}
      <Card className="bg-white dark:bg-[#0F0F12]">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Role Definitions
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {roles.map((role: any) => (
              <div key={role.id} className="flex items-start gap-3 p-2">
                <Badge className={ROLE_COLORS[role.id] || "bg-gray-100 text-gray-800"}>
                  {role.name}
                </Badge>
                <p className="text-xs text-gray-500">{role.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Pagination page={page} totalItems={total} pageSize={10} onPageChange={setPage} />
    </div>
  );
}
