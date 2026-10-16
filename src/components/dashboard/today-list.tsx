"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { ArrowUpLeft, Check, Clock3 } from "lucide-react";
import { AgendaRow } from "@/components/calendar/agenda-ui";
import { useCreate } from "@/components/shell/nav";
import { setTaskStatus } from "@/lib/actions/crm";
import { postponeLead, postponeTask } from "@/lib/actions/operations";
import { postponeFollowUp, setFollowUpStatus } from "@/lib/actions/relationship";
import type { ActionResult } from "@/lib/actions/result";
import { dayNum, type AgendaItem } from "@/lib/domain/calendar";
import { cn } from "@/lib/utils";

function ActionButton({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="grid size-8 place-items-center rounded-md text-ink-3 transition-colors hover:bg-sunken hover:text-ink disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/**
 * "היום": timed items first, then the rest of today, then what slipped.
 * Each row can be finished, pushed to tomorrow or opened — in place.
 */
export function TodayList({ items, today, people, emptyText }: { items: AgendaItem[]; today: string; people: Record<string, string>; emptyText: string }) {
  const router = useRouter();
  const { editEvent } = useCreate();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        if (r.message) toast.success(r.message);
        router.refresh();
      } else toast.error(r.error);
    });

  if (!items.length) return <p className="px-5 py-6 text-sm text-ink-3">{emptyText}</p>;

  return (
    <ol className={cn("divide-y divide-line", pending && "opacity-70 transition-opacity")}>
      {items.map((i) => {
        const overdue = !i.done && i.date < today;
        const finish =
          i.source === "task" ? () => run(() => setTaskStatus(i.sourceId, "done")) : i.source === "followup" ? () => run(() => setFollowUpStatus(i.sourceId, "done")) : null;
        const postpone =
          i.source === "task"
            ? () => run(() => postponeTask(i.sourceId, 1))
            : i.source === "followup"
              ? () => run(() => postponeFollowUp(i.sourceId, 1))
              : i.source === "lead"
                ? () => run(() => postponeLead(i.sourceId, 1))
                : null;
        return (
          <li key={i.key}>
            <AgendaRow
              item={i}
              people={people}
              onEdit={(x) => x.event && editEvent(x.event)}
              overdue={overdue}
              showDate={overdue ? `${dayNum(i.date)}.${Number(i.date.slice(5, 7))}` : null}
              actions={
                <>
                  {finish && !i.done && (
                    <ActionButton label="סיום" onClick={finish} disabled={pending}>
                      <Check className="size-4" aria-hidden />
                    </ActionButton>
                  )}
                  {postpone && !i.done && (
                    <ActionButton label="דחייה למחר" onClick={postpone} disabled={pending}>
                      <Clock3 className="size-4" aria-hidden />
                    </ActionButton>
                  )}
                  {i.event ? null : (
                    <Link href={i.href} title="פתיחה" aria-label={`פתיחה: ${i.title}`} className="grid size-8 place-items-center rounded-md text-ink-3 hover:bg-sunken hover:text-ink">
                      <ArrowUpLeft className="size-4" aria-hidden />
                    </Link>
                  )}
                </>
              }
            />
          </li>
        );
      })}
    </ol>
  );
}
