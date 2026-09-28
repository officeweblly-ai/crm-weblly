"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useOpenState, type OpenProps } from "@/lib/use-open";
import { Button } from "@/components/ui/button";
import { Field, FormGrid, Input, LtrInput, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { paymentKind, paymentMethod } from "@/lib/domain/labels";
import { toast } from "sonner";
import { createPayment, setProjectStatus, updatePayment } from "@/lib/actions/crm";
import { formatMoney, todayISO } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";
import type { Tables } from "@/lib/supabase/database.types";

type ProjectOpt = { value: string; label: string; balance?: number };

export function PaymentFormModal({
  payment,
  projectId,
  projects,
  balance,
  trigger,
  defaultOpen = false,
  closeHref,
  open: openProp,
  onOpenChange,
}: OpenProps & {
  payment?: Tables<"payments">;
  projectId?: string;
  projects?: ProjectOpt[];
  /** Remaining balance of the fixed project — offered as a one-tap amount. */
  balance?: number;
  trigger?: ReactNode;
  defaultOpen?: boolean;
  closeHref?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useOpenState({ open: openProp, onOpenChange, defaultOpen });
  const [amount, setAmount] = useState(payment ? String(payment.amount) : "");
  const action: (fd: FormData) => ReturnType<typeof createPayment> | ReturnType<typeof updatePayment> = payment ? updatePayment.bind(null, payment.id) : createPayment;
  const { pending, errors, onSubmit } = useFormAction(action, {
    onSuccess: (data) => {
      // Automation: a deposit arrived → offer to move the project to design (one tap, never automatic).
      const suggest = "suggestDesign" in data ? (data.suggestDesign as { projectId: string; name: string } | null) : null;
      if (suggest) {
        toast(`המקדמה נרשמה. להעביר את "${suggest.name}" לשלב עיצוב?`, {
          duration: 12000,
          action: {
            label: "העברה לעיצוב",
            onClick: async () => {
              const r = await setProjectStatus({ id: suggest.projectId, status: "design" });
              if (r.ok) {
                toast.success("הפרויקט עבר לשלב עיצוב");
                router.refresh();
              } else toast.error(r.error);
            },
          },
        });
      }
      setOpen(false);
      if (!payment) setAmount("");
      if (defaultOpen && closeHref) router.replace(closeHref, { scroll: false });
      router.refresh();
    },
  });
  const fixedProject = payment?.project_id ?? projectId;
  const formId = payment ? `payment-${payment.id}` : `payment-new-${fixedProject ?? "any"}`;

  const close = (o: boolean) => {
    setOpen(o);
    if (!o && defaultOpen && closeHref) router.replace(closeHref, { scroll: false });
  };

  return (
    <Modal
      open={open}
      onOpenChange={close}
      trigger={trigger}
      title={payment ? "עריכת תשלום" : "רישום תשלום"}
      description="מעקב בלבד — לא מתבצע חיוב אמיתי."
      footer={
        <>
          <Button type="submit" form={formId} loading={pending} className="sm:min-w-32">
            {payment ? "שמירת שינויים" : "רישום התשלום"}
          </Button>
          <Button variant="secondary" onClick={() => close(false)} disabled={pending}>
            ביטול
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {fixedProject ? (
          <input type="hidden" name="project_id" value={fixedProject} />
        ) : (
          <Field label="פרויקט" required error={errors.project_id} hint={projects?.length ? undefined : "אין עדיין פרויקטים."}>
            {(p) => (
              <Select {...p} name="project_id" defaultValue="">
                <option value="" disabled>
                  בחירת פרויקט…
                </option>
                {projects?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                    {o.balance !== undefined && o.balance > 0 ? ` (יתרה ${formatMoney(o.balance)})` : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <FormGrid>
          <Field
            label="סכום (₪)"
            required
            error={errors.amount}
            hint={
              !payment && balance !== undefined && balance > 0 ? (
                <button type="button" className="text-accent hover:underline" onClick={() => setAmount(String(balance))}>
                  מילוי היתרה: <bdi dir="ltr">{formatMoney(balance)}</bdi>
                </button>
              ) : undefined
            }
          >
            {(p) => <LtrInput {...p} name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus placeholder="0" />}
          </Field>
          <Field label="תאריך תשלום" required error={errors.paid_at}>
            {(p) => <Input {...p} name="paid_at" type="date" defaultValue={payment?.paid_at ?? todayISO()} />}
          </Field>
          <Field label="אמצעי תשלום" required error={errors.method}>
            {(p) => (
              <Select {...p} name="method" defaultValue={payment?.method ?? "bank_transfer"}>
                {paymentMethod.list.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="סוג" error={errors.kind}>
            {(p) => (
              <Select {...p} name="kind" defaultValue={payment?.kind ?? "installment"}>
                {paymentKind.list.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
          </Field>
        </FormGrid>
        <Field label="אסמכתא" error={errors.reference} hint="מספר העברה, קבלה או חשבונית">
          {(p) => <LtrInput {...p} name="reference" defaultValue={payment?.reference ?? ""} />}
        </Field>
        <Field label="הערה" error={errors.note}>
          {(p) => <Input {...p} name="note" defaultValue={payment?.note ?? ""} />}
        </Field>
      </form>
    </Modal>
  );
}
