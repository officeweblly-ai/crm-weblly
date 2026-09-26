"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useOpenState, type OpenProps } from "@/lib/use-open";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormGrid, Input, LtrInput, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { clientStatus, leadSource } from "@/lib/domain/labels";
import { createClientRecord, updateClientRecord } from "@/lib/actions/crm";
import { useFormAction } from "@/lib/use-form-action";
import type { Tables } from "@/lib/supabase/database.types";

export function ClientFormModal({ client, trigger, defaultOpen = false, open: openProp, onOpenChange }: OpenProps & { client?: Tables<"clients">; trigger?: ReactNode; defaultOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useOpenState({ open: openProp, onOpenChange, defaultOpen });
  const action = client ? updateClientRecord.bind(null, client.id) : createClientRecord;
  const { pending, errors, onSubmit } = useFormAction(action, {
    onSuccess: ({ id }) => {
      setOpen(false);
      if (!client) router.push(`/clients/${id}`);
      else router.refresh();
    },
  });
  const formId = client ? `client-form-${client.id}` : "client-form-new";
  const duplicateOf = errors.allow_duplicate;

  const close = (o: boolean) => {
    setOpen(o);
    if (!o && defaultOpen) router.replace("/clients", { scroll: false });
  };

  return (
    <Modal
      open={open}
      onOpenChange={close}
      trigger={trigger}
      title={client ? "עריכת פרטי לקוח" : "לקוח חדש"}
      description={client ? undefined : "פותחים תיק — פרויקט, אפיון ותשלומים מתווספים מתוכו."}
      footer={
        <>
          <Button type="submit" form={formId} loading={pending} className="sm:min-w-32">
            {client ? "שמירת שינויים" : "פתיחת תיק לקוח"}
          </Button>
          <Button variant="secondary" onClick={() => close(false)} disabled={pending}>
            ביטול
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {duplicateOf && (
          <div role="alert" className="rounded-md border border-warn/25 bg-warn-soft p-3 text-sm text-warn">
            כבר קיים לקוח עם אותו טלפון או אימייל.{" "}
            <Link href={`/clients/${duplicateOf}`} className="font-medium underline">
              לתיק הקיים
            </Link>
            <Checkbox name="allow_duplicate" value="1" label="ליצור לקוח חדש בכל זאת" className="mt-1 text-warn" />
          </div>
        )}
        <FormGrid>
          <Field label="שם איש קשר" required error={errors.name}>
            {(p) => <Input {...p} name="name" defaultValue={client?.name} autoComplete="name" autoFocus={!client} />}
          </Field>
          <Field label="שם העסק" error={errors.business_name}>
            {(p) => <Input {...p} name="business_name" defaultValue={client?.business_name ?? ""} autoComplete="organization" />}
          </Field>
          <Field label="טלפון" error={errors.phone}>
            {(p) => <LtrInput {...p} name="phone" type="tel" inputMode="tel" defaultValue={client?.phone ?? ""} placeholder="050-000-0000" />}
          </Field>
          <Field label="אימייל" error={errors.email}>
            {(p) => <LtrInput {...p} name="email" type="email" inputMode="email" defaultValue={client?.email ?? ""} placeholder="name@example.com" />}
          </Field>
          <Field label="אתר קיים" error={errors.website}>
            {(p) => <LtrInput {...p} name="website" inputMode="url" defaultValue={client?.website ?? ""} placeholder="example.co.il" />}
          </Field>
          <Field label="מקור" error={errors.source}>
            {(p) => (
              <Select {...p} name="source" defaultValue={client?.source ?? ""}>
                <option value="">—</option>
                {leadSource.list.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
          </Field>
          {client && (
            <Field label="סטטוס" error={errors.status}>
              {(p) => (
                <Select {...p} name="status" defaultValue={client.status}>
                  {clientStatus.list.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </FormGrid>
        <Field label="הערות כלליות" hint="פנימי — הלקוח לא רואה את זה." error={errors.notes}>
          {(p) => <Textarea {...p} name="notes" defaultValue={client?.notes ?? ""} rows={3} />}
        </Field>
      </form>
    </Modal>
  );
}
