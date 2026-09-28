"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { createFollowUp, createInteraction } from "@/lib/actions/relationship";
import { interactionKind } from "@/lib/domain/labels";
import { isoDateOffset, todayISO } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";
import { useOpenState, type OpenProps } from "@/lib/use-open";

type Opt = { value: string; label: string };

/** "+ אינטראקציה": what happened with the client, and optionally when to follow up. */
export function InteractionModal({
  clientId,
  projects = [],
  trigger,
  open: openProp,
  onOpenChange,
}: OpenProps & { clientId: string; projects?: Opt[]; trigger?: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useOpenState({ open: openProp, onOpenChange });
  const { pending, errors, onSubmit } = useFormAction(createInteraction, {
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  const formId = `interaction-${clientId}`;
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title="אינטראקציה עם הלקוח"
      description="שיחה, הודעה או פגישה — נשמר בהיסטוריה ומעדכן את תאריך הקשר האחרון."
      footer={
        <>
          <Button type="submit" form={formId} loading={pending} className="sm:min-w-28">שמירה</Button>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>ביטול</Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="client_id" value={clientId} />
        <FormGrid>
          <Field label="סוג" error={errors.kind}>
            {(p) => (
              <Select {...p} name="kind" defaultValue="phone">
                {interactionKind.list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="מתי" error={errors.occurred_at}>
            {(p) => <Input {...p} name="occurred_at" type="date" defaultValue={todayISO()} max={todayISO()} />}
          </Field>
        </FormGrid>
        <Field label="מה היה" required error={errors.summary}>
          {(p) => <Textarea {...p} name="summary" rows={3} autoFocus placeholder="לדוגמה: דיברנו על התמונות לעמוד הבית" />}
        </Field>
        <Field label="תוצאה" error={errors.result}>
          {(p) => <Input {...p} name="result" placeholder="לדוגמה: ישלח תמונות עד יום חמישי" />}
        </Field>
        <FormGrid>
          <Field label="הפעולה הבאה" error={errors.next_action}>
            {(p) => <Input {...p} name="next_action" placeholder="לדוגמה: לבקש שוב תמונות" />}
          </Field>
          <Field label="מעקב בתאריך" hint="אם ממלאים — נפתח מעקב שיופיע ב״היום״" error={errors.follow_up_date}>
            {(p) => <Input {...p} name="follow_up_date" type="date" min={todayISO()} />}
          </Field>
        </FormGrid>
        {projects.length > 0 && (
          <Field label="פרויקט" error={errors.project_id}>
            {(p) => (
              <Select {...p} name="project_id" defaultValue="">
                <option value="">כללי ללקוח</option>
                {projects.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </Field>
        )}
      </form>
    </Modal>
  );
}

/** A dated follow-up with an owner. Pre-filled reason/date when opened from an alert. */
export function FollowUpModal({
  clientId,
  clients,
  staff,
  defaultReason,
  defaultAssignee,
  defaultDays = 2,
  trigger,
  open: openProp,
  onOpenChange,
}: OpenProps & {
  clientId?: string;
  /** When no client is fixed, a picker is shown. */
  clients?: Opt[];
  staff: Opt[];
  defaultReason?: string;
  defaultAssignee?: string;
  defaultDays?: number;
  trigger?: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useOpenState({ open: openProp, onOpenChange });
  const { pending, errors, onSubmit } = useFormAction(createFollowUp, {
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  const formId = `followup-${clientId ?? "any"}`;
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      size="sm"
      title="קביעת מעקב"
      description="ביום שנקבע — המעקב יופיע ב״היום״ של מי שאחראי עליו."
      footer={
        <>
          <Button type="submit" form={formId} loading={pending} className="sm:min-w-28">קביעת מעקב</Button>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>ביטול</Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {clientId ? (
          <input type="hidden" name="client_id" value={clientId} />
        ) : (
          <Field label="לקוח" required error={errors.client_id}>
            {(p) => (
              <Select {...p} name="client_id" defaultValue="">
                <option value="" disabled>בחירת לקוח</option>
                {(clients ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </Field>
        )}
        <Field label="סיבה" required error={errors.reason}>
          {(p) => <Input {...p} name="reason" defaultValue={defaultReason} autoFocus placeholder="לדוגמה: לבדוק אם קיבל את ההצעה" />}
        </Field>
        <FormGrid>
          <Field label="תאריך" required error={errors.due_date}>
            {(p) => <Input {...p} name="due_date" type="date" defaultValue={isoDateOffset(defaultDays)} min={todayISO()} />}
          </Field>
          <Field label="אחראי" error={errors.assigned_to}>
            {(p) => (
              <Select {...p} name="assigned_to" defaultValue={defaultAssignee ?? ""}>
                <option value="">לפי תחום האחריות</option>
                {staff.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </Field>
        </FormGrid>
        <Field label="הערה" error={errors.note}>
          {(p) => <Textarea {...p} name="note" rows={2} />}
        </Field>
      </form>
    </Modal>
  );
}
