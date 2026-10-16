"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BriefcaseBusiness,
  CalendarDays,
  CalendarPlus,
  ChevronsLeft,
  ChevronsRight,
  Clapperboard,
  ClipboardList,
  FileSignature,
  Files,
  FolderKanban,
  FolderPlus,
  Inbox,
  Landmark,
  LayoutGrid,
  ListChecks,
  ListPlus,
  LogOut,
  Menu as MenuIcon,
  Plus,
  Receipt,
  ReceiptText,
  Search,
  Settings,
  Sun,
  UserPlus,
  Users,
  UsersRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { Logo, LogoMark } from "@/components/brand/logo";
import { EventFormModal, type EventDraft, type EventOptions } from "@/components/calendar/event-form";
import { QuickTaskModal, type TaskDraft } from "@/components/tasks/quick-task";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/actions/auth";
import type { Permission } from "@/lib/domain/permissions";
import { CommandPalette, type PaletteAction } from "./command-palette";
import { NotificationBell } from "./notification-bell";

type NavItem = { href: string; label: string; icon: LucideIcon; area?: Permission };

/** The business flow, in order. Everything else lives inside its entity or under "כלים". */
export const NAV_MAIN: NavItem[] = [
  { href: "/", label: "ראשי", icon: LayoutGrid },
  { href: "/leads", label: "לידים", icon: Inbox, area: "leads" },
  { href: "/clients", label: "לקוחות", icon: Users },
  { href: "/proposals", label: "הצעות מחיר", icon: ReceiptText, area: "proposals" },
  { href: "/contracts", label: "חוזים", icon: FileSignature },
  { href: "/projects", label: "פרויקטים", icon: FolderKanban },
  { href: "/tasks", label: "משימות", icon: ListChecks },
  { href: "/calendar", label: "יומן", icon: CalendarDays },
  { href: "/finances", label: "כספים", icon: Wallet, area: "finances" },
  { href: "/files", label: "מסמכים", icon: Files },
];

export const NAV_TOOLS: NavItem[] = [
  { href: "/today", label: "תוכנית עבודה", icon: Sun },
  { href: "/questionnaires", label: "שאלוני אפיון", icon: ClipboardList },
  { href: "/business", label: "ניהול העסק", icon: Landmark },
  { href: "/team", label: "צוות", icon: UsersRound },
  { href: "/social", label: "סושיאל", icon: Clapperboard, area: "social" },
  { href: "/portfolio", label: "תיק עבודות", icon: BriefcaseBusiness, area: "social" },
];

const SETTINGS: NavItem = { href: "/settings", label: "הגדרות", icon: Settings };

export type AllowedAreas = "all" | string[];
const allowedFor = (allowed: AllowedAreas, item: NavItem) => !item.area || allowed === "all" || allowed.includes(item.area);

const MOBILE_TABS: NavItem[] = [NAV_MAIN[0], NAV_MAIN[7], NAV_MAIN[5], NAV_MAIN[6]];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

// ---------------------------------------------------------------------------
// Global create: task / event modals + command palette, reachable from anywhere.
// ---------------------------------------------------------------------------
type CreateApi = {
  newTask: (draft?: TaskDraft) => void;
  newEvent: (draft?: EventDraft) => void;
  editEvent: (draft: EventDraft) => void;
  openSearch: () => void;
  options: EventOptions;
};
const CreateContext = createContext<CreateApi | null>(null);

export function useCreate(): CreateApi {
  const ctx = useContext(CreateContext);
  if (!ctx) throw new Error("useCreate outside AppShell");
  return ctx;
}

export type ShellUser = { id: string; name: string; email: string; color: string | null };

