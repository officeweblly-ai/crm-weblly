"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { useState, type FormEvent } from "react";
import {
  Gauge,
  Sun,
  BriefcaseBusiness,
  Inbox,
  Users,
  FolderKanban,
  ClipboardList,
  ListChecks,
  Wallet,
  Files,
  Settings,
  Clapperboard,
  FileSignature,
  Menu as MenuIcon,
  Plus,
  Search,
  LogOut,
  X,
  UserPlus,
  FolderPlus,
  ListPlus,
  Send,
  ReceiptText,
} from "lucide-react";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/actions/auth";

export const NAV = [
  { href: "/", label: "דשבורד", icon: Gauge },
  { href: "/today", label: "היום", icon: Sun },
  { href: "/leads", label: "לידים", icon: Inbox },
  { href: "/clients", label: "לקוחות", icon: Users },
  { href: "/projects", label: "פרויקטים", icon: FolderKanban },
  { href: "/questionnaires", label: "שאלוני אפיון", icon: ClipboardList },
  { href: "/proposals", label: "הצעות מחיר", icon: ReceiptText },
  { href: "/tasks", label: "משימות", icon: ListChecks },
  { href: "/finances", label: "כספים", icon: Wallet },
  { href: "/files", label: "קבצים", icon: Files },
  { href: "/social", label: "סושיאל", icon: Clapperboard },
  { href: "/portfolio", label: "תיק עבודות", icon: BriefcaseBusiness },
  { href: "/settings", label: "הגדרות", icon: Settings },
] as const;

// Phone bottom bar: the day starts on "היום" (also the installed app's start page);
// the dashboard and every other area live in "עוד".
const MOBILE_TABS = ["/today", "/clients", "/projects", "/tasks"].map((href) => NAV.find((n) => n.href === href)!);

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function Brand({ name }: { name: string }) {
  return (
    <Link href="/" className="flex items-center rounded-md px-1 py-1" aria-label={`${name} — דשבורד`}>
      <Logo size="md" />
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                active ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:bg-sunken hover:text-ink",
              )}
            >
              <Icon className={cn("size-[18px] shrink-0", active ? "text-accent" : "text-ink-3")} aria-hidden />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function UserBlock({ name, email }: { name: string; email: string }) {
  return (
    <div className="flex items-center gap-2 border-t border-line pt-3">
      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-sunken text-xs font-semibold text-ink-2" aria-hidden>
        {(name || email).slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">{name || "המשתמש שלי"}</div>
        <div className="truncate font-mono text-xs text-ink-3" dir="ltr" style={{ textAlign: "right" }}>
          {email}
        </div>
      </div>
      <form action={signOut}>
        <button type="submit" className="grid size-9 place-items-center rounded-md text-ink-3 hover:bg-sunken hover:text-ink" aria-label="התנתקות" title="התנתקות">
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
}

export function Sidebar({ businessName, userName, email }: { businessName: string; userName: string; email: string }) {
  return (
    <aside className="fixed inset-y-0 start-0 z-30 hidden w-60 flex-col border-e border-line bg-surface px-3 py-4 lg:flex print:hidden">
      <div className="px-1 pb-5">
        <Brand name={businessName} />
      </div>
      <nav aria-label="ניווט ראשי" className="scrollbar-thin flex-1 overflow-y-auto">
        <NavLinks />
      </nav>
      <UserBlock name={userName} email={email} />
    </aside>
  );
}

export function QuickAdd({ compact }: { compact?: boolean }) {
  const router = useRouter();
  return (
    <Menu
      trigger={
        compact ? (
          <Button size="icon" aria-label="יצירה מהירה">
            <Plus className="size-5!" />
          </Button>
        ) : (
          <Button>
            <Plus aria-hidden />
            חדש
          </Button>
        )
      }
    >
      <MenuLabel>יצירה מהירה</MenuLabel>
      <MenuItem onSelect={() => router.push("/leads?new=1")}>
        <Inbox /> ליד חדש
      </MenuItem>
      <MenuItem onSelect={() => router.push("/clients?new=1")}>
        <UserPlus /> לקוח חדש
      </MenuItem>
      <MenuItem onSelect={() => router.push("/projects?new=1")}>
        <FolderPlus /> פרויקט חדש
      </MenuItem>
      <MenuSeparator />
      <MenuItem onSelect={() => router.push("/questionnaires?new=1")}>
        <Send /> שליחת שאלון אפיון
      </MenuItem>
      <MenuItem onSelect={() => router.push("/proposals/new")}>
        <ReceiptText /> הצעת מחיר
      </MenuItem>
      <MenuItem onSelect={() => router.push("/tasks?new=1")}>
        <ListPlus /> משימה חדשה
      </MenuItem>
      <MenuItem onSelect={() => router.push("/finances?new=1")}>
        <Wallet /> רישום תשלום
      </MenuItem>
      <MenuItem onSelect={() => router.push("/contracts/new")}>
        <FileSignature /> הסכם חדש
      </MenuItem>
      <MenuItem onSelect={() => router.push("/social?new=1")}>
        <Clapperboard /> תיקיית סושיאל
      </MenuItem>
    </Menu>
  );
}

export function SearchBox({ className, autoFocus, onDone }: { className?: string; autoFocus?: boolean; onDone?: () => void }) {
  const router = useRouter();
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
    if (!q) return;
    onDone?.();
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };
  return (
    <form role="search" onSubmit={submit} className={cn("relative", className)}>
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
      <input
        name="q"
        type="search"
        autoFocus={autoFocus}
        placeholder="חיפוש לקוח, עסק, טלפון או פרויקט"
        aria-label="חיפוש"
        className="h-10 w-full rounded-md border border-line bg-sunken/70 ps-9 pe-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:bg-surface focus:outline-none focus:ring-3 focus:ring-accent/15"
      />
    </form>
  );
}

export function TopBar({ businessName }: { businessName: string }) {
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur-sm print:hidden">
      <div className="flex h-14 items-center gap-3 px-4 lg:h-16 lg:px-8">
        <div className="lg:hidden">
          <Brand name={businessName} />
        </div>
        <SearchBox className="hidden max-w-md flex-1 lg:block" />
        <div className="ms-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="חיפוש" onClick={() => setSearchOpen((v) => !v)}>
            <Search className="size-5!" />
          </Button>
          <div className="hidden lg:block">
            <QuickAdd />
          </div>
          <div className="lg:hidden">
            <QuickAdd compact />
          </div>
        </div>
      </div>
      {searchOpen && (
        <div className="border-t border-line px-4 py-2 lg:hidden">
          <SearchBox autoFocus onDone={() => setSearchOpen(false)} />
        </div>
      )}
    </header>
  );
}

