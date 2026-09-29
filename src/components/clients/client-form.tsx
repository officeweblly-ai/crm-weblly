"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useOpenState, type OpenProps } from "@/lib/use-open";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormGrid, FormSection, Input, LtrInput, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { businessType, clientStatus, leadSource } from "@/lib/domain/labels";
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
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {duplicateOf && (
          <div role="alert" className="rounded-md border border-warn/25 bg-warn-soft p-3 text-sm text-warn">
            כבר קיים לקוח עם אותו טלפון או אימייל.{" "}
            <Link href={`/clients/${duplicateOf}`} className="font-medium underline">
              לתיק הקיים
            </Link>
            <Checkbox name="allow_duplicate" value="1" label="ליצור לקוח חדש בכל זאת" className="mt-1 text-warn" />
          </div>
        )}
        <FormSection title="איש הקשר">
          <FormGrid>
            <Field label="שם איש קשר" required error={errors.name}>
              {(p) => <Input {...p} name="name" defaultValue={client?.name} autoComplete="name" autoFocus={!client} />}
            </Field>
            <Field label="תפקיד" hint="בעלים, מנכ״ל, מנהלת שיווק…" error={errors.contact_role}>
              {(p) => <Input {...p} name="contact_role" defaultValue={client?.contact_role ?? ""} />}
            </Field>
            <Field label="טלפון" error={errors.phone}>
              {(p) => <LtrInput {...p} name="phone" type="tel" inputMode="tel" defaultValue={client?.phone ?? ""} placeholder="050-000-0000" />}
            </Field>
            <Field label="אימייל" error={errors.email}>
              {(p) => <LtrInput {...p} name="email" type="email" inputMode="email" defaultValue={client?.email ?? ""} placeholder="name@example.com" />}
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="פרטי העסק" hint="נכנסים אוטומטית להסכמים ולהצעות מחיר.">
          <FormGrid>
            <Field label="שם העסק" error={errors.business_name}>
              {(p) => <Input {...p} name="business_name" defaultValue={client?.business_name ?? ""} autoComplete="organization" />}
            </Field>
            <Field label="ח.פ / ע.מ" error={errors.company_id}>
              {(p) => <LtrInput {...p} name="company_id" inputMode="numeric" defaultValue={client?.company_id ?? ""} placeholder="515000000" />}
            </Field>
            <Field label="סוג עוסק" error={errors.business_type}>
              {(p) => (
                <Select {...p} name="business_type" defaultValue={client?.business_type ?? ""}>
                  <option value="">—</option>
                  {businessType.list.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="תחום" error={errors.industry}>
              {(p) => <Input {...p} name="industry" defaultValue={client?.industry ?? ""} placeholder="מסעדנות, קוסמטיקה, נדל״ן…" />}
            </Field>
            <Field label="כתובת" error={errors.address}>
              {(p) => <Input {...p} name="address" defaultValue={client?.address ?? ""} autoComplete="street-address" />}
            </Field>
            <Field label="עיר" error={errors.city}>
              {(p) => <Input {...p} name="city" defaultValue={client?.city ?? ""} autoComplete="address-level2" />}
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
        </FormSection>

        <FormSection title="איש קשר נוסף" hint="הנהלת חשבונות, שותף, מנהל שיווק — מי שעוד צריך לדבר איתו." collapsible defaultOpen={Boolean(client?.alt_contact_name || client?.alt_contact_phone || errors.alt_contact_phone || errors.alt_contact_email)}>
          <FormGrid>
            <Field label="שם" error={errors.alt_contact_name}>
              {(p) => <Input {...p} name="alt_contact_name" defaultValue={client?.alt_contact_name ?? ""} />}
            </Field>
            <Field label="טלפון" error={errors.alt_contact_phone}>
              {(p) => <LtrInput {...p} name="alt_contact_phone" type="tel" inputMode="tel" defaultValue={client?.alt_contact_phone ?? ""} />}
            </Field>
            <Field label="אימייל" error={errors.alt_contact_email} className="sm:col-span-2">
              {(p) => <LtrInput {...p} name="alt_contact_email" type="email" inputMode="email" defaultValue={client?.alt_contact_email ?? ""} />}
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="התחייבות ושירותים" hint="ריטיינר, תחזוקה ותקופת התחייבות — מה הלקוח משלם באופן קבוע." collapsible defaultOpen={Boolean(client?.retainer_amount || client?.services || client?.commitment_end || errors.retainer_amount)}>
          <FormGrid>
            <Field label="ריטיינר / תחזוקה חודשית (₪)" error={errors.retainer_amount}>
              {(p) => <LtrInput {...p} name="retainer_amount" inputMode="decimal" defaultValue={client?.retainer_amount ?? ""} placeholder="0" />}
            </Field>
            <Field label="החל מתאריך" error={errors.retainer_start}>
              {(p) => <Input {...p} name="retainer_start" type="date" defaultValue={client?.retainer_start ?? ""} />}
            </Field>
            <Field label="סוף התחייבות" hint="ריק = ללא הגבלה" error={errors.commitment_end}>
              {(p) => <Input {...p} name="commitment_end" type="date" defaultValue={client?.commitment_end ?? ""} />}
            </Field>
            <Field label="שירותים נוכחיים" hint="תחזוקה, אחסון, קמפיין…" error={errors.services}>
              {(p) => <Input {...p} name="services" defaultValue={client?.services ?? ""} />}
            </Field>
          </FormGrid>
          <Field label="תנאי ההתחייבות" hint="מה סוכם: היקף שעות, זמני תגובה, תנאי יציאה." error={errors.commitment_notes}>
            {(p) => <Textarea {...p} name="commitment_notes" defaultValue={client?.commitment_notes ?? ""} rows={2} />}
          </Field>
        </FormSection>

        <Field label="הערות פנימיות" hint="הלקוח לא רואה את זה." error={errors.notes}>
          {(p) => <Textarea {...p} name="notes" defaultValue={client?.notes ?? ""} rows={3} />}
        </Field>
      </form>
    </Modal>
  );
}
