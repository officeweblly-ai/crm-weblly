"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Target, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Field, FormGrid, Input, LtrInput, Select, Textarea } from "@/components/ui/field";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { createGoal, deleteGoal, updateGoal } from "@/lib/actions/business";
import { goalMetric, goalStatus, type GoalMetric, type GoalStatus } from "@/lib/domain/labels";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";
import { useOpenState, type OpenProps } from "@/lib/use-open";
import { cn } from "@/lib/utils";

export type Goal = {
  id: string;
  title: string;
  metric: string;
  target: number;
  actual: number;
  manual_value: number;
  period_start: string;
  period_end: string;
  owner_id: string | null;
  status: string;
  notes: string | null;
  pace: number;
  days_left: number;
};

function quarterBounds() {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3);
  const start = new Date(Date.UTC(d.getFullYear(), q * 3, 1));
  const end = new Date(Date.UTC(d.getFullYear(), q * 3 + 3, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function GoalFormModal({ goal, staff, trigger, open: openProp, onOpenChange }: OpenProps & { goal?: Goal; staff: { value: string; label: string }[]; trigger?: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useOpenState({ open: openProp, onOpenChange });
  const [metric, setMetric] = useState<string>(goal?.metric ?? "revenue");
  const action = goal ? updateGoal.bind(null, goal.id) : createGoal;
  const { pending, errors, onSubmit } = useFormAction(action, {
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  const q = quarterBounds();
  const formId = goal ? `goal-${goal.id}` : "goal-new";
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={goal ? "עריכת יעד" : "יעד חדש"}
      description="יעדים של הכנסות, לקוחות, פרויקטים והצעות נמדדים אוטומטית מהנתונים במערכת."
      footer={
        <>
          <Button type="submit" form={formId} loading={pending} className="sm:min-w-32">{goal ? "שמירה" : "הוספת יעד"}</Button>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>ביטול</Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="היעד" required error={errors.title}>
          {(p) => <Input {...p} name="title" defaultValue={goal?.title} placeholder="לדוגמה: 60 אלף ₪ ברבעון" autoFocus />}
        </Field>
        <FormGrid>
          <Field label="איך מודדים" error={errors.metric}>
            {(p) => (
              <Select {...p} name="metric" value={metric} onChange={(e) => setMetric(e.target.value)}>
                {goalMetric.list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label={metric === "revenue" ? "יעד (₪)" : "יעד (מספר)"} required error={errors.target}>
            {(p) => <LtrInput {...p} name="target" inputMode="decimal" defaultValue={goal?.target ?? ""} />}
          </Field>
          {metric === "custom" && (
            <Field label="איפה אנחנו עכשיו" error={errors.manual_value}>
              {(p) => <LtrInput {...p} name="manual_value" inputMode="decimal" defaultValue={goal?.manual_value ?? 0} />}
            </Field>
          )}
          <Field label="מתאריך" required error={errors.period_start}>
            {(p) => <Input {...p} name="period_start" type="date" defaultValue={goal?.period_start ?? q.start} />}
          </Field>
          <Field label="עד תאריך" required error={errors.period_end}>
            {(p) => <Input {...p} name="period_end" type="date" defaultValue={goal?.period_end ?? q.end} />}
          </Field>
          <Field label="אחראי" error={errors.owner_id}>
            {(p) => (
              <Select {...p} name="owner_id" defaultValue={goal?.owner_id ?? ""}>
                <option value="">שנינו</option>
                {staff.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            )}
          </Field>
          {goal && (
            <Field label="סטטוס" error={errors.status}>
              {(p) => (
                <Select {...p} name="status" defaultValue={goal.status}>
                  {goalStatus.list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              )}
            </Field>
          )}
        </FormGrid>
        <Field label="איך נגיע לשם" hint="הפעולות שיזיזו את המספר." error={errors.notes}>
          {(p) => <Textarea {...p} name="notes" defaultValue={goal?.notes ?? ""} rows={3} />}
        </Field>
      </form>
    </Modal>
  );
}

/** Progress vs. where we "should" be by now (linear pace through the period). */
export function GoalCard({ goal, staff, ownerName, canEdit }: { goal: Goal; staff: { value: string; label: string }[]; ownerName?: string | null; canEdit: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const pct = Math.min(100, Math.round((goal.actual / goal.target) * 100));
  const pace = goal.pace;
  const left = goal.days_left;
  const fmt = (n: number) => (goal.metric === "revenue" ? formatMoney(n) : formatNumber(n));
  const reached = goal.actual >= goal.target;
  const behind = !reached && goal.status === "active" && pct + 10 < pace;
  const tone = reached ? "bg-ok" : behind ? "bg-warn" : "bg-accent";
  const status = goal.status as GoalStatus;

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 shadow-1">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold leading-snug text-ink">{goal.title}</h3>
          <p className="mt-0.5 text-xs text-ink-3">
            {formatDate(goal.period_start, { short: true })}–{formatDate(goal.period_end, { short: true })}
            {ownerName ? ` · ${ownerName}` : ""}
            {goal.metric !== "custom" ? " · נמדד אוטומטית" : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {status !== "active" ? <Badge tone={goalStatus.tone(status)}>{goalStatus.label(status)}</Badge> : reached ? <Badge tone="ok">הושג</Badge> : behind ? <Badge tone="warn">מאחורי הקצב</Badge> : null}
          {canEdit && (
            <Menu trigger={<Button variant="ghost" size="icon" aria-label="פעולות ליעד"><MoreHorizontal /></Button>}>
              <MenuItem onSelect={() => setEditing(true)}><Pencil /> עריכה</MenuItem>
              <MenuItem destructive onSelect={() => setConfirm(true)}><Trash2 /> מחיקה</MenuItem>
            </Menu>
          )}
        </div>
      </header>
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xl font-semibold text-ink"><bdi className="num">{fmt(goal.actual)}</bdi></span>
          <span className="text-sm text-ink-3">מתוך <bdi className="num">{fmt(goal.target)}</bdi></span>
        </div>
        <div className="relative mt-2 h-2 rounded-full bg-sunken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% מהיעד`}>
          <div className={cn("h-full rounded-full transition-[width] duration-500", tone)} style={{ width: `${Math.max(pct, 2)}%` }} />
          {goal.status === "active" && !reached && pace > 0 && pace < 100 && (
            <span className="absolute -top-1 h-4 w-0.5 rounded bg-ink/40" style={{ insetInlineStart: `${pace}%` }} title="איפה צריך להיות היום" aria-hidden />
          )}
        </div>
        <p className="mt-1.5 flex justify-between text-xs text-ink-3">
          <span>{pct}%</span>
          <span>{left > 0 ? `נותרו ${left} ימים` : "התקופה הסתיימה"}</span>
        </p>
      </div>
      {goal.notes && <p className="border-t border-line pt-2 text-sm whitespace-pre-wrap text-ink-2">{goal.notes}</p>}
      {canEdit && <GoalFormModal goal={goal} staff={staff} open={editing} onOpenChange={setEditing} />}
      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title="מחיקת היעד"
        description={`"${goal.title}" יימחק.`}
        confirmLabel="מחיקה"
        action={() => deleteGoal(goal.id)}
        onDone={() => router.refresh()}
      />
    </article>
  );
}

export function GoalsEmpty({ staff }: { staff: { value: string; label: string }[] }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-line-strong px-5 py-6">
      <Target className="size-6 text-ink-3" aria-hidden />
      <div>
        <p className="font-medium text-ink">עוד אין יעדים</p>
        <p className="mt-0.5 max-w-prose text-sm text-ink-3">יעד הכנסות לרבעון, מספר לקוחות חדשים, פרויקטים שנמסרו — המערכת מודדת לבד ומראה אם אתם בקצב.</p>
      </div>
      <GoalFormModal staff={staff} trigger={<Button size="sm">יעד ראשון</Button>} />
    </div>
  );
}

export const metricIsMoney = (m: string) => (m as GoalMetric) === "revenue";
