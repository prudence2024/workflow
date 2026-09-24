import type React from "react";
import { LogOut, MoveUpRight, Settings, CreditCard, FileText, ShoppingBag } from "lucide-react";
import { Link } from "@tanstack/react-router";

interface MenuItem {
  label: string;
  value?: string;
  href: string;
  icon?: React.ReactNode;
  external?: boolean;
}

interface Profile01Props {
  name: string;
  role: string;
  avatar: string;
  subscription?: string;
  onSignOut?: () => void;
}

export default function Profile01({
  name = "Administrator",
  role = "Admin",
  avatar = "",
  subscription = "Unknown",
  onSignOut,
}: Partial<Profile01Props> = {}) {
  const menuItems: MenuItem[] = [
    {
      label: "Role",
      value: subscription,
      href: "#",
      icon: <CreditCard className="w-4 h-4" />,
      external: false,
    },
    {
      label: "Settings",
      href: "/dashboard/settings",
      icon: <Settings className="w-4 h-4" />,
    },
    {
      label: "Terms & Policies",
      href: "/terms-and-conditions",
      icon: <FileText className="w-4 h-4" />,
      external: true,
    },
    {
      label: "Go to Shop",
      href: "/shop",
      icon: <ShoppingBag className="w-4 h-4" />,
      external: true,
    },
  ];

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="relative overflow-hidden ">
        <div className="relative px-2 py-6">
          <div className="flex items-center gap-4 mb-8">
            <div className="relative shrink-0">
              {avatar ? (
                <img
                  src={avatar}
                  alt={name}
                  width={72}
                  height={72}
                  className="rounded-full ring-4 ring-white dark:ring-zinc-900 object-cover"
                />
              ) : (
                <div className="w-[72px] h-[72px] rounded-full ring-4 ring-white dark:ring-zinc-900 bg-gradient-to-br from-gray-400 to-gray-600 dark:from-gray-600 dark:to-gray-800 flex items-center justify-center text-white text-2xl font-bold">
                  {name?.charAt(0)?.toUpperCase() || "A"}
                </div>
              )}
              <div className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-900" />
            </div>

            {/* Profile Info */}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                {name}
              </h2>
              <p className="text-zinc-600 dark:text-zinc-400 truncate">{role}</p>
            </div>
          </div>
          <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-6" />
          <div className="space-y-2">
            {menuItems.map((item) => {
              const Wrapper = item.external || item.href === "#" ? "a" : Link;
              const wrapperProps =
                item.external || item.href === "#"
                  ? {
                      href: item.href,
                      target: item.external ? "_blank" : undefined,
                      rel: item.external ? "noopener noreferrer" : undefined,
                    }
                  : { to: item.href as any };
              return (
                <Wrapper
                  key={item.label}
                  {...wrapperProps}
                  className="flex items-center justify-between p-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-lg transition-colors duration-200"
                >
                  <div className="flex items-center gap-2">
                    {item.icon}
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {item.label}
                    </span>
                  </div>
                  <div className="flex items-center">
                    {item.value && (
                      <span className="text-sm text-zinc-500 dark:text-zinc-400 mr-2">
                        {item.value}
                      </span>
                    )}
                    {item.external && <MoveUpRight className="w-4 h-4" />}
                  </div>
                </Wrapper>
              );
            })}

            <button
              type="button"
              onClick={onSignOut}
              className="w-full flex items-center justify-between p-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-lg transition-colors duration-200"
            >
              <div className="flex items-center gap-2">
                <LogOut className="w-4 h-4" />
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Logout</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
