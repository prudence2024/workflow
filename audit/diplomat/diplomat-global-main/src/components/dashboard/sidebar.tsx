"use client";

import type React from "react";
import { Link, useLocation, useRouteContext } from "@tanstack/react-router";
import {
  Receipt,
  CreditCard,
  Wallet,
  Users2,
  Shield,
  Settings,
  HelpCircle,
  ChevronDown,
  Home,
  ShoppingCart,
  Package,
  FileText,
  Database,
  Globe,
  Mail,
  ImageIcon,
  Layers,
  Camera,
  MessageSquare,
  Tag,
  Star,
  Clock,
  Timer,
  Truck,
  Check,
  Share2,
  BarChart3,
  RotateCcw,
  UserPlus,
  HardDrive,
  Trash2,
  User,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";

/** Map menu item IDs to required permission keys */
const PERMISSION_MAP: Record<string, string> = {
  dashboard: "analytics.view",
  analytics: "analytics.view",
  products: "products.view",
  categories: "categories.manage",
  inventory: "inventory.view",
  reviews: "reviews.manage",
  coupons: "coupons.manage",
  orders: "orders.view",
  customers: "customers.view",
  transactions: "transactions.view",
  payments: "payments.view",
  receipts: "receipts.view",
  refunds: "refunds.create",
  expenses: "expenses.view",
  blog: "blog.manage",
  pages: "pages.manage",
  "hero-slides": "hero.manage",
  testimonials: "testimonials.manage",
  media: "products.edit",
  messages: "messages.view",
  email: "messages.manage",
  newsletter: "newsletter.view",
  "social-links": "social_links.manage",
  members: "staff.manage",
  roles: "roles.manage",
  permissions: "roles.manage",
  integrations: "integrations.view",
  "audit-logs": "audit.view",
  backup: "backup.create",
  settings: "settings.manage",
};

type MenuState = "full" | "collapsed" | "hidden";

interface SubMenuItem {
  id: string;
  label: string;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: string;
  isNew?: boolean;
}

interface MenuItem {
  id: string;
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  isNew?: boolean;
  children?: SubMenuItem[];
}

interface MenuSection {
  id: string;
  label: string;
  items: MenuItem[];
}

const menuData: MenuSection[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      {
        id: "dashboard",
        label: "Dashboard",
        href: "/dashboard",
        icon: Home,
      },
      {
        id: "analytics",
        label: "Analytics",
        href: "/dashboard/analytics",
        icon: BarChart3,
        isNew: true,
      },
    ],
  },
  {
    id: "ecommerce",
    label: "Store",
    items: [
      {
        id: "products",
        label: "Products",
        href: "/dashboard/products",
        icon: Package,
        children: [
          { id: "all-products", label: "All Products", href: "/dashboard/products", icon: Package },
          { id: "categories", label: "Categories", href: "/dashboard/categories", icon: Tag },
          { id: "inventory", label: "Inventory", href: "/dashboard/inventory", icon: Database },
          { id: "reviews", label: "Reviews", href: "/dashboard/reviews", icon: Star },
          { id: "coupons", label: "Coupons", href: "/dashboard/coupons", icon: Tag },
        ],
      },
      {
        id: "orders",
        label: "Orders",
        href: "/dashboard/orders",
        icon: ShoppingCart,
        badge: "0",
        children: [
          { id: "all-orders", label: "All Orders", href: "/dashboard/orders", icon: ShoppingCart },
          {
            id: "pending",
            label: "Pending",
            href: "/dashboard/orders?status=pending",
            icon: Clock,
          },
          {
            id: "processing",
            label: "Processing",
            href: "/dashboard/orders?status=processing",
            icon: Timer,
          },
          {
            id: "shipped",
            label: "Shipped",
            href: "/dashboard/orders?status=shipped",
            icon: Truck,
          },
          {
            id: "delivered",
            label: "Delivered",
            href: "/dashboard/orders?status=delivered",
            icon: Check,
          },
        ],
      },
      {
        id: "customers",
        label: "Customers",
        href: "/dashboard/customers",
        icon: Users2,
      },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    items: [
      {
        id: "transactions",
        label: "Transactions",
        href: "/dashboard/transactions",
        icon: Wallet,
      },
      {
        id: "payments",
        label: "Payments",
        href: "/dashboard/payments",
        icon: CreditCard,
      },
      {
        id: "receipts",
        label: "Receipts",
        href: "/dashboard/receipts",
        icon: Receipt,
      },
      {
        id: "refunds",
        label: "Refunds",
        href: "/dashboard/refunds",
        icon: RotateCcw,
      },
      {
        id: "expenses",
        label: "Expenses",
        href: "/dashboard/expenses",
        icon: Receipt,
        isNew: true,
      },
    ],
  },
  {
    id: "content",
    label: "Content",
    items: [
      { id: "blog", label: "Blog", href: "/dashboard/blog", icon: FileText },
      { id: "pages", label: "Pages", href: "/dashboard/pages", icon: Globe },
      { id: "hero-slides", label: "Hero Slides", href: "/dashboard/hero-slides", icon: ImageIcon },
      { id: "testimonials", label: "Testimonials", href: "/dashboard/testimonials", icon: Star },
      { id: "media", label: "Media", href: "/dashboard/media", icon: Camera },
    ],
  },
  {
    id: "communication",
    label: "Communication",
    items: [
      { id: "messages", label: "Messages", href: "/dashboard/messages", icon: MessageSquare },
      { id: "email", label: "Email", href: "/dashboard/email", icon: Mail },
      { id: "newsletter", label: "Newsletter", href: "/dashboard/newsletter", icon: Users2 },
      { id: "social-links", label: "Social Links", href: "/dashboard/social-links", icon: Share2 },
    ],
  },
  {
    id: "team",
    label: "Team",
    items: [
      {
        id: "members",
        label: "Members",
        href: "/dashboard/members",
        icon: Users2,
        children: [
          { id: "all-members", label: "All Members", href: "/dashboard/members", icon: Users2 },
          { id: "roles", label: "Roles", href: "/dashboard/roles", icon: Shield },
          {
            id: "permissions",
            label: "Permissions",
            href: "/dashboard/permissions",
            icon: UserPlus,
          },
        ],
      },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { id: "integrations", label: "Integrations", href: "/dashboard/integrations", icon: Layers },
      { id: "audit-logs", label: "Audit Logs", href: "/dashboard/audit-logs", icon: Shield },
      {
        id: "test-data",
        label: "Test Data Cleanup",
        href: "/dashboard/test-data",
        icon: Trash2,
      },
      {
        id: "backup",
        label: "Backup & Restore",
        href: "/dashboard/backup",
        icon: HardDrive,
        children: [
          {
            id: "create-backup",
            label: "Create Backup",
            href: "/dashboard/backup",
            icon: HardDrive,
          },
          {
            id: "backup-restore",
            label: "Restore",
            href: "/dashboard/backup/restore",
            icon: RotateCcw,
          },
          {
            id: "backup-schedule",
            label: "Schedule",
            href: "/dashboard/backup/schedule",
            icon: Clock,
          },
        ],
      },
    ],
  },
];

