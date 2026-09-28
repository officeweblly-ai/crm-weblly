import Link from "next/link";
import { Bot, CalendarClock, ClipboardList, FolderOpen, Hourglass, Link2, ListChecks, PlayCircle, Sparkles, Stamp, Wallet } from "lucide-react";
import { LedgerBar, LifecycleRail } from "./lifecycle";
import { NextAction } from "./next-action";
import { Deadline } from "./project-summary";
import { Card, CardBody } from "@/components/ui/card";
import { taskStatus } from "@/lib/domain/labels";
import { relativeDue } from "@/lib/format";
import type { ProjectWithMoney, TaskRow } from "@/lib/data/crm";

const SHORTCUTS = [
  { href: "#questionnaires", label: "אפיון", icon: ClipboardList },
  { href: "#tasks", label: "משימות", icon: ListChecks },
  { href: "#links", label: "קישורים", icon: Link2 },
  { href: "#references", label: "רפרנסים", icon: Sparkles },
  { href: "#files", label: "קבצים", icon: FolderOpen },
  { href: "#approvals", label: "אישורים", icon: Stamp },
  { href: "#ai-handoff", label: "AI Handoff", icon: Bot },
  { href: "#payments", label: "כספים", icon: Wallet },
];

function Cell({ label, icon: Icon, children }: { label: string; icon: typeof Hourglass; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-paper/50 px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </div>
      <div className="mt-1 text-sm text-ink">{children}</div>
    </div>
  );
}

export type WaitingItem = { key: string; label: string; href: string };

/**
 * The top of the project page: where it stands, what's next, what we're
 * waiting for, and one tap to every part of the project. Replaces the old
 * summary card (same rail, next action and ledger) instead of adding a second one.
 */
export function ControlCenter({
  project,
  openTasks,
  doneCount,
  waiting,
}: {
  project: ProjectWithMoney;
  openTasks: TaskRow[];
  doneCount: number;
  waiting: WaitingItem[];
}) {
  const fin = project.financials;
  const active = openTasks.find((t) => t.status === "in_progress") ?? openTasks.find((t) => t.status === "todo" && !(t.blocker && t.blocker.status !== "done")) ?? null;
  const total = openTasks.length + doneCount;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  return (
    <Card>
      <CardBody className="flex flex-col gap-5">
        <LifecycleRail status={project.status} />
        <NextAction projectId={project.id} value={project.next_action} />

        <div className="grid gap-2.5 sm:grid-cols-3">
          <Cell label="משימה פעילה" icon={PlayCircle}>
            {active ? (
              <Link href="#tasks" className="block hover:text-accent">
                <span className="line-clamp-2 font-medium">{active.title}</span>
                <span className="text-xs text-ink-3">
                  {taskStatus.label(active.status)}
                  {active.due_date && ` · ${relativeDue(active.due_date)}`}
                </span>
              </Link>
            ) : (
              <span className="text-ink-3">{openTasks.length ? "כל המשימות הפתוחות חסומות או ממתינות" : "אין משימות פתוחות"}</span>
            )}
          </Cell>
          <Cell label="מחכה ללקוח" icon={Hourglass}>
            {waiting.length ? (
              <ul className="flex flex-col gap-0.5">
                {waiting.slice(0, 3).map((w) => (
                  <li key={w.key} className="truncate">
                    <Link href={w.href} className="font-medium text-warn hover:underline">{w.label}</Link>
                  </li>
                ))}
                {waiting.length > 3 && <li className="text-xs text-ink-3">ועוד {waiting.length - 3}</li>}
              </ul>
            ) : (
              <span className="text-ink-3">שום דבר — הכדור אצלנו</span>
            )}
          </Cell>
          <Cell label="יעד והתקדמות" icon={CalendarClock}>
            <Deadline date={project.deadline} done={project.status === "completed"} compact />
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-sunken" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${pct}% מהמשימות הושלמו`}>
                <div className="h-full rounded-full bg-ok" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs text-ink-3 num">
                {doneCount}/{total}
              </span>
            </div>
          </Cell>
        </div>

        <div className="border-t border-line pt-5">
          <LedgerBar total={project.total_price} paid={fin?.amount_paid ?? 0} deposit={project.deposit_amount} />
        </div>

        <nav aria-label="קיצורים בתוך הפרויקט" className="-mx-1 border-t border-line pt-4">
          <ul className="scrollbar-thin flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
            {SHORTCUTS.map(({ href, label, icon: Icon }) => (
              <li key={href} className="shrink-0">
                <a href={href} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-sm text-ink-2 transition-colors hover:border-line-strong hover:bg-sunken hover:text-ink">
                  <Icon className="size-4 text-ink-3" aria-hidden />
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </CardBody>
    </Card>
  );
}
