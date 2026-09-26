"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useOpenState, type OpenProps } from "@/lib/use-open";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormGrid, Input, LtrInput, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { leadSource, leadStatus, projectType } from "@/lib/domain/labels";
import { createLead, updateLead } from "@/lib/actions/leads";
import { useFormAction } from "@/lib/use-form-action";
import type { Tables } from "@/lib/supabase/database.types";

export function LeadFormModal({ lead, trigger, defaultOpen = false, open: openProp, onOpenChange }: OpenProps & { lead?: Tables<"leads">; trigger?: ReactNode; defaultOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useOpenState({ open: openProp, onOpenChange, defaultOpen });
  const action = lead ? updateLead.bind(null, lead.id) : createLead;
  const { pending, errors, formError, onSubmit } = useFormAction(action, {
    onSuccess: ({ id }) => {
      setOpen(false);
      if (!lead) router.push(`/leads/${id}`);
      else router.refresh();
    },
  });
  const formId = lead ? `lead-form-${lead.id}` : "lead-form-new";

  const close = (o: boolean) => {
    setOpen(o);
    // Drop ?new=1 so a refresh doesn't reopen the form.
    if (!o && defaultOpen) router.replace("/leads", { scroll: false });
  };

  return (
    <Modal
      open={open}
      onOpenChange={close}
      trigger={trigger}
      title={lead ? "עריכת ליד" : "ליד חדש"}
      description={lead ? undefined : "רק השם חובה — את השאר אפשר להשלים אחר כך."}
      footer={
        <>
          <Button type="submit" form={formId} loading={pending} className="sm:min-w-32">
            {lead ? "שמירת שינויים" : "הוספת ליד"}
          </Button>
          <Button variant="secondary" onClick={() => close(false)} disabled={pending}>
            ביטול
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormError message={formError && Object.keys(errors).length === 0 ? formError : null} />
        <FormGrid>
          <Field label="שם" required error={errors.name}>
            {(p) => <Input {...p} name="name" defaultValue={lead?.name} autoComplete="name" autoFocus={!lead} />}
          </Field>
          <Field label="שם העסק" error={errors.business_name}>
            {(p) => <Input {...p} name="business_name" defaultValue={lead?.business_name ?? ""} autoComplete="organization" />}
          </Field>
          <Field label="טלפון" error={errors.phone}>
            {(p) => <LtrInput {...p} name="phone" type="tel" inputMode="tel" defaultValue={lead?.phone ?? ""} placeholder="050-000-0000" />}
          </Field>
          <Field label="אימייל" error={errors.email}>
            {(p) => <LtrInput {...p} name="email" type="email" inputMode="email" defaultValue={lead?.email ?? ""} placeholder="name@example.com" />}
          </Field>
          <Field label="מקור הליד" error={errors.source}>
            {(p) => (
              <Select {...p} name="source" defaultValue={lead?.source ?? "other"}>
                {leadSource.list.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="סוג פרויקט" error={errors.project_type}>
            {(p) => (
              <Select {...p} name="project_type" defaultValue={lead?.project_type ?? ""}>
                <option value="">לא ידוע עדיין</option>
                {projectType.list.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="מחיר משוער (₪)" error={errors.estimated_value}>
            {(p) => <LtrInput {...p} name="estimated_value" inputMode="decimal" defaultValue={lead?.estimated_value ?? ""} placeholder="0" />}
          </Field>
          <Field label="תאריך מעקב" error={errors.follow_up_date}>
            {(p) => <Input {...p} name="follow_up_date" type="date" defaultValue={lead?.follow_up_date ?? ""} />}
          </Field>
          {lead && lead.status !== "converted" && (
            <Field label="סטטוס" error={errors.status}>
              {(p) => (
                <Select {...p} name="status" defaultValue={lead.status}>
                  {leadStatus.list.filter((o) => o.value !== "converted").map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          {lead?.status === "converted" && <input type="hidden" name="status" value="converted" />}
        </FormGrid>
        <Field label="הערות" error={errors.notes}>
          {(p) => <Textarea {...p} name="notes" defaultValue={lead?.notes ?? ""} rows={3} placeholder="מה הוא מחפש, תקציב, תזמון…" />}
        </Field>
      </form>
    </Modal>
  );
}
