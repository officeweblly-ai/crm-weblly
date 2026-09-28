"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Mail, MessageCircle, MoreHorizontal, NotebookPen, Phone, Presentation, ReceiptText, RotateCcw, Trash2, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { deleteInteraction, postponeFollowUp, setFollowUpStatus } from "@/lib/actions/relationship";
import { interactionKind, type InteractionKind } from "@/lib/domain/labels";
import { daysUntil, formatDateTime, relativeDue } from "@/lib/format";
import { cn } from "@/lib/utils";

type ActionFn = () => Promise<{ ok: boolean; error?: string; message?: string }>;

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: ActionFn) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        if (r.message) toast.success(r.message);
        router.refresh();
      } else toast.error(r.error ?? "הפעולה נכשלה");
    });
  return { pending, run };
}

export type FollowUpRow = { id: string; due_date: string; reason: string; note: string | null; status: string; assignee: string | null };

export function FollowUpItem({ f }: { f: FollowUpRow }) {
  const { pending, run } = useRun();
  const d = daysUntil(f.due_date) ?? 0;
  const open = f.status === "open";
  return (
    <li className={cn("flex items-center gap-2 px-4 py-2.5 sm:px-5", pending && "opacity-60")}>
      {open ? (
        <button type="button" disabled={pending} onClick={() => run(() => setFollowUpStatus(f.id, "done"))} className="grid size-11 shrink-0 place-items-center" aria-label={`סימון כבוצע: ${f.reason}`}>
          <span className="grid size-6 place-items-center rounded-md border border-line-strong bg-surface hover:border-accent">
            <Check className="size-3.5 text-transparent hover:text-accent" strokeWidth={3} aria-hidden />
          </span>
        </button>
      ) : (
        <span className="grid size-11 shrink-0 place-items-center" aria-hidden>
          <span className="grid size-6 place-items-center rounded-md bg-ok text-white"><Check className="size-3.5" strokeWidth={3} /></span>
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm", open ? "font-medium text-ink" : "text-ink-3 line-through")}>{f.reason}</p>
        <p className="text-xs text-ink-3">
          <span className={cn(open && d < 0 && "font-medium text-danger", open && d === 0 && "font-medium text-warn")}>{relativeDue(f.due_date)}</span>
          {f.assignee && ` · ${f.assignee}`}
          {f.note && ` · ${f.note}`}
        </p>
      </div>
      <Menu trigger={<Button variant="ghost" size="icon" aria-label={`פעולות: ${f.reason}`}><MoreHorizontal /></Button>}>
        {open ? (
          <>
            <MenuItem onSelect={() => run(() => postponeFollowUp(f.id, 1))}>דחייה למחר</MenuItem>
            <MenuItem onSelect={() => run(() => postponeFollowUp(f.id, 7))}>דחייה בשבוע</MenuItem>
            <MenuSeparator />
            <MenuItem destructive onSelect={() => run(() => setFollowUpStatus(f.id, "cancelled"))}>ביטול המעקב</MenuItem>
          </>
        ) : (
          <MenuItem onSelect={() => run(() => setFollowUpStatus(f.id, "open"))}><RotateCcw /> פתיחה מחדש</MenuItem>
        )}
      </Menu>
    </li>
  );
}

const KIND_ICON: Record<InteractionKind, LucideIcon> = {
  phone: Phone,
  whatsapp: MessageCircle,
  meeting: Users,
  email: Mail,
  proposal: ReceiptText,
  follow_up: Presentation,
  internal_note: NotebookPen,
  other: NotebookPen,
};

export type InteractionRow = { id: string; kind: string; occurred_at: string; summary: string; result: string | null; next_action: string | null; follow_up_date: string | null; user: string | null };

export function InteractionItem({ i, last }: { i: InteractionRow; last: boolean }) {
  const { pending, run } = useRun();
  const [deleting, setDeleting] = useState(false);
  const Icon = KIND_ICON[i.kind as InteractionKind] ?? NotebookPen;
  return (
    <li className={cn("relative flex gap-3 pb-5 last:pb-0", pending && "opacity-60")}>
      {!last && <span className="absolute start-[15px] top-8 bottom-0 w-px bg-line" aria-hidden />}
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", i.kind === "internal_note" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent")} aria-hidden>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-ink-3">
            <span className="font-medium text-ink-2">{interactionKind.label(i.kind as InteractionKind)}</span> · {formatDateTime(i.occurred_at)}
            {i.user && ` · ${i.user}`}
          </p>
          <button type="button" onClick={() => setDeleting(true)} className="-mt-1 grid size-8 shrink-0 place-items-center rounded text-ink-3 hover:text-danger" aria-label="מחיקת האינטראקציה">
            <Trash2 className="size-3.5" />
          </button>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{i.summary}</p>
        {i.result && <p className="mt-1 text-sm text-ink-2"><span className="text-ink-3">תוצאה:</span> {i.result}</p>}
        {(i.next_action || i.follow_up_date) && (
          <p className="mt-1 text-xs text-accent-ink">
            הבא: {i.next_action ?? "מעקב"}
            {i.follow_up_date && ` · ${relativeDue(i.follow_up_date)}`}
          </p>
        )}
      </div>
      <Confirm open={deleting} onOpenChange={setDeleting} title="מחיקת אינטראקציה" description="הרישום יימחק מהיסטוריית הקשר עם הלקוח." confirmLabel="מחיקה" action={() => deleteInteraction(i.id)} onDone={() => run(async () => ({ ok: true }))} />
    </li>
  );
}
