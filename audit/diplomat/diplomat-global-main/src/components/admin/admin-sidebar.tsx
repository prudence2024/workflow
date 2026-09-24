import React from "react";
import { useState, useEffect } from "react";
import {
  Package,
  ShoppingCart,
  Users2,
  FileText,
  ImageIcon,
  Settings,
  HelpCircle,
  ChevronDown,
  BarChart2,
  Tag,
  LayoutDashboard,
  LogOut,
} from "lucide-react";
import { useMatchRoute } from "@tanstack/react-router";
import { BrandLogo } from "@/components/brand-logo";
import { cn } from "@/lib/utils";

interface SubMenuItem {
  id: string;
  label: string;
  href: string;
  icon?: React.ElementType;
}

interface MenuItem {
  id: string;
  label: string;
  href?: string;
  icon: React.ElementType;
  badge?: string;
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
      { id: "dashboard", label: "Dashboard", href: "/admin", icon: LayoutDashboard },
      { id: "analytics", label: "Analytics", href: "/admin/analytics", icon: BarChart2 },
    ],
  },
  {
    id: "store",
    label: "Store",
    items: [
      {
        id: "products",
        label: "Products",
        href: "/admin/products",
        icon: Package,
        children: [
          { id: "all-products", label: "All Products", href: "/admin/products", icon: Package },
          { id: "categories", label: "Categories", href: "/admin/categories", icon: Tag },
        ],
      },
      {
        id: "orders",
        label: "Orders",
        href: "/admin/orders",
        icon: ShoppingCart,
      },
      {
        id: "customers",
        label: "Customers",
        href: "/admin/customers",
        icon: Users2,
      },
    ],
  },
  {
    id: "content",
    label: "Content",
    items: [
      {
        id: "pages",
        label: "Pages",
        href: "/admin/pages",
        icon: FileText,
        children: [
          { id: "all-pages", label: "All Pages", href: "/admin/pages", icon: FileText },
          { id: "blog", label: "Blog Posts", href: "/admin/blog", icon: FileText },
        ],
      },
      {
        id: "media",
        label: "Media Library",
        href: "/admin/media",
        icon: ImageIcon,
      },
    ],
  },
];

export default function AdminSidebar() {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);
  const matchRoute = useMatchRoute();

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const toggleExpanded = (itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const showText = !isCollapsed || isMobile;
  const sidebarWidth = isMobile ? "w-64" : isCollapsed ? "w-16" : "w-64";

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
    const isActive = item.href ? !!matchRoute({ to: item.href, fuzzy: true }) : false;
    const Icon = item.icon as React.ElementType;

    const content = (
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer",
          isActive
            ? "bg-brand/10 text-brand font-medium"
            : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5",
          level === 0 ? "" : level === 1 ? "pl-10" : "pl-14",
        )}
        onClick={() => {
          if (hasChildren) toggleExpanded(itemId);
          if (isMobile) setIsMobileOpen(false);
        }}
      >
        <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-brand" : "")} />
        {showText && (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            {"badge" in item && item.badge && (
              <span className="px-1.5 py-0.5 text-xs bg-brand/10 text-brand rounded-full">
                {item.badge}
              </span>
            )}
            {hasChildren && (
              <ChevronDown
                className={cn(
                  "h-3 w-3 shrink-0 transition-transform",
                  isExpanded ? "rotate-180" : "",
                )}
              />
            )}
          </>
        )}
      </div>
    );

    if (item.href && !hasChildren) {
      return (
        <a href={item.href} onClick={() => isMobile && setIsMobileOpen(false)}>
          {content}
        </a>
      );
    }

    return (
      <div>
        {content}
        {hasChildren && isExpanded && showText && (
          <div className="mt-0.5 space-y-0.5">
            {item.children!.map((child) => (
              <NavItem key={child.id} item={child} level={level + 1} parentId={itemId} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white dark:bg-[#0F0F12]">
      {/* Logo header */}
      <div className="flex h-16 items-center justify-between border-b border-gray-200 px-4 dark:border-[#1F1F23]">
        {showText ? (
          <a href="/admin" className="flex items-center gap-3">
            <BrandLogo compact />
          </a>
        ) : (
          <a href="/admin" className="mx-auto">
            <BrandLogo compact />
          </a>
        )}
        {isMobile && (
          <button
            onClick={() => setIsMobileOpen(false)}
            className="grid size-8 place-items-center rounded-lg hover:bg-gray-100 dark:hover:bg-white/5"
          >
            <span className="text-lg">&times;</span>
          </button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4 px-2">
        <div className="space-y-6">
          {menuData.map((section) => (
            <div key={section.id}>
              {showText && (
                <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {section.label}
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavItem key={item.id} item={item} parentId={section.id} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom actions */}
      <div className="border-t border-gray-200 px-2 py-3 dark:border-[#1F1F23]">
        <NavItem
          item={{ id: "settings", label: "Settings", href: "/admin/settings", icon: Settings }}
        />
        <NavItem
          item={{ id: "help", label: "Help & Support", href: "/admin/help", icon: HelpCircle }}
        />
        <a
          href="/"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {showText && <span>Back to Store</span>}
        </a>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="fixed left-4 top-[18px] z-[55] grid size-8 place-items-center rounded-lg border border-gray-200 bg-white lg:hidden dark:border-[#1F1F23] dark:bg-[#0F0F12]"
        aria-label="Open menu"
      >
        <LayoutDashboard className="h-4 w-4" />
      </button>

      {/* Mobile overlay */}
      {isMobile && isMobileOpen && (
        <div className="fixed inset-0 z-[60] bg-black/50" onClick={() => setIsMobileOpen(false)} />
      )}

      {/* Mobile sidebar */}
      {isMobile && (
        <nav
          className={cn(
            "fixed inset-y-0 left-0 z-[65] w-64 transition-transform duration-300",
            isMobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {sidebarContent}
        </nav>
      )}

      {/* Desktop sidebar */}
      {!isMobile && (
        <nav
          className={cn(
            "fixed inset-y-0 left-0 z-[50] border-r border-gray-200 transition-all duration-300 dark:border-[#1F1F23]",
            sidebarWidth,
            isCollapsed && "overflow-hidden",
          )}
          onMouseEnter={() => isCollapsed && setIsCollapsed(false)}
          onMouseLeave={() => !isCollapsed && setIsCollapsed(false)}
        >
          {sidebarContent}
        </nav>
      )}
    </>
  );
}
