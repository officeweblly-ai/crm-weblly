"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

type FilterDef = { name: string; label: string; options: { value: string; label: string }[]; allLabel?: string };

/**
 * Search + filters + sort, all stored in the URL so lists are shareable,
 * survive refresh, and are rendered on the server.
 */
export function ListToolbar({
  searchPlaceholder,
  filters = [],
  sorts,
  className,
}: {
  /** Omit to hide the search box. */
  searchPlaceholder?: string;
  filters?: FilterDef[];
  sorts?: { value: string; label: string }[];
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const push = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    next.delete("new");
    const qs = next.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const onSearch = (value: string) => {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => push({ q: value.trim() || null }), 300);
  };

  const selectCls =
    "h-10 min-w-0 rounded-md border border-line-strong bg-surface ps-3 pe-8 text-sm text-ink-2 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15";

  return (
    <div className={cn("mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center", className)}>
      {searchPlaceholder && (
      <div className="relative sm:max-w-xs sm:flex-1">
        {pending ? (
          <Loader2 className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-3" aria-hidden />
        ) : (
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
        )}
        <input
          type="search"
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="h-10 w-full rounded-md border border-line-strong bg-surface ps-9 pe-9 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button
            type="button"
            onClick={() => onSearch("")}
            className="absolute end-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded text-ink-3 hover:text-ink"
            aria-label="ניקוי החיפוש"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:flex">
        {filters.map((f) => (
          <select
            key={f.name}
            aria-label={f.label}
            className={selectCls}
            value={params.get(f.name) ?? ""}
            onChange={(e) => push({ [f.name]: e.target.value || null })}
          >
            <option value="">{f.allLabel ?? `${f.label}: הכול`}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ))}
        {sorts && (
          <select
            aria-label="מיון"
            className={selectCls}
            value={params.get("sort") ?? sorts[0].value}
            onChange={(e) => push({ sort: e.target.value === sorts[0].value ? null : e.target.value })}
          >
            {sorts.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
