"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useOpenState, type OpenProps } from "@/lib/use-open";
import { Button } from "@/components/ui/button";
import { Field, FormGrid, Input, LtrInput, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { projectStatus, projectType } from "@/lib/domain/labels";
import { createProject, updateProject } from "@/lib/actions/crm";
import { todayISO } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";
import type { Tables } from "@/lib/supabase/database.types";

type Opt = { value: string; label: string };

export function ProjectFormModal({
  project,
  clientId,
  clients,
  trigger,
  defaultOpen = false,
  closeHref,
  open: openProp,
  onOpenChange,
}: OpenProps & {
  project?: Tables<"projects">;
  /** Fixed client (creating from the client page). */
  clientId?: string;
  /** Picker options when no client is fixed. */
  clients?: Opt[];
  trigger?: ReactNode;
  defaultOpen?: boolean;
  closeHref?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useOpenState({ open: openProp, onOpenChange, defaultOpen });
  const action = project ? updateProject.bind(null, project.id) : createProject;
  const { pending, errors, onSubmit } = useFormAction(action, {
    onSuccess: ({ id }) => {
      setOpen(false);
      if (!project) router.push(`/projects/${id}`);
      else router.refresh();
    },
  });
  const formId = project ? `project-form-${project.id}` : "project-form-new";
  const fixedClient = project?.client_id ?? clientId;

  const close = (o: boolean) => {
    setOpen(o);
    if (!o && defaultOpen && closeHref) router.replace(closeHref, { scroll: false });
  };

  return (
    <Modal
      open={open}
      onOpenChange={close}
      trigger={trigger}
      size="lg"
      title={project ? "עריכת פרויקט" : "פרויקט חדש"}
      footer={
        <>
          <Button type="submit" form={formId} loading={pending} className="sm:min-w-32">
            {project ? "שמירת שינויים" : "יצירת פרויקט"}
          </Button>
          <Button variant="secondary" onClick={() => close(false)} disabled={pending}>
            ביטול
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {fixedClient ? (
          <input type="hidden" name="client_id" value={fixedClient} />
        ) : (
          <Field label="לקוח" required error={errors.client_id} hint={clients?.length ? undefined : "אין עדיין לקוחות — צור לקוח קודם."}>
            {(p) => (
              <Select {...p} name="client_id" defaultValue="">
                <option value="" disabled>
                  בחירת לקוח…
                </option>
                {clients?.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <FormGrid>
          <Field label="שם הפרויקט" required error={errors.name}>
            {(p) => <Input {...p} name="name" defaultValue={project?.name} placeholder="לדוגמה: אתר תדמית — סטודיו דנה" />}
          </Field>
          <Field label="סוג" required error={errors.project_type}>
            {(p) => (
              <Select {...p} name="project_type" defaultValue={project?.project_type ?? "business_site"}>
                {projectType.list.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
          </Field>
        </FormGrid>

        <fieldset className="rounded-lg border border-line p-4">
          <legend className="px-1 text-sm font-medium text-ink-2">תמחור</legend>
          <FormGrid>
            <Field label="מחיר כולל (₪)" required error={errors.total_price}>
              {(p) => <LtrInput {...p} name="total_price" inputMode="decimal" defaultValue={project?.total_price ?? 0} />}
            </Field>
            <Field label="מקדמה נדרשת (₪)" required error={errors.deposit_amount}>
              {(p) => <LtrInput {...p} name="deposit_amount" inputMode="decimal" defaultValue={project?.deposit_amount ?? 0} />}
            </Field>
          </FormGrid>
          <p className="mt-3 text-xs text-ink-3">&quot;שולם&quot; ו&quot;יתרה&quot; מחושבים אוטומטית מהתשלומים שנרשמים — אין צורך לעדכן ידנית.</p>
        </fieldset>

        <FormGrid>
          <Field label="סטטוס" error={errors.status}>
            {(p) => (
              <Select {...p} name="status" defaultValue={project?.status ?? "lead"}>
                {projectStatus.list.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="הפעולה הבאה" error={errors.next_action}>
            {(p) => <Input {...p} name="next_action" defaultValue={project?.next_action ?? ""} placeholder="מה הדבר הבא שצריך לקרות?" />}
          </Field>
          <Field label="תאריך התחלה" error={errors.start_date}>
            {(p) => <Input {...p} name="start_date" type="date" defaultValue={project?.start_date ?? (project ? "" : todayISO())} />}
          </Field>
          <Field label="יעד לסיום" error={errors.deadline}>
            {(p) => <Input {...p} name="deadline" type="date" defaultValue={project?.deadline ?? ""} />}
          </Field>
        </FormGrid>
        <Field label="תיאור" error={errors.description}>
          {(p) => <Textarea {...p} name="description" defaultValue={project?.description ?? ""} rows={3} placeholder="מה בונים, היקף, עמודים עיקריים…" />}
        </Field>
        <Field label="הערות פנימיות" error={errors.notes}>
          {(p) => <Textarea {...p} name="notes" defaultValue={project?.notes ?? ""} rows={2} />}
        </Field>
      </form>
    </Modal>
  );
}
