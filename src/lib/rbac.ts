export type Role = "owner" | "admin" | "manager" | "member" | "viewer";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  member: "Member",
  viewer: "Viewer",
};

export const ROLE_RANK: Record<Role, number> = {
  owner: 5,
  admin: 4,
  manager: 3,
  member: 2,
  viewer: 1,
};

export type Permission =
  | "org:manage"
  | "org:billing"
  | "members:manage"
  | "contacts:write"
  | "contacts:delete"
  | "campaigns:write"
  | "campaigns:run"
  | "imports:write"
  | "templates:write"
  | "reports:export"
  | "settings:write"
  /** Added in migration 0007 — distinct from editing records. */
  | "messages:send";

const PERMISSIONS_BY_ROLE: Record<Role, Permission[]> = {
  owner: [
    "org:manage",
    "org:billing",
    "members:manage",
    "contacts:write",
    "contacts:delete",
    "campaigns:write",
    "campaigns:run",
    "imports:write",
    "templates:write",
    "reports:export",
    "settings:write",
    "messages:send",
  ],
  admin: [
    "members:manage",
    "contacts:write",
    "contacts:delete",
    "campaigns:write",
    "campaigns:run",
    "imports:write",
    "templates:write",
    "reports:export",
    "settings:write",
    "messages:send",
  ],
  manager: [
    "contacts:write",
    "campaigns:write",
    "campaigns:run",
    "imports:write",
    "templates:write",
    "reports:export",
    "messages:send",
  ],
  member: ["contacts:write", "imports:write"],
  viewer: [],
};

export function can(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return PERMISSIONS_BY_ROLE[role]?.includes(permission) ?? false;
}

export function isAtLeast(role: Role | undefined, min: Role): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}