export function AppShell({
  children,
  businessName,
  user,
  allowed,
  unread,
  collapsed: initialCollapsed,
  options,
}: {
  children: ReactNode;
  businessName: string;
  user: ShellUser;
  allowed: AllowedAreas;
  unread: number;
  collapsed: boolean;
  options: EventOptions;
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskDraft, setTaskDraft] = useState<TaskDraft>({});
  const [eventOpen, setEventOpen] = useState(false);
  const [eventDraft, setEventDraft] = useState<EventDraft>({});
  const [searchOpen, setSearchOpen] = useState(false);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `sidebar=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  };

  const api = useMemo<CreateApi>(
    () => ({
      newTask: (d = {}) => {
        setTaskDraft(d);
        setTaskOpen(true);
      },
      newEvent: (d = {}) => {
        setEventDraft({ starts_on: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date()), ...d });
        setEventOpen(true);
      },
      editEvent: (d) => {
        setEventDraft(d);
        setEventOpen(true);
      },
      openSearch: () => setSearchOpen(true),
      options,
    }),
    [options],
  );

  // ⌘K / Ctrl+K anywhere; "/" when not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if ((e.key === "k" || e.key === "K" || e.key === "כ") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((o) => !o);
      } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const may = useCallback((area: Permission) => allowed === "all" || allowed.includes(area), [allowed]);
  const paletteActions: PaletteAction[] = useMemo(
    () => [
      { id: "new-task", label: "משימה חדשה", icon: ListPlus, run: () => api.newTask() },
      { id: "new-event", label: "אירוע חדש ביומן", icon: CalendarPlus, run: () => api.newEvent() },
      ...(may("leads") ? [{ id: "new-lead", label: "ליד חדש", icon: Inbox, run: () => router.push("/leads?new=1") }] : []),
      { id: "new-client", label: "לקוח חדש", icon: UserPlus, run: () => router.push("/clients?new=1") },
      ...(may("proposals") ? [{ id: "new-proposal", label: "הצעת מחיר חדשה", icon: ReceiptText, run: () => router.push("/proposals/new") }] : []),
      { id: "new-project", label: "פרויקט חדש", icon: FolderPlus, run: () => router.push("/projects?new=1") },
      ...[...NAV_MAIN, ...NAV_TOOLS, SETTINGS]
        .filter((n) => allowedFor(allowed, n))
        .map((n) => ({ id: `go-${n.href}`, label: n.label, hint: "מעבר", icon: n.icon, run: () => router.push(n.href) })),
    ],
    [api, may, allowed, router],
  );

  return (
    <CreateContext.Provider value={api}>
      <div className="min-h-dvh" data-sidebar={collapsed ? "collapsed" : "open"}>
        <Sidebar businessName={businessName} user={user} allowed={allowed} collapsed={collapsed} onToggle={toggle} />
        <div className={cn("transition-[padding] duration-200 ease-out print:ps-0", collapsed ? "lg:ps-(--sidebar-w-collapsed)" : "lg:ps-(--sidebar-w)")}>
          <TopBar businessName={businessName} allowed={allowed} unread={unread} user={user} onSearch={() => setSearchOpen(true)} />
          <main id="main" className="mx-auto w-full max-w-[1440px] px-4 pb-28 pt-4 sm:px-6 sm:pt-5 lg:px-8 lg:pb-12 lg:pt-6 print:max-w-none print:p-0">
            {children}
          </main>
        </div>
        <MobileNav businessName={businessName} user={user} allowed={allowed} />
      </div>
      <QuickTaskModal open={taskOpen} onOpenChange={setTaskOpen} options={options} draft={taskDraft} />
      <EventFormModal open={eventOpen} onOpenChange={setEventOpen} draft={eventDraft} options={options} />
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} actions={paletteActions} />
    </CreateContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
function NavLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        title={collapsed ? item.label : undefined}
        className={cn(
          "group relative flex h-10 items-center gap-3 rounded-md text-[0.875rem] font-medium transition-colors lg:h-9",
          collapsed ? "justify-center px-0" : "px-2.5",
          active ? "bg-ink/[0.06] text-ink" : "text-ink-2 hover:bg-ink/[0.04] hover:text-ink",
        )}
      >
        {active && <span className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-accent" aria-hidden />}
        <Icon className={cn("size-[18px] shrink-0", active ? "text-accent" : "text-ink-3 group-hover:text-ink-2")} strokeWidth={1.75} aria-hidden />
        <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
      </Link>
    </li>
  );
}

function NavLists({ allowed, collapsed, onNavigate }: { allowed: AllowedAreas; collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const tools = NAV_TOOLS.filter((i) => allowedFor(allowed, i));
  const toolActive = tools.some((t) => isActive(pathname, t.href));
  return (
    <>
      <ul className="flex flex-col gap-px">
        {NAV_MAIN.filter((i) => allowedFor(allowed, i)).map((i) => (
          <NavLink key={i.href} item={i} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </ul>
      {collapsed ? (
        <ul className="mt-3 flex flex-col gap-px border-t border-line pt-3">
          {tools.map((i) => (
            <NavLink key={i.href} item={i} collapsed onNavigate={onNavigate} />
          ))}
        </ul>
      ) : (
        <details open={toolActive || undefined} className="group mt-4">
          <summary className="flex h-8 cursor-pointer list-none items-center justify-between rounded-md px-2.5 text-xs font-medium text-ink-3 hover:text-ink-2 [&::-webkit-details-marker]:hidden">
            כלים נוספים
            <Plus className="size-3.5 transition-transform group-open:rotate-45" aria-hidden />
          </summary>
          <ul className="mt-0.5 flex flex-col gap-px">
            {tools.map((i) => (
              <NavLink key={i.href} item={i} onNavigate={onNavigate} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function Avatar({ user, className }: { user: ShellUser; className?: string }) {
  return (
    <span
      className={cn("grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white", className)}
      style={{ background: user.color || "var(--ink-2)" }}
      aria-hidden
    >
      {(user.name || user.email).trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Sidebar({ businessName, user, allowed, collapsed, onToggle }: { businessName: string; user: ShellUser; allowed: AllowedAreas; collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 start-0 z-30 hidden flex-col border-e border-line bg-surface py-3 transition-[width] duration-200 ease-out lg:flex print:hidden",
        collapsed ? "w-(--sidebar-w-collapsed) px-2" : "w-(--sidebar-w) px-3",
      )}
    >
      <div className={cn("flex h-10 items-center pb-3", collapsed ? "justify-center" : "px-1.5")}>
        <Link href="/" aria-label={`${businessName} — ראשי`} className="flex items-center">
          {collapsed ? <LogoMark className="h-6" /> : <Logo size="md" />}
        </Link>
      </div>
      <nav aria-label="ניווט ראשי" className="scrollbar-thin mt-2 flex-1 overflow-y-auto overflow-x-hidden">
        <NavLists allowed={allowed} collapsed={collapsed} />
      </nav>
      <div className="flex flex-col gap-px border-t border-line pt-2">
        <ul>
          <NavLink item={SETTINGS} collapsed={collapsed} />
        </ul>
        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? "הרחבת התפריט" : "כיווץ התפריט"}
          aria-label={collapsed ? "הרחבת התפריט" : "כיווץ התפריט"}
          className={cn("flex h-9 items-center gap-3 rounded-md text-[0.875rem] text-ink-3 hover:bg-ink/[0.04] hover:text-ink", collapsed ? "justify-center" : "px-2.5")}
        >
          {collapsed ? <ChevronsLeft className="size-[18px]" aria-hidden /> : <ChevronsRight className="size-[18px]" aria-hidden />}
          {!collapsed && <span>כיווץ</span>}
        </button>
        <div className={cn("mt-1 flex items-center gap-2.5 rounded-md py-1.5", collapsed ? "justify-center" : "px-1.5")} title={collapsed ? user.name : undefined}>
          <Avatar user={user} />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink">{user.name || "המשתמש שלי"}</div>
              <div className="truncate text-xs text-ink-3" dir="ltr" style={{ textAlign: "right" }}>{user.email}</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Top bar: search · + חדש · notifications · user. Nothing else.
// ---------------------------------------------------------------------------
export function QuickAdd({ compact, allowed }: { compact?: boolean; allowed: AllowedAreas }) {
  const router = useRouter();
  const { newTask, newEvent } = useCreate();
  const may = (area: Permission) => allowed === "all" || allowed.includes(area);
  return (
    <Menu
      trigger={
        compact ? (
          <Button size="icon" aria-label="יצירה חדשה">
            <Plus className="size-5!" />
          </Button>
        ) : (
          <Button size="sm" className="h-9 px-3">
            <Plus aria-hidden />
            חדש
          </Button>
        )
      }
    >
      <MenuLabel>יצירה</MenuLabel>
      <MenuItem onSelect={() => newTask()}><ListPlus /> משימה</MenuItem>
      <MenuItem onSelect={() => newEvent()}><CalendarPlus /> אירוע ביומן</MenuItem>
      <MenuSeparator />
      {may("leads") && <MenuItem onSelect={() => router.push("/leads?new=1")}><Inbox /> ליד</MenuItem>}
      <MenuItem onSelect={() => router.push("/clients?new=1")}><UserPlus /> לקוח</MenuItem>
      {may("proposals") && <MenuItem onSelect={() => router.push("/proposals/new")}><ReceiptText /> הצעת מחיר</MenuItem>}
      {may("contracts") && <MenuItem onSelect={() => router.push("/contracts/new")}><FileSignature /> חוזה</MenuItem>}
      <MenuItem onSelect={() => router.push("/projects?new=1")}><FolderPlus /> פרויקט</MenuItem>
      {may("finances") && (
        <>
          <MenuSeparator />
          <MenuItem onSelect={() => router.push("/finances?new=1")}><Wallet /> רישום תשלום</MenuItem>
          <MenuItem onSelect={() => router.push("/business/expenses?new=1")}><Receipt /> הוצאה</MenuItem>
        </>
      )}
    </Menu>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const router = useRouter();
  return (
    <Menu
      trigger={
        <button type="button" className="grid size-9 place-items-center rounded-full hover:ring-4 hover:ring-sunken" aria-label="תפריט משתמש">
          <Avatar user={user} />
        </button>
      }
    >
      <div className="px-2.5 py-2">
        <div className="text-sm font-medium text-ink">{user.name}</div>
        <div className="text-xs text-ink-3" dir="ltr" style={{ textAlign: "right" }}>{user.email}</div>
      </div>
      <MenuSeparator />
      <MenuItem onSelect={() => router.push("/settings")}><Settings /> הגדרות</MenuItem>
      <MenuItem onSelect={() => router.push("/notifications")}><Inbox /> כל ההתראות</MenuItem>
      <MenuSeparator />
      <MenuItem onSelect={() => void signOut()}><LogOut /> התנתקות</MenuItem>
    </Menu>
  );
}

export function TopBar({ businessName, allowed, unread, user, onSearch }: { businessName: string; allowed: AllowedAreas; unread: number; user: ShellUser; onSearch: () => void }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/85 pt-[env(safe-area-inset-top)] backdrop-blur-md print:hidden">
      <div className="flex h-14 items-center gap-2 px-3 sm:px-4 lg:px-8">
        <Link href="/" className="flex items-center lg:hidden" aria-label={`${businessName} — ראשי`}>
          <Logo size="sm" />
        </Link>
        <button
          type="button"
          onClick={onSearch}
          className="hidden h-9 w-full max-w-sm items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm text-ink-3 transition-colors hover:border-line-strong lg:flex"
        >
          <Search className="size-4" aria-hidden />
          <span className="flex-1 text-start">חיפוש בכל המערכת</span>
          <span className="flex items-center gap-0.5" dir="ltr"><span className="kbd">⌘</span><span className="kbd">K</span></span>
        </button>
        <div className="ms-auto flex items-center gap-1 sm:gap-1.5">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="חיפוש" onClick={onSearch}>
            <Search className="size-5!" />
          </Button>
          <div className="hidden lg:block">
            <QuickAdd allowed={allowed} />
          </div>
          <NotificationBell initialUnread={unread} />
          <div className="lg:hidden">
            <QuickAdd compact allowed={allowed} />
          </div>
          <div className="hidden lg:block">
            <UserMenu user={user} />
          </div>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Phones/tablets: ראשי · יומן · פרויקטים · משימות + "עוד" drawer.
// ---------------------------------------------------------------------------
export function MobileNav({ businessName, user, allowed }: { businessName: string; user: ShellUser; allowed: AllowedAreas }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const moreActive = !MOBILE_TABS.some((t) => isActive(pathname, t.href));

  return (
    <>
      <nav aria-label="ניווט ראשי" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden print:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {MOBILE_TABS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex h-15 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-ink" : "text-ink-3")}>
                  <Icon className={cn("size-[22px]", active && "text-accent")} strokeWidth={active ? 2 : 1.75} aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setOpen(true)} className={cn("flex h-15 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium", moreActive ? "text-ink" : "text-ink-3")} aria-haspopup="dialog">
              <MenuIcon className={cn("size-[22px]", moreActive && "text-accent")} strokeWidth={1.75} aria-hidden />
              עוד
            </button>
          </li>
        </ul>
      </nav>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30 data-[state=open]:animate-[fade-in_180ms_ease-out]" />
          <Dialog.Content className="fixed inset-y-0 start-0 z-50 flex w-[84vw] max-w-xs flex-col bg-surface px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] shadow-3 outline-none data-[state=open]:animate-[drawer-in_260ms_cubic-bezier(0.32,0.72,0,1)]">
            <div className="flex items-center justify-between px-1.5 pb-3">
              <Dialog.Title asChild>
                <div><Logo size="md" /></div>
              </Dialog.Title>
              <Dialog.Description className="sr-only">כל אזורי {businessName}</Dialog.Description>
              <Dialog.Close className="grid size-10 place-items-center rounded-md text-ink-3 hover:bg-sunken" aria-label="סגירת התפריט">
                <X className="size-5" />
              </Dialog.Close>
            </div>
            <nav className="scrollbar-thin flex-1 overflow-y-auto" aria-label="כל האזורים">
              <NavLists allowed={allowed} onNavigate={() => setOpen(false)} />
              <ul className="mt-3 border-t border-line pt-3">
                <NavLink item={SETTINGS} onNavigate={() => setOpen(false)} />
              </ul>
            </nav>
            <div className="flex items-center gap-2.5 border-t border-line px-1.5 pt-3">
              <Avatar user={user} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{user.name}</div>
                <div className="truncate text-xs text-ink-3" dir="ltr" style={{ textAlign: "right" }}>{user.email}</div>
              </div>
              <form action={signOut}>
                <button type="submit" className="grid size-10 place-items-center rounded-md text-ink-3 hover:bg-sunken hover:text-ink" aria-label="התנתקות">
                  <LogOut className="size-4" />
                </button>
              </form>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
