"use client";

import { adminNavigationTarget } from "@/lib/admin/navigation-target";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createCoalescedRefresh } from "@/lib/refresh-coalescer";
import {
  Menu,
  Search,
  Bell,
  Settings,
  ChevronDown,
  Home,
  Mail,
  Check,
  X,
  Shield,
  Package,
  ShoppingBag,
  CreditCard,
  User,
  FileText,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "./theme-toggle";
import { useUser, useClerk } from "@clerk/tanstack-react-start";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  adminListMessages,
  adminMarkMessageRead,
  adminGetAvatarUrl,
  adminListSecurityNotifications,
  adminMarkNotificationRead,
  adminMarkAllNotificationsRead,
  adminListNotifications,
  adminMarkNotificationReadById,
  adminMarkAllNotificationsReadById,
  adminLogSecurityEvent,
  adminGlobalSearch,
} from "@/lib/admin/server-fns";
import Profile01 from "./profile";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { formatAdminRoleLabel } from "@/lib/admin/role-label";

const SEVERITY_COLORS: Record<string, string> = {
  info: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
  warning: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
  error: "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400",
  critical: "bg-red-200 dark:bg-red-900/50 text-red-700 dark:text-red-300",
};
const CATEGORY_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  payment: CreditCard,
  inventory: Package,
  security: Shield,
  contact: Mail,
  email: Mail,
  media: FileText,
  backup: FileText,
  operations: Settings,
  receipt: FileText,
  reviews: Star,
  testimonials: Mail,
};

