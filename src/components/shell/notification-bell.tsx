"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Popover } from "radix-ui";
import {
  Bell,
  BellRing,
  CheckCheck,
  ClipboardCheck,
  Eye,
  FileSignature,
  Handshake,
  Inbox,
  ListChecks,
  ListTodo,
  PhoneForwarded,
  Receipt,
  ReceiptText,
  ShieldCheck,
  Sun,
  ThumbsUp,
  UserPlus,
  Wallet,
  Workflow,
} from "lucide-react";
import { markNotificationsRead, myNotifications, unreadCount, type InboxItem } from "@/lib/actions/notifications";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export const KIND_ICON: Record<string, typeof Bell> = {
  daily_digest: Sun,
  task_assigned: ListTodo,
  task_completed: ListChecks,
  questionnaire_submitted: ClipboardCheck,
  approval_response: ThumbsUp,
  proposal_response: ReceiptText,
  proposal_viewed: Eye,
  contract_signed: FileSignature,
  payment_added: Wallet,
  lead_created: Inbox,
  client_created: UserPlus,
  follow_up_assigned: PhoneForwarded,
  expense_added: Receipt,
  project_status: Workflow,
  partner_agreement: Handshake,
  team_changes: ShieldCheck,
};

export function NotificationRow({ n, onOpen }: { n: InboxItem; onOpen?: () => void }) {
  const Icon = KIND_ICON[n.kind] ?? BellRing;
  const unread = !n.read_at;
  const inner = (
    <>
      <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", unread ? "bg-accent-soft text-accent" : "bg-sunken text-ink-3")}>
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm leading-snug", unread ? "font-semibold text-ink" : "text-ink-2")}>{n.title}</span>
        {n.body && <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-ink-3">{n.body}</span>}
        <span className="mt-1 block text-[11px] text-ink-3">{timeAgo(n.created_at)}</span>
      </span>
      {unread && <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-label="לא נקרא" />}
    </>
  );
  const cls = "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-sunken/60";
  return n.url ? (
    <Link href={n.url} onClick={onOpen} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** Top-bar bell: unread badge, latest items, "mark all read". */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [pending, start] = useTransition();

  // The server count wins whenever the layout re-renders (after any action),
  // and a navigation closes the panel — both adjusted during render.
  const [seen, setSeen] = useState({ initialUnread, pathname });
  if (seen.initialUnread !== initialUnread || seen.pathname !== pathname) {
    setSeen({ initialUnread, pathname });
    if (seen.initialUnread !== initialUnread) setUnread(initialUnread);
    if (seen.pathname !== pathname) setOpen(false);
  }

  const load = useCallback(async () => {
    const r = await myNotifications(20);
    if (r.ok) {
      setItems(r.data.items);
      setUnread(r.data.unread);
    }
  }, []);

  // Light polling while the tab is visible — new items show up without a reload.
  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      setUnread(await unreadCount());
    };
    const id = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (o) void load();
  };

  const markAll = () =>
    start(async () => {
      await markNotificationsRead();
      setUnread(0);
      setItems((list) => list?.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) ?? null);
      router.refresh();
    });

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="relative grid size-10 place-items-center rounded-md text-ink-2 hover:bg-sunken hover:text-ink"
          aria-label={unread ? `התראות — ${unread} חדשות` : "התראות"}
        >
          <Bell className="size-5" aria-hidden />
          {unread > 0 && (
            <span className="absolute end-1 top-1 grid min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-[18px] text-white num" aria-hidden>
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 flex max-h-[min(70vh,560px)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-3 outline-none data-[state=open]:animate-[menu-in_140ms_ease-out]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <span className="text-sm font-semibold text-ink">התראות</span>
            {unread > 0 && (
              <button type="button" onClick={markAll} disabled={pending} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline disabled:opacity-50">
                <CheckCheck className="size-3.5" aria-hidden />
                סימון הכול כנקרא
              </button>
            )}
          </div>
          <div className="scrollbar-thin flex-1 overflow-y-auto">
            {items === null ? (
              <ul className="flex flex-col gap-3 p-4" aria-label="טוען">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="flex gap-3">
                    <span className="size-8 shrink-0 animate-pulse rounded-full bg-sunken" />
                    <span className="flex-1 space-y-2 pt-1">
                      <span className="block h-3 w-2/3 animate-pulse rounded bg-sunken" />
                      <span className="block h-2.5 w-1/2 animate-pulse rounded bg-sunken" />
                    </span>
                  </li>
                ))}
              </ul>
            ) : items.length ? (
              <ul className="divide-y divide-line">
                {items.map((n) => (
                  <li key={n.id}>
                    <NotificationRow
                      n={n}
                      onOpen={() => {
                        setOpen(false);
                        if (!n.read_at) {
                          setUnread((u) => Math.max(0, u - 1));
                          void markNotificationsRead([n.id]);
                        }
                      }}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-6 py-10 text-center">
                <Bell className="mx-auto size-6 text-ink-3" aria-hidden />
                <p className="mt-2 text-sm font-medium text-ink">אין התראות</p>
                <p className="mt-1 text-xs text-ink-3">כשמשהו קורה — ליד, תשלום, חתימה, משימה — זה יופיע כאן.</p>
              </div>
            )}
          </div>
          <Link href="/notifications" onClick={() => setOpen(false)} className="border-t border-line px-4 py-2.5 text-center text-sm font-medium text-accent hover:bg-sunken/60">
            כל ההתראות
          </Link>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