// Bottom utility items — NOT duplicated from main menu
const utilityItems: MenuItem[] = [
  { id: "profile", label: "Profile", href: "/dashboard/profile", icon: User },
  { id: "settings", label: "Settings", href: "/dashboard/settings", icon: Settings },
  { id: "help", label: "Help", href: "/dashboard/help", icon: HelpCircle },
];

function isItemActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  const basePath = href.split("?")[0];
  return pathname === basePath || pathname.startsWith(basePath + "/");
}

function isAnyChildActive(children: SubMenuItem[], pathname: string): boolean {
  return children.some((child) => isItemActive(child.href, pathname));
}

export default function Sidebar() {
  const location = useLocation();
  const pathname = location.pathname;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [menuState, setMenuState] = useState<MenuState>("full");
  const [isHovered, setIsHovered] = useState(false);
  const [previousDesktopState, setPreviousDesktopState] = useState<MenuState>("full");
  const [isMobile, setIsMobile] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  // Permissions come from the dashboard route context, which already resolves
  // them server-side in beforeLoad. Fetching them again here duplicated that
  // call on every admin navigation (browser-observed: adminGetMyPermissions x2).
  const { permissions: myPermissions = [] } = useRouteContext({ from: "/dashboard" }) as {
    permissions?: string[];
  };

  // Filter menu items based on permissions
  const filteredMenuData = useMemo(() => {
    if (myPermissions.length === 0) return menuData; // Fallback: show all if permissions not yet loaded
    return menuData
      .map((section) => ({
        ...section,
        items: section.items
          .map((item) => {
            const requiredPerm = PERMISSION_MAP[item.id];
            if (requiredPerm && !myPermissions.includes(requiredPerm)) return null;
            // Filter children too
            if (item.children) {
              const filteredChildren = item.children.filter((child) => {
                const childPerm = PERMISSION_MAP[child.id];
                return !childPerm || myPermissions.includes(childPerm);
              });
              if (filteredChildren.length === 0) return null;
              return { ...item, children: filteredChildren };
            }
            return item;
          })
          .filter((item): item is MenuItem => item !== null),
      }))
      .filter((section) => section.items.length > 0);
  }, [myPermissions]);

  const toggleMenuState = () =>
    setMenuState((p) => (p === "full" ? "collapsed" : p === "collapsed" ? "hidden" : "full"));

  useEffect(() => {
    const h = () => {
      const d = window.innerWidth >= 1024;
      setIsMobile(!d);
      if (!d && menuState !== "hidden") {
        setPreviousDesktopState(menuState);
        setMenuState("hidden");
      } else if (d && menuState === "hidden" && previousDesktopState !== "hidden")
        setMenuState(previousDesktopState);
    };
    h();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [menuState, previousDesktopState]);

  useEffect(() => {
    const ne = new Set<string>();
    for (const s of menuData)
      for (const i of s.items)
        if (i.children?.length) {
          const id = `${s.id}-${i.id}`;
          if (isAnyChildActive(i.children, pathname)) ne.add(id);
        }
    setExpandedItems((p) => {
      const m = new Set([...p, ...ne]);
      return m.size !== p.size || [...m].some((v) => !p.has(v)) ? m : p;
    });
  }, [pathname]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).toggleMenuState = toggleMenuState;
      (window as any).menuState = menuState;
      (window as any).isHovered = isHovered;
      (window as any).isMobile = isMobile;
      (window as any).setIsMobileMenuOpen = setIsMobileMenuOpen;
      (window as any).isMobileMenuOpen = isMobileMenuOpen;
      // Notify the layout (event-driven; the layout no longer polls)
      window.dispatchEvent(new Event("dashboard-sidebar-state"));
    }
  }, [menuState, isHovered, isMobile, isMobileMenuOpen]);

  const handleMobileClose = () => {
    if (isMobile) setIsMobileMenuOpen(false);
  };

  // §12: Escape closes the mobile drawer and body scroll is locked while it
  // is open, so the page behind the scrim stays put and keyboard users can
  // dismiss the overlay without a pointer.
  useEffect(() => {
    if (!isMobile || !isMobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMobileMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isMobile, isMobileMenuOpen]);
  const toggleExpanded = (id: string) =>
    setExpandedItems((p) => {
      const s = new Set(p);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  function NavItem({
    item,
    level = 0,
    parentId = "",
  }: {
    item: MenuItem | SubMenuItem;
    level?: number;
    parentId?: string;
  }) {
    const itemId = `${parentId}-${item.id}`;
    const isExpanded = expandedItems.has(itemId);
    const hasChildren = "children" in item && item.children && item.children.length > 0;
    const showText =
      menuState === "full" ||
      (menuState === "collapsed" && isHovered) ||
      (isMobile && isMobileMenuOpen);
    const paddingLeft = level === 0 ? "px-3" : level === 1 ? "pl-8 pr-3" : "pl-12 pr-3";
    const children = hasChildren ? (item as MenuItem).children! : [];
    const active = item.href
      ? isItemActive(item.href, pathname)
      : hasChildren
        ? isAnyChildActive(children, pathname)
        : false;
    const activeClasses = active
      ? "bg-brand/10 dark:bg-brand/15"
      : "hover:bg-gray-50 dark:hover:bg-[#222226]";

    const content = (
      <div
        className={cn(
          "flex items-center py-2 text-sm rounded-md transition-colors sidebar-menu-item relative group cursor-pointer",
          paddingLeft,
          activeClasses,
        )}
        title={menuState === "collapsed" && !isHovered && !isMobile ? item.label : undefined}
      >
        {item.icon && <item.icon className="h-4 w-4 flex-shrink-0 sidebar-menu-icon" />}
        {showText && (
          <>
            <span
              className={cn(
                "ml-3 flex-1 transition-opacity duration-200",
                active ? "text-brand dark:text-brand font-medium" : "sidebar-menu-text",
              )}
            >
              {item.label}
            </span>
            <div className="flex items-center space-x-1">
              {item.isNew && (
                <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                  New
                </span>
              )}
              {item.badge && (
                <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">
                  {item.badge}
                </span>
              )}
              {hasChildren && showText && (
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform duration-200",
                    isExpanded ? "rotate-180" : "rotate-0",
                  )}
                />
              )}
            </div>
          </>
        )}
        {menuState === "collapsed" && !isHovered && !isMobile && (
          <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
            {item.label}
          </div>
        )}
      </div>
    );

    return (
      <div>
        {item.href && !hasChildren ? (
          <Link
            to={item.href as any}
            onClick={handleMobileClose}
            activeOptions={{ exact: item.href === "/dashboard" }}
          >
            {content}
          </Link>
        ) : (
          <button
            type="button"
            className="w-full text-left cursor-pointer"
            onClick={() => hasChildren && toggleExpanded(itemId)}
            aria-expanded={hasChildren ? isExpanded : undefined}
            aria-label={item.label}
          >
            {content}
          </button>
        )}
        {hasChildren && (isExpanded || isAnyChildActive(children, pathname)) && showText && (
          <div className="mt-1 space-y-1">
            {children.map((c: SubMenuItem) => (
              <NavItem key={c.id} item={c} level={level + 1} parentId={itemId} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const getSidebarWidth = () =>
    isMobile
      ? "w-64"
      : menuState === "collapsed" && isHovered
        ? "w-64"
        : menuState === "collapsed"
          ? "w-16"
          : "w-64";
  const showText =
    menuState === "full" ||
    (menuState === "collapsed" && isHovered) ||
    (isMobile && isMobileMenuOpen);

  const sidebarContent = (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="h-16 px-3 flex items-center border-b border-gray-200 dark:border-[#2a2a2e] flex-shrink-0">
        {showText ? (
          <Link to="/dashboard" className="flex items-center gap-3 w-full">
            <img
              src="/favicon.png"
              alt="Diplomat Global"
              width={32}
              height={32}
              className="flex-shrink-0"
            />
            <span className="text-lg font-semibold text-gray-900 dark:text-white transition-opacity duration-200">
              Diplomat Global
            </span>
          </Link>
        ) : (
          <div className="flex justify-center w-full">
            <img src="/favicon.png" alt="DG" width={32} height={32} className="flex-shrink-0" />
          </div>
        )}
      </div>

      {/* Nav Content */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-2"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <div className="space-y-6">
          {filteredMenuData.map((section) => (
            <div key={section.id}>
              {showText && (
                <div className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider sidebar-section-label transition-opacity duration-200">
                  {section.label}
                </div>
              )}
              <div className="space-y-1">
                {section.items.map((item) => (
                  <NavItem key={item.id} item={item} parentId={section.id} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom utility: Profile, Settings, Help — NO duplicate */}
      <div className="px-2 py-4 border-t border-gray-200 dark:border-[#2a2a2e] flex-shrink-0">
        <div className="space-y-1">
          {utilityItems.map((item) => (
            <NavItem key={item.id} item={item} />
          ))}
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <>
        <nav
          className={cn(
            "fixed inset-y-0 left-0 z-[70] w-64 bg-white dark:bg-[#111114] border-r border-gray-200 dark:border-[#2a2a2e] transform transition-transform duration-300 ease-in-out",
            isMobileMenuOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {sidebarContent}
        </nav>
        {isMobileMenuOpen && (
          <div
            role="presentation"
            className="fixed inset-0 z-[65] bg-black/30 dark:bg-black/50 transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <nav
      className={cn(
        "fixed inset-y-0 left-0 z-[60] bg-white dark:bg-[#111114] border-r border-gray-200 dark:border-[#2a2a2e] transition-all duration-300 ease-in-out",
        menuState === "hidden" ? "w-0 border-r-0" : getSidebarWidth(),
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ overflow: menuState === "hidden" ? "hidden" : "visible" }}
    >
      {menuState !== "hidden" && (
        <div className="h-full flex flex-col overflow-hidden">{sidebarContent}</div>
      )}
    </nav>
  );
}
