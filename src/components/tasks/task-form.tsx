"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { taskPriority, taskStatus } from "@/lib/domain/labels";
import { createTask, taskFormOptions, updateTask } from "@/lib/actions/crm";
import { useFormAction } from "@/lib/use-form-action";
import { useOpenState, type OpenProps } from "@/lib/use-open";
import type { Tables } from "@/lib/supabase/database.types";

type Opt = { value: string; label: string; clientId?: string };
type TaskLink = { label?: string; url: string };

function linksToText(links: unknown): string {
  if (!Array.isArray(links)) return "";
  return (links as TaskLink[]).map((l) => (l.label ? `${l.label} | ${l.url}` : l.url)).join("\n");
}

export function TaskFormModal({
  task,
  projectId,
  clientId,
  projects,
  trigger,
  defaultOpen,
  closeHref,
  open: openProp,
  onOpenChange,
}: OpenProps & {
  task?: Tables<"tasks">;
  projectId?: string;
  clientId?: string;
  /** When no project is fixed, a picker is shown (optional — tasks can be general). */
  projects?: Opt[];
  trigger?: ReactNode;
  defaultOpen?: boolean;
  closeHref?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useOpenState({ open: openProp, onOpenChange, defaultOpen });
  const action = task ? updateTask.bind(null, task.id) : createTask;
  const close = (o: boolean) => {
    setOpen(o);
    if (!o && defaultOpen && closeHref) router.replace(closeHref, { scroll: false });
  };
  const { pending, errors, onSubmit } = useFormAction(action, {
    onSuccess: () => {
      close(false);
      router.refresh();
    },
  });
  const fixedProject = task?.project_id ?? projectId;
  const fixedClient = task?.client_id ?? clientId;
  const formId = task ? `task-${task.id}` : `task-new-${fixedProject ?? fixedClient ?? "any"}`;

  // Staff + sibling tasks are loaded when the form opens, so every place that
  // shows a task can edit it without passing option lists around.
  const [options, setOptions] = useState<{ staff: Opt[]; tasks: Opt[] } | null>(null);
  const [pickedProject, setPickedProject] = useState(fixedProject ?? "");
  const optionsProject = fixedProject ?? pickedProject;
  useEffect(() => {
    if (!open) return;
    let alive = true;
    taskFormOptions(optionsProject || null, task?.id).then((r) => {
      if (alive && r.ok) setOptions(r.data);
    });
    return () => {
      alive = false;
    };
  }, [open, optionsProject, task?.id]);

  return (
    <Modal
      open={open}
      onOpenChange={close}
      trigger={trigger}
      title={task ? "עריכת משימה" : "משימה חדשה"}
      footer={
        <>
          <Button type="submit" form={formId} loading={pending} className="sm:min-w-28">
            {task ? "שמירה" : "הוספת משימה"}
          </Button>
          <Button variant="secondary" onClick={() => close(false)} disabled={pending}>
            ביטול
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="כותרת" required error={errors.title}>
          {(p) => <Input {...p} name="title" defaultValue={task?.title} autoFocus placeholder="מה צריך לעשות?" />}
        </Field>
        {fixedProject ? (
          <input type="hidden" name="project_id" value={fixedProject} />
        ) : projects ? (
          <Field label="פרויקט" error={errors.project_id} hint="לא חובה — אפשר גם משימה כללית">
            {(p) => (
              <Select {...p} name="project_id" value={pickedProject} onChange={(e) => setPickedProject(e.target.value)}>
                <option value="">ללא פרויקט</option>
                {projects.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        {!fixedProject && fixedClient && <input type="hidden" name="client_id" value={fixedClient} />}
        <FormGrid>
          <Field label="סטטוס" error={errors.status}>
            {(p) => (
              <Select {...p} name="status" defaultValue={task?.status ?? "todo"}>
                {taskStatus.list.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="אחראי" error={errors.assigned_to}>
            {(p) => (
              // Keyed on load so the saved assignee is selected once options arrive.
              <Select {...p} key={options ? "ready" : "loading"} name="assigned_to" defaultValue={task?.assigned_to ?? ""}>
                <option value="">ללא אחראי</option>
                {(options?.staff ?? []).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="תאריך התחלה" error={errors.start_date}>
            {(p) => <Input {...p} name="start_date" type="date" defaultValue={task?.start_date ?? ""} />}
          </Field>
          <Field label="תאריך יעד" error={errors.due_date}>
            {(p) => <Input {...p} name="due_date" type="date" defaultValue={task?.due_date ?? ""} />}
          </Field>
          <Field label="עדיפות" error={errors.priority}>
            {(p) => (
              <Select {...p} name="priority" defaultValue={task?.priority ?? "medium"}>
                {taskPriority.list.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
          </Field>
          {optionsProject && (
            <Field label="תלויה במשימה" error={errors.blocked_by_task_id} hint="אופציונלי — מה חייב לקרות קודם">
              {(p) => (
                <Select {...p} key={options ? "ready" : "loading"} name="blocked_by_task_id" defaultValue={task?.blocked_by_task_id ?? ""}>
                  <option value="">לא תלויה</option>
                  {(options?.tasks ?? []).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </FormGrid>
        <Field label="תיאור" error={errors.description}>
          {(p) => <Textarea {...p} name="description" defaultValue={task?.description ?? ""} rows={3} />}
        </Field>
        <Field label="קישורים" error={errors.links} hint="שורה לכל קישור. אפשר לתת שם: עיצוב | https://figma.com/…">
          {(p) => <Textarea {...p} name="links" dir="ltr" className="text-right font-mono text-sm" defaultValue={linksToText(task?.links)} rows={2} />}
        </Field>
        <Field label="הערות פנימיות" error={errors.internal_notes} hint="לצוות בלבד — לא מוצג ללקוח לעולם.">
          {(p) => <Textarea {...p} name="internal_notes" defaultValue={task?.internal_notes ?? ""} rows={2} />}
        </Field>
      </form>
    </Modal>
  );
}