/** Phones/tablets: four primary destinations + "more" drawer with everything. */
export function MobileNav({ businessName, userName, email }: { businessName: string; userName: string; email: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const moreActive = !MOBILE_TABS.some((t) => isActive(pathname, t.href));

  return (
    <>
      <nav
        aria-label="ניווט ראשי"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm lg:hidden print:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {MOBILE_TABS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-accent" : "text-ink-3")}
                >
                  <Icon className="size-[22px]" aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={cn("flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium", moreActive ? "text-accent" : "text-ink-3")}
              aria-haspopup="dialog"
            >
              <MenuIcon className="size-[22px]" aria-hidden />
              עוד
            </button>
          </li>
        </ul>
      </nav>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30 data-[state=open]:animate-[fade-in_180ms_ease-out]" />
          <Dialog.Content className="fixed inset-y-0 start-0 z-50 flex w-[82vw] max-w-xs flex-col bg-surface px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-3 outline-none data-[state=open]:animate-[drawer-in_260ms_cubic-bezier(0.32,0.72,0,1)]">
            <div className="flex items-center justify-between px-1 pb-4">
              <Dialog.Title asChild>
                <div>
                  <Brand name={businessName} />
                </div>
              </Dialog.Title>
              <Dialog.Description className="sr-only">כל אזורי המערכת</Dialog.Description>
              <Dialog.Close className="grid size-10 place-items-center rounded-md text-ink-3 hover:bg-sunken" aria-label="סגירת התפריט">
                <X className="size-5" />
              </Dialog.Close>
            </div>
            <nav className="flex-1 overflow-y-auto" aria-label="כל האזורים">
              <NavLinks onNavigate={() => setOpen(false)} />
            </nav>
            <UserBlock name={userName} email={email} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
