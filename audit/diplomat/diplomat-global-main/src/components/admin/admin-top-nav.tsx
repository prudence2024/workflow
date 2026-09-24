import { UserButton } from "@clerk/tanstack-react-start";
import { Moon, Sun, ExternalLink } from "lucide-react";
import { useStore } from "@/components/store-provider";

export default function AdminTopNav() {
  const { isDark, toggleTheme } = useStore();

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-end border-b border-gray-200 bg-white/90 px-4 backdrop-blur-xl dark:border-[#1F1F23] dark:bg-[#0F0F12]/90 sm:px-6">
      <div className="flex items-center gap-2">
        <a
          href="/"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-600 transition hover:border-brand hover:text-brand dark:border-[#1F1F23] dark:text-gray-400"
        >
          View Store
          <ExternalLink className="h-3 w-3" />
        </a>
        <button
          onClick={toggleTheme}
          className="grid size-10 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
          aria-label="Toggle theme"
        >
          {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </button>
        <UserButton />
      </div>
    </header>
  );
}
