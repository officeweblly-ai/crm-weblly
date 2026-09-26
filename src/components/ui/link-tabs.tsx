import Link from "next/link";
import { cn } from "@/lib/utils";

/** URL-driven tabs: server-rendered, shareable, only the active tab's data loads. */
export function LinkTabs({ tabs, active, hrefFor }: { tabs: { key: string; label: string; count?: number }[]; active: string; hrefFor: (key: string) => string }) {
  return (
    <nav aria-label="לשוניות" className="scrollbar-thin -mx-4 mb-5 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <li key={t.key}>
              <Link
                href={hrefFor(t.key)}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative flex h-11 items-center gap-1.5 px-3 text-sm font-medium transition-colors",
                  on ? "text-ink" : "text-ink-3 hover:text-ink",
                )}
              >
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className={cn("rounded-full px-1.5 text-xs num", on ? "bg-accent-soft text-accent-ink" : "bg-sunken text-ink-3")}>{t.count}</span>
                )}
                {on && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" aria-hidden />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
