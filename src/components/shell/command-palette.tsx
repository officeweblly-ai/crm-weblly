"use client";

import { Dialog } from "radix-ui";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarDays, CornerDownLeft, FileSignature, FolderKanban, Inbox, ListChecks, Loader2, ReceiptText, Search, Users, type LucideIcon } from "lucide-react";
import { globalSearch, type SearchHit } from "@/lib/actions/operations";
import { cn } from "@/lib/utils";

const TYPE: Record<SearchHit["type"], { label: string; icon: LucideIcon }> = {
  client: { label: "לקוח", icon: Users },
  lead: { label: "ליד", icon: Inbox },
  project: { label: "פרויקט", icon: FolderKanban },
  proposal: { label: "הצעה", icon: ReceiptText },
  contract: { label: "חוזה", icon: FileSignature },
  task: { label: "משימה", icon: ListChecks },
};

export type PaletteAction = { id: string; label: string; hint?: string; icon: LucideIcon; run: () => void };

/**
 * ⌘K / Ctrl+K / "/" — one box that finds clients, projects, proposals,
 * contracts, tasks and leads, and jumps to pages or create actions.
 */
export function CommandPalette({ open, onOpenChange, actions }: { open: boolean; onOpenChange: (o: boolean) => void; actions: PaletteAction[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await globalSearch(term).catch(() => []);
      if (alive) {
        setHits(r);
        setActive(0);
        setLoading(false);
      }
    }, 160);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const term = q.trim();
  const filteredActions = useMemo(() => (term ? actions.filter((a) => a.label.includes(term)) : actions), [actions, term]);
  const shownHits = term.length >= 2 ? hits : [];
  const rows: { key: string; node: ReactNode; run: () => void }[] = [
    ...shownHits.map((h) => {
      const T = TYPE[h.type];
      return {
        key: `${h.type}-${h.id}`,
        run: () => router.push(h.href),
        node: (
          <>
            <T.icon className="size-4 shrink-0 text-ink-3" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              <span className="text-ink">{h.title}</span>
              {h.subtitle && <span className="text-ink-3"> · {h.subtitle}</span>}
            </span>
            <span className="shrink-0 text-xs text-ink-3">{T.label}</span>
          </>
        ),
      };
    }),
    ...filteredActions.map((a) => ({
      key: a.id,
      run: a.run,
      node: (
        <>
          <a.icon className="size-4 shrink-0 text-ink-3" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-ink">{a.label}</span>
          {a.hint && <span className="shrink-0 text-xs text-ink-3">{a.hint}</span>}
        </>
      ),
    })),
  ];

  const go = (i: number) => {
    const r = rows[i];
    if (!r) {
      if (term) router.push(`/search?q=${encodeURIComponent(term)}`);
      onOpenChange(false);
      return;
    }
    onOpenChange(false);
    r.run();
  };

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setQ("");
          setHits([]);
          setActive(0);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/25 data-[state=open]:animate-[fade-in_140ms_ease-out]" />
        <Dialog.Content
          className="fixed inset-x-3 top-[10vh] z-50 mx-auto flex max-h-[70dvh] max-w-xl flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-3 outline-none data-[state=open]:animate-[pop-in_160ms_cubic-bezier(0.2,0.8,0.2,1)]"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">חיפוש ופעולות</Dialog.Title>
          <div className="flex items-center gap-2 border-b border-line px-4">
            {loading ? <Loader2 className="size-4 animate-spin text-ink-3" aria-hidden /> : <Search className="size-4 text-ink-3" aria-hidden />}
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
                if (e.target.value.trim().length < 2) setHits([]);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(rows.length - 1, a + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(0, a - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(active);
                }
              }}
              placeholder="חיפוש לקוח, פרויקט, הצעה, חוזה או משימה…"
              aria-label="חיפוש"
              role="combobox"
              aria-expanded
              aria-controls="palette-list"
              aria-activedescendant={rows[active] ? `palette-${rows[active].key}` : undefined}
              className="h-13 min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink-3 focus:outline-none"
            />
            <span className="kbd hidden sm:inline-grid">Esc</span>
          </div>
          <ul ref={listRef} id="palette-list" role="listbox" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-1.5">
            {term.length >= 2 && !loading && !shownHits.length && (
              <li className="px-3 py-3 text-sm text-ink-3">לא נמצאו תוצאות עבור &quot;{term}&quot;. Enter לחיפוש מלא.</li>
            )}
            {shownHits.length > 0 && <li className="px-3 pb-1 pt-2 text-xs font-medium text-ink-3">תוצאות</li>}
            {rows.map((r, i) => (
              <li key={r.key}>
                {i === shownHits.length && <div className="px-3 pb-1 pt-2 text-xs font-medium text-ink-3">{term ? "פעולות" : "מעבר מהיר ויצירה"}</div>}
                <button
                  type="button"
                  id={`palette-${r.key}`}
                  role="option"
                  aria-selected={i === active}
                  data-i={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(i)}
                  className={cn("flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-start text-sm", i === active ? "bg-sunken" : "")}
                >
                  {r.node}
                  {i === active && <CornerDownLeft className="size-3.5 shrink-0 text-ink-3" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden items-center gap-3 border-t border-line px-4 py-2 text-xs text-ink-3 sm:flex">
            <span className="flex items-center gap-1"><span className="kbd">↑</span><span className="kbd">↓</span> ניווט</span>
            <span className="flex items-center gap-1"><span className="kbd">↵</span> פתיחה</span>
            <span className="ms-auto flex items-center gap-1"><CalendarDays className="size-3.5" aria-hidden />חיפוש בכל המערכת</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
