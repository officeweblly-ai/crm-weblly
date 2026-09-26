"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { taskPriority, taskStatus } from "@/lib/domain/labels";
import { createTask, updateTask } from "@/lib/actions/crm";
import { useFormAction } from "@/lib/use-form-action";
import { useOpenState, type OpenProps } from "@/lib/use-open";
import type { Tables } from "@/lib/supabase/database.types";

type Opt = { value: string; label: string; clientId?: string };

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
              <Select {...p} name="project_id" defaultValue="">
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
          {task && (
            <Field label="סטטוס" error={errors.status}>
              {(p) => (
                <Select {...p} name="status" defaultValue={task.status}>
                  {taskStatus.list.map((o) => (
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
      </form>
    </Modal>
  );
}