function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentMessages, setRecentMessages] = useState<any[]>([]);
  const [securityEvents, setSecurityEvents] = useState<any[]>([]);
  const [operationalNotifs, setOperationalNotifs] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const fetchMessages = useServerFn(adminListMessages);
  const fetchSecurity = useServerFn(adminListSecurityNotifications);
  const fetchNotifs = useServerFn(adminListNotifications);
  const markRead = useServerFn(adminMarkMessageRead);
  const markSecRead = useServerFn(adminMarkNotificationRead);
  const markAllSecRead = useServerFn(adminMarkAllNotificationsRead);
  const markNotifRead = useServerFn(adminMarkNotificationReadById);
  const markAllNotifsRead = useServerFn(adminMarkAllNotificationsReadById);

  const loadNotifications = useCallback(async () => {
    try {
      const [msgRes, secRes, notifRes] = await Promise.all([
        fetchMessages({ data: { unread_only: true } }).catch(() => ({ total: 0, messages: [] })),
        fetchSecurity().catch(() => ({ notifications: [], unreadCount: 0 })),
        fetchNotifs({ data: { pageSize: 15, unreadOnly: false } }).catch(() => ({
          notifications: [],
          unreadCount: 0,
        })),
      ]);
      setUnreadCount((msgRes.total || 0) + (secRes.unreadCount || 0) + (notifRes.unreadCount || 0));
      setRecentMessages(msgRes.messages || []);
      setSecurityEvents(secRes.notifications || []);
      setOperationalNotifs(notifRes.notifications || []);
    } catch {
      // Notification fetch failed — UI shows zero counts
    }
  }, []);

  // Single coalesced refresh funnel: mount, focus and visibilitychange all
  // fire together when an admin returns to the tab — routing them through
  // one scheduler keeps that burst to exactly ONE set of fetches.
  const loadRef = useRef(loadNotifications);
  loadRef.current = loadNotifications;
  const refresh = useMemo(
    () => createCoalescedRefresh({ run: () => loadRef.current(), minIntervalMs: 5_000 }),
    [],
  );
  useEffect(() => {
    void refresh.request();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh.request();
    };
    const onFocus = () => void refresh.request();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const handleMarkRead = async (id: string) => {
    await markRead({ data: { message_id: id } });
    setRecentMessages((prev) => prev.filter((m) => m.id !== id));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const handleMarkSecRead = async (auditLogId: number) => {
    await markSecRead({ data: { audit_log_id: auditLogId } });
    setSecurityEvents((prev) =>
      prev.map((e) => (e.id === auditLogId ? { ...e, isRead: true } : e)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const handleMarkAllSecRead = async () => {
    await markAllSecRead();
    setSecurityEvents((prev) => prev.map((e) => ({ ...e, isRead: true })));
    // Recalculate unread count (messages only)
    setUnreadCount(recentMessages.length);
  };

  const handleSecurityNotificationClick = async (evt: any) => {
    // Mark as read
    await handleMarkSecRead(evt.id);
    // Navigate to audit logs with event ID
    navigate({ to: "/dashboard/audit-logs", search: { event: String(evt.id) } });
    setOpen(false);
  };

  const handleNotifRead = async (notifId: string) => {
    await markNotifRead({ data: { notification_id: notifId } });
    setOperationalNotifs((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, isRead: true } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const handleNotifClick = async (notif: any) => {
    await handleNotifRead(notif.id);
    const target = adminNavigationTarget(notif.target_url);
    if (target) navigate(target);
    setOpen(false);
  };

  const handleMarkAllNotifsRead = async () => {
    await markAllNotifsRead();
    setOperationalNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(recentMessages.length); // Recalc from messages only
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative p-2"
          aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-[#0F0F12]">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[calc(100vw-2rem)] sm:w-80 max-w-sm p-0">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Notifications</h3>
          {unreadCount > 0 && <span className="text-xs text-gray-500">{unreadCount} unread</span>}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {recentMessages.length === 0 &&
          securityEvents.length === 0 &&
          operationalNotifs.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              <Mail className="mx-auto mb-2 h-8 w-8 opacity-50" />
              No new notifications
            </div>
          ) : (
            <>
              {(() => {
                // Merge ALL notifications, sort by created_at DESC, display newest first
                type MergedNotif = {
                  id: string;
                  created_at: string;
                  isRead: boolean;
                  type: string;
                  data: any;
                };
                const merged: MergedNotif[] = [
                  ...securityEvents.map((e: any) => ({
                    id: `sec-${e.id}`,
                    created_at: e.created_at,
                    isRead: e.isRead,
                    type: "security" as const,
                    data: e,
                  })),
                  ...operationalNotifs.map((n: any) => ({
                    id: `op-${n.id}`,
                    created_at: n.created_at,
                    isRead: n.isRead,
                    type: "system" as const,
                    data: n,
                  })),
                  ...recentMessages.map((m: any) => ({
                    id: `msg-${m.id}`,
                    created_at: m.created_at,
                    isRead: m.is_read,
                    type: "message" as const,
                    data: m,
                  })),
                ].sort(
                  (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
                );

                return merged.map((item) => {
                  const timeStr = new Date(item.created_at).toLocaleDateString("en-NG", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  if (item.type === "security") {
                    const evt = item.data;
                    return (
                      <div
                        key={item.id}
                        className={`flex items-start gap-3 border-b border-gray-100 dark:border-gray-800/50 px-4 py-3 transition cursor-pointer ${item.isRead ? "bg-white dark:bg-[#0F0F12] opacity-70" : "bg-red-50/50 dark:bg-red-900/5 hover:bg-red-50 dark:hover:bg-red-900/10"}`}
                        onClick={() => handleSecurityNotificationClick(evt)}
                      >
                        <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-red-100 dark:bg-red-900/30">
                          <Shield className="h-4 w-4 text-red-600 dark:text-red-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm font-medium truncate ${item.isRead ? "text-gray-600 dark:text-gray-400" : "text-red-700 dark:text-red-400"}`}
                          >
                            {evt.action === "admin_permission_denied"
                              ? "Permission denied"
                              : "Unauthorized admin access attempt"}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">
                            {evt.metadata?.route || "unknown route"} —{" "}
                            {evt.metadata?.reason || evt.metadata?.permission || "blocked"}
                          </p>
                          <p className="mt-1 text-[10px] text-gray-400">{timeStr}</p>
                        </div>
                        {!item.isRead && (
                          <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                        )}
                      </div>
                    );
                  }

                  if (item.type === "system") {
                    const notif = item.data;
                    return (
                      <div
                        key={item.id}
                        className={`flex items-start gap-3 border-b border-gray-100 dark:border-gray-800/50 px-4 py-3 transition cursor-pointer ${item.isRead ? "bg-white dark:bg-[#0F0F12] opacity-70" : "bg-gray-50 dark:bg-gray-800/30 hover:bg-gray-100 dark:hover:bg-gray-800/50"}`}
                        onClick={() => handleNotifClick(notif)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            void handleNotifClick(notif);
                          }
                        }}
                      >
                        <div
                          className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${SEVERITY_COLORS[notif.severity] || SEVERITY_COLORS.info}`}
                        >
                          {(() => {
                            const CatIcon = CATEGORY_ICON_MAP[notif.category];
                            return CatIcon ? (
                              <CatIcon className="h-4 w-4" />
                            ) : (
                              <Bell className="h-4 w-4" />
                            );
                          })()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm font-medium truncate ${item.isRead ? "text-gray-600 dark:text-gray-400" : "text-gray-900 dark:text-white"}`}
                          >
                            {notif.title}
                          </p>
                          {notif.message && (
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">
                              {notif.message}
                            </p>
                          )}
                          <p className="mt-1 text-[10px] text-gray-400">{timeStr}</p>
                        </div>
                        {!item.isRead && (
                          <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" />
                        )}
                      </div>
                    );
                  }

                  // Message
                  const msg = item.data;
                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 border-b border-gray-100 dark:border-gray-800/50 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition"
                    >
                      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                        <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {msg.subject || msg.name || "New message"}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">
                          {msg.email} — {msg.message?.slice(0, 60) || ""}
                          {msg.message?.length > 60 ? "..." : ""}
                        </p>
                        <p className="mt-1 text-[10px] text-gray-400">{timeStr}</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkRead(msg.id);
                        }}
                        className="mt-1 shrink-0 rounded p-1 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300"
                        aria-label="Mark as read"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                });
              })()}
            </>
          )}
        </div>
        {unreadCount > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-2.5">
            <Link
              to="/dashboard/messages"
              onClick={() => setOpen(false)}
              className="block text-center text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              View all messages
            </Link>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function TopNav() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  // Server-resolved role (dashboard beforeLoad → admin_users.roles.key).
  // Never hardcode this: an account with no role must not display one.
  const { admin: adminAccess } = useRouteContext({ from: "/dashboard" }) as {
    admin?: { role?: string | null };
  };
  const resolvedRoleLabel = formatAdminRoleLabel(adminAccess?.role);
  const [dbAvatarUrl, setDbAvatarUrl] = useState<string | null>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const getAvatar = useServerFn(adminGetAvatarUrl);

  const fetchAvatar = useCallback(() => {
    getAvatar()
      .then((res) => {
        if (res?.avatar_url) setDbAvatarUrl(res.avatar_url);
      })
      .catch(() => {});
  }, [getAvatar]);

  // Same coalescing as the notification bell: mount + focus returning to the
  // tab must not fire adminGetAvatarUrl twice in a row.
  const avatarRefresh = useMemo(
    () => createCoalescedRefresh({ run: () => fetchAvatar(), minIntervalMs: 5_000 }),
    [fetchAvatar],
  );
  useEffect(() => {
    void avatarRefresh.request();
    const handleFocus = () => void avatarRefresh.request();
    const handleAvatarUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.avatar_url) setDbAvatarUrl(detail.avatar_url);
      // Explicit user action (fresh upload) must bypass the quiet window.
      avatarRefresh.reset();
    };
    window.addEventListener("focus", handleFocus);
    window.addEventListener("admin-avatar-updated", handleAvatarUpdate as EventListener);
    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("admin-avatar-updated", handleAvatarUpdate as EventListener);
    };
  }, [avatarRefresh]);

  const handleMenuToggle = () => {
    if (typeof window !== "undefined" && (window as any).toggleMenuState) {
      (window as any).toggleMenuState();
    }
  };

  const handleMobileMenuToggle = () => {
    if (typeof window !== "undefined" && (window as any).setIsMobileMenuOpen) {
      const currentState = (window as any).isMobileMenuOpen || false;
      (window as any).setIsMobileMenuOpen(!currentState);
    }
  };

  const initials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase() || "U"
    : "U";

  return (
    <div className="flex items-center justify-between h-full px-3 sm:px-6">
      {/* Left side - Menu toggle and Breadcrumbs */}
      <div className="flex items-center space-x-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleMenuToggle}
          className="hidden lg:flex p-2"
          title="Toggle Menu"
        >
          <Menu className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleMobileMenuToggle}
          className="lg:hidden p-2"
          title="Toggle Mobile Menu"
        >
          <Menu className="h-4 w-4" />
        </Button>

        <nav className="hidden sm:flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
          <Link
            to="/dashboard"
            className="flex items-center hover:text-gray-900 dark:hover:text-white"
          >
            <Home className="h-4 w-4 mr-1" />
            Dashboard
          </Link>
        </nav>
      </div>

      {/* Center - Global Search (hidden on mobile) */}
      <GlobalSearch navigate={navigate} />

      {/* Right side - Actions and Profile */}
      <div className="flex items-center space-x-2">
        <Button
          variant="ghost"
          size="sm"
          className="md:hidden flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 dark:text-gray-400"
          onClick={() => setMobileSearchOpen(true)}
          aria-label="Search"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Search</span>
        </Button>

        <ThemeToggle />

        <NotificationBell />

        <Link to="/dashboard/settings">
          <Button variant="ghost" size="sm" className="p-2" aria-label="Settings">
            <Settings className="h-4 w-4" />
          </Button>
        </Link>

        {/* Profile Dropdown - Actual CMS profile with Clerk identity */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center space-x-2 p-2">
              <Avatar className="h-8 w-8">
                <AvatarImage
                  src={dbAvatarUrl || user?.imageUrl || undefined}
                  alt={user?.fullName || "User"}
                />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="hidden lg:flex flex-col items-start">
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {user?.fullName || "Administrator"}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {user?.primaryEmailAddress?.emailAddress || "Administrator"}
                </span>
              </div>
              <ChevronDown className="hidden lg:block h-4 w-4 text-gray-500" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[calc(100vw-2rem)] sm:w-80 max-w-sm p-0">
            <Profile01
              name={user?.fullName || "Administrator"}
              role={resolvedRoleLabel}
              avatar={dbAvatarUrl || user?.imageUrl || ""}
              subscription={resolvedRoleLabel}
              onSignOut={() => {
                adminLogSecurityEvent({
                  data: {
                    action: "admin_session_ended",
                    metadata: {
                      result: "logout",
                      timestamp: new Date().toISOString(),
                    },
                  },
                }).catch(() => {});
                signOut({ redirectUrl: "/admin/login" });
              }}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={mobileSearchOpen} onOpenChange={setMobileSearchOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-lg">
          <DialogTitle>Search dashboard</DialogTitle>
          <DialogDescription className="sr-only">
            Search products, orders, customers and blog posts.
          </DialogDescription>
          <GlobalSearch
            mobile
            navigate={(target: Parameters<typeof navigate>[0]) => {
              navigate(target);
              setMobileSearchOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Global Search Component ──────────────────────────────────────────
type SearchResult = {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  url: string;
};

const ENTITY_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  product: Package,
  order: ShoppingBag,
  transaction: CreditCard,
  customer: User,
  blog: FileText,
};

function GlobalSearch({ navigate, mobile = false }: { navigate: any; mobile?: boolean }) {
  const searchFn = useServerFn(adminGlobalSearch);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [searchError, setSearchError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounced search
  useEffect(() => {
    let cancelled = false;
    clearTimeout(debounceRef.current);
    setSearchError(false);
    if (query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchFn({ data: { q: query.trim() } });
        if (cancelled) return;
        if (res?.error || res?.rateLimited) throw new Error("Search unavailable");
        setResults(res?.results ?? []);
        setOpen(true);
      } catch {
        if (cancelled) return;
        setSearchError(true);
        setOpen(true);
        setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i < results.length - 1 ? i + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i > 0 ? i - 1 : results.length - 1));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      const target = adminNavigationTarget(results[activeIdx].url);
      if (target) navigate(target);
      setOpen(false);
      setQuery("");
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const typeLabel = (type: string) => {
    const labels: Record<string, string> = {
      product: "Product",
      order: "Order",
      transaction: "Transaction",
      customer: "Customer",
      blog: "Blog",
    };
    return labels[type] || type;
  };

  return (
    <div
      ref={containerRef}
      className={
        mobile ? "relative w-full min-w-0" : "hidden md:flex flex-1 max-w-md mx-4 relative"
      }
    >
      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIdx(-1);
          }}
          onFocus={() => query.trim().length >= 2 && results.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search products, orders, customers..."
          aria-label="Search dashboard"
          aria-expanded={open && results.length > 0}
          aria-controls={mobile ? "mobile-search-results" : "global-search-results"}
          role="combobox"
          className="pl-10 pr-10 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setResults([]);
              setOpen(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div
          id={mobile ? "mobile-search-results" : "global-search-results"}
          role="listbox"
          className="absolute top-full left-0 right-0 mt-1 max-h-80 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg z-50"
        >
          {results.map((r, i) => (
            <button
              key={`${r.type}-${r.id}`}
              type="button"
              role="option"
              aria-selected={i === activeIdx}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition ${
                i === activeIdx
                  ? "bg-brand/10 text-brand"
                  : "hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => {
                const target = adminNavigationTarget(r.url);
                if (target) navigate(target);
                setOpen(false);
                setQuery("");
              }}
            >
              <span className="text-gray-400" aria-hidden>
                {(() => {
                  const Icon = ENTITY_ICON_MAP[r.type];
                  return Icon ? <Icon className="h-4 w-4" /> : <span className="text-sm">•</span>;
                })()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{r.title}</p>
                <p className="text-xs text-gray-500 truncate">
                  <span className="inline-block rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase mr-1">
                    {typeLabel(r.type)}
                  </span>
                  {r.subtitle}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && query.trim().length >= 2 && results.length === 0 && !loading && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg z-50 px-4 py-6 text-center">
          <p role={searchError ? "alert" : "status"} className="text-sm text-gray-500">
            {searchError ? "Search unavailable. Please retry." : `No results for "${query}"`}
          </p>
        </div>
      )}

      {loading && query.trim().length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg z-50 px-4 py-4 text-center">
          <p className="text-xs text-gray-400 animate-pulse">Searching...</p>
        </div>
      )}
    </div>
  );
}
