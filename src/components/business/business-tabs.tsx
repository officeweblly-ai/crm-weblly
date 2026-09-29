"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/business", label: "סקירה", area: null },
  { href: "/business/strategy", label: "אסטרטגיה ויעדים", area: "strategy" },
  { href: "/business/expenses", label: "הוצאות", area: "finances" },
  { href: "/business/partners", label: "הסכם שותפים", area: "partners" },
] as const;

export function BusinessTabs({ allowed }: { allowed: "all" | string[] }) {
  const pathname = usePathname();
  const tabs = TABS.filter((t) => !t.area || allowed === "all" || allowed.includes(t.area));
  return (
    <nav aria-label="אזורי ניהול העסק" className="scrollbar-thin -mx-4 mb-6 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0 print:hidden">
      <ul className="flex min-w-max gap-1">
        {tabs.map((t) => {
          const on = t.href === "/business" ? pathname === "/business" : pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={cn("relative flex h-11 items-center px-3 text-sm font-medium transition-colors", on ? "text-ink" : "text-ink-3 hover:text-ink")}
              >
                {t.label}
                {on && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" aria-hidden />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
