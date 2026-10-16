"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { createTask } from "@/lib/actions/crm";
import { taskPriority } from "@/lib/domain/labels";
import { todayISO } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";
import type { EventOptions } from "@/components/calendar/event-form";

export type TaskDraft = { due_date?: string; project_id?: string; client_id?: string; milestone_id?: string; assigned_to?: string };

/**
 * The fast path: title, date, owner. Everything else waits behind
 * "פרטים נוספים" so adding a task takes a few seconds.
 */
export function QuickTaskModal({ open, onOpenChange, options, draft = {} }: { open: boolean; onOpenChange: (o: boolean) => void; options: EventOptions; draft?: TaskDraft }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="משימה חדשה" size="sm" footer={null}>
      {open && <QuickTaskForm options={options} draft={draft} done={() => onOpenChange(false)} />}
    </Modal>
  );
}

function QuickTaskForm({ options, draft, done }: { options: EventOptions; draft: TaskDraft; done: () => void }) {
  const router = useRouter();
  const [more, setMore] = useState(false);
  const { pending, errors, onSubmit } = useFormAction(createTask, {
    onSuccess: () => {
      done();
      router.refresh();
    },
  });
  const today = todayISO();
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const [due, setDue] = useState(draft.due_date ?? today);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label="מה צריך לעשות?" required error={errors.title}>
        {(p) => <Input {...p} name="title" autoFocus placeholder="למשל: לשלוח ללקוח את העיצוב" />}
      </Field>
      <Field label="מתי" error={errors.due_date}>
        {(p) => (
          <div className="flex flex-wrap items-center gap-2">
            <Input {...p} name="due_date" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-auto min-w-40 flex-1" />
            {[
              { v: today, l: "היום" },
              { v: tomorrow, l: "מחר" },
              { v: "", l: "ללא" },
            ].map((o) => (
              <button
                key={o.l}
                type="button"
                onClick={() => setDue(o.v)}
                className={cn("h-10 rounded-md border px-3 text-sm", due === o.v ? "border-accent bg-accent-soft text-accent-ink" : "border-line-strong text-ink-2 hover:bg-sunken")}
              >
                {o.l}
              </button>
            ))}
          </div>
        )}
      </Field>
      <Field label="אחראי" error={errors.assigned_to}>
        {(p) => (
          <Select {...p} name="assigned_to" defaultValue={draft.assigned_to ?? options.me}>
            <option value="">ללא אחראי</option>
            {options.staff.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        )}
      </Field>
      {draft.milestone_id && <input type="hidden" name="milestone_id" value={draft.milestone_id} />}
      {draft.project_id && !more && <input type="hidden" name="project_id" value={draft.project_id} />}
      {draft.client_id && !draft.project_id && <input type="hidden" name="client_id" value={draft.client_id} />}

      <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-ink-2 hover:text-ink">
        <ChevronDown className={cn("size-4 transition-transform", more && "rotate-180")} aria-hidden />
        פרטים נוספים
      </button>
      {more && (
        <div className="flex flex-col gap-4">
          <FormGrid>
            <Field label="שעה" error={errors.due_time}>
              {(p) => <Input {...p} name="due_time" type="time" />}
            </Field>
            <Field label="עדיפות" error={errors.priority}>
              {(p) => (
                <Select {...p} name="priority" defaultValue="medium">
                  {taskPriority.list.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              )}
            </Field>
          </FormGrid>
          <Field label="פרויקט" error={errors.project_id}>
            {(p) => (
              <Select {...p} name="project_id" defaultValue={draft.project_id ?? ""}>
                <option value="">ללא פרויקט</option>
                {options.projects.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="תיאור" error={errors.description}>
            {(p) => <Textarea {...p} name="description" rows={3} />}
          </Field>
        </div>
      )}
      <div className="sticky bottom-0 -mx-5 -mb-4 flex flex-col-reverse gap-2 border-t border-line bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row">
        <Button type="submit" loading={pending} className="sm:min-w-28">הוספה</Button>
        <Button variant="secondary" onClick={done} disabled={pending}>ביטול</Button>
      </div>
    </form>
  );
}
