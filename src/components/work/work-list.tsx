"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlarmClock,
  BellOff,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  ChevronLeft,
  CircleSlash,
  ClipboardList,
  Clapperboard,
  Code2,
  FileSignature,
  Hourglass,
  Inbox,
  Link2,
  ListChecks,
  MoreHorizontal,
  PhoneCall,
  ReceiptText,
  Rocket,
  Stamp,
  UserRoundSearch,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { FollowUpModal } from "@/components/relationship/relationship-forms";
import { setTaskStatus } from "@/lib/actions/crm";
import { dismissAlert, setFollowUpStatus, snoozeAlert } from "@/lib/actions/relationship";
import { relativeDue } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WorkGroup, WorkItem } from "@/lib/work-engine";

const ICON: Record<WorkGroup, { icon: LucideIcon; cls: string }> = {
  blocked: { icon: CircleSlash, cls: "bg-danger-soft text-danger" },
  overdue: { icon: AlarmClock, cls: "bg-danger-soft text-danger" },
  task_today: { icon: ListChecks, cls: "bg-accent-soft text-accent" },
  task_soon: { icon: ListChecks, cls: "bg-sunken text-ink-2" },
  follow_up: { icon: PhoneCall, cls: "bg-accent-soft text-accent" },
  lead: { icon: Inbox, cls: "bg-warn-soft text-warn" },
  questionnaire: { icon: ClipboardList, cls: "bg-info-soft text-info" },
  proposal: { icon: ReceiptText, cls: "bg-info-soft text-info" },
  contract: { icon: FileSignature, cls: "bg-sunken text-ink-2" },
  payment: { icon: Wallet, cls: "bg-ok-soft text-ok" },
  approval: { icon: Stamp, cls: "bg-warn-soft text-warn" },
  project_deadline: { icon: CalendarClock, cls: "bg-warn-soft text-warn" },
  project_stalled: { icon: Hourglass, cls: "bg-sunken text-ink-2" },
  project_no_next: { icon: Hourglass, cls: "bg-sunken text-ink-2" },
  deploy: { icon: Rocket, cls: "bg-accent-soft text-accent" },
  waiting: { icon: Hourglass, cls: "bg-sunken text-ink-3" },
  client_health: { icon: UserRoundSearch, cls: "bg-sunken text-ink-2" },
  past_client: { icon: UserRoundSearch, cls: "bg-sunken text-ink-2" },
  portfolio: { icon: BriefcaseBusiness, cls: "bg-sunken text-ink-2" },
  social: { icon: Clapperboard, cls: "bg-sunken text-ink-2" },
  links: { icon: Link2, cls: "bg-sunken text-ink-2" },
  handoff: { icon: Code2, cls: "bg-sunken text-ink-2" },
};

type Opt = { value: string; label: string };

function Row({ item, staff, people }: { item: WorkItem; staff: Opt[]; people: Map<string, string> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  const [followUp, setFollowUp] = useState(false);
  const { icon: Icon, cls } = ICON[item.group];
  const urgent = item.rank <= 2;
  const followUpId = item.key.startsWith("followup:") ? item.key.slice(9) : null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setGone(true);
        if (r.message) toast.success(r.message);
        router.refresh();
      } else toast.error(r.error ?? "הפעולה נכשלה");
    });

  if (gone) return null;
  const owners = item.owners.map((id) => people.get(id)).filter(Boolean);

  return (
    <li className={cn("group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-sunken/40 sm:px-5", pending && "opacity-60")}>
      {item.taskId || followUpId ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={false}
          disabled={pending}
          onClick={() => run(() => (item.taskId ? setTaskStatus(item.taskId, "done") : setFollowUpStatus(followUpId!, "done")))}
          aria-label={`סימון כבוצע: ${item.title}`}
          className="grid size-11 shrink-0 place-items-center rounded-full"
        >
          <span className="grid size-6 place-items-center rounded-md border border-line-strong bg-surface transition-colors group-hover:border-accent">
            <Check className="size-3.5 text-transparent group-hover:text-accent/60" strokeWidth={3} aria-hidden />
          </span>
        </button>
      ) : (
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", cls)} aria-hidden>
          <Icon className="size-4" />
        </span>
      )}
      <Link href={item.href} className="min-w-0 flex-1 py-0.5">
        <span className="line-clamp-2 text-sm font-medium text-ink">{item.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
          {item.due && item.bucket !== "waiting" && <span className={cn(urgent && "font-medium text-danger")}>{relativeDue(item.due)}</span>}
          {item.detail && <span className={cn("truncate", urgent && !item.due && "font-medium text-danger")}>{item.detail}</span>}
          {owners.length > 0 && <span className="truncate">· {owners.join(" + ")}</span>}
        </span>
      </Link>
      {item.alertKey ? (
        <>
          <Menu trigger={<Button variant="ghost" size="icon" aria-label={`פעולות: ${item.title}`} className="shrink-0"><MoreHorizontal /></Button>}>
            <MenuItem onSelect={() => setFollowUp(true)}><PhoneCall /> קביעת מעקב</MenuItem>
            <MenuItem onSelect={() => router.push(item.href)}><UserRoundSearch /> פתיחת תיק הלקוח</MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => run(() => snoozeAlert(item.alertKey!, 14))}><BellOff /> להזכיר בעוד שבועיים</MenuItem>
            <MenuItem onSelect={() => run(() => snoozeAlert(item.alertKey!, 60))}><BellOff /> להזכיר בעוד חודשיים</MenuItem>
            <MenuItem destructive onSelect={() => run(() => dismissAlert(item.alertKey!))}><X /> הסרה</MenuItem>
          </Menu>
          <FollowUpModal open={followUp} onOpenChange={setFollowUp} clientId={item.clientId} staff={staff} defaultReason="לחזור ללקוח ולבדוק מה שלומו" defaultDays={1} />
        </>
      ) : (
        <ChevronLeft className="size-4 shrink-0 text-ink-3" aria-hidden />
      )}
    </li>
  );
}

export function WorkList({ items, staff, people, limit, moreHref }: { items: WorkItem[]; staff: Opt[]; people: Record<string, string>; limit?: number; moreHref?: string }) {
  const [all, setAll] = useState(false);
  const map = new Map(Object.entries(people));
  const shown = limit && !all ? items.slice(0, limit) : items;
  return (
    <>
      <ul className="divide-y divide-line">
        {shown.map((i) => (
          <Row key={i.key} item={i} staff={staff} people={map} />
        ))}
      </ul>
      {limit && items.length > limit && !all && (
        <div className="border-t border-line px-4 py-2 sm:px-5">
          {moreHref ? (
            <Link href={moreHref} className="text-sm font-medium text-accent hover:underline">עוד {items.length - limit}</Link>
          ) : (
            <button type="button" onClick={() => setAll(true)} className="min-h-10 text-sm font-medium text-accent hover:underline">
              עוד {items.length - limit}
            </button>
          )}
        </div>
      )}
    </>
  );
}
