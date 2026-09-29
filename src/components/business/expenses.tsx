"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, MoreHorizontal, Paperclip, Pencil, Repeat, StopCircle, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Field, FormGrid, Input, LtrInput, Select, Textarea } from "@/components/ui/field";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { FileUploader } from "@/components/files/file-uploader";
import { createExpense, deleteExpense, endRecurringExpense, updateExpense } from "@/lib/actions/business";
import { getFileUrl } from "@/lib/actions/files";
import { expenseCategory, expenseRecurring, paymentMethod, type ExpenseCategory, type ExpenseRecurring, type PaymentMethod } from "@/lib/domain/labels";
import { formatDate, formatMoney, todayISO } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";
import { useOpenState, type OpenProps } from "@/lib/use-open";

export type Expense = {
  id: string;
  spent_on: string;
  amount: number;
  vat_included: boolean;
  category: string;
  vendor: string | null;
  description: string;
  payment_method: string | null;
  recurring: string;
  ended_on: string | null;
  paid_by: string | null;
  project_id: string | null;
  file_id: string | null;
  notes: string | null;
  file_name?: string | null;
};

type Opt = { value: string; label: string };

export function ExpenseFormModal({
  expense,
  staff,
  projects,
  trigger,
  open: openProp,
  onOpenChange,
  defaultOpen,
  meId,
}: OpenProps & { expense?: Expense; staff: Opt[]; projects: Opt[]; trigger?: ReactNode; defaultOpen?: boolean; meId: string }) {
  const router = useRouter();
  const [open, setOpen] = useOpenState({ open: openProp, onOpenChange, defaultOpen });
  const [recurring, setRecurring] = useState(expense?.recurring ?? "none");
  const [file, setFile] = useState<{ id: string; name: string } | null>(expense?.file_id ? { id: expense.file_id, name: expense.file_name ?? "קבלה" } : null);
  const action = expense ? updateExpense.bind(null, expense.id) : createExpense;
  const { pending, errors, onSubmit } = useFormAction(action, {
    onSuccess: () => {
      setOpen(false);
      if (defaultOpen) router.replace("/business/expenses", { scroll: false });
      router.refresh();
    },
  });
  const formId = expense ? `exp-${expense.id}` : "exp-new";
  const close = (o: boolean) => {
    setOpen(o);
    if (!o && defaultOpen) router.replace("/business/expenses", { scroll: false });
  };

  return (
    <Modal
      open={open}
      onOpenChange={close}
      trigger={trigger}
      title={expense ? "עריכת הוצאה" : "הוצאה חדשה"}
      description={expense ? undefined : "מנוי חודשי נרשם פעם אחת — המערכת סופרת אותו בכל חודש עד שעוצרים."}
      footer={
        <>
          <Button type="submit" form={formId} loading={pending} className="sm:min-w-32">{expense ? "שמירה" : "רישום הוצאה"}</Button>
          <Button variant="secondary" onClick={() => close(false)} disabled={pending}>ביטול</Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="file_id" value={file?.id ?? ""} />
        <Field label="על מה" required error={errors.description}>
          {(p) => <Input {...p} name="description" defaultValue={expense?.description} placeholder="Figma, קמפיין אינסטגרם, מחשב…" autoFocus={!expense} />}
        </Field>
        <FormGrid>
          <Field label="סכום (₪)" required error={errors.amount}>
            {(p) => <LtrInput {...p} name="amount" inputMode="decimal" defaultValue={expense?.amount ?? ""} placeholder="0" />}
          </Field>
          <Field label="תאריך" required error={errors.spent_on}>
            {(p) => <Input {...p} name="spent_on" type="date" defaultValue={expense?.spent_on ?? todayISO()} />}
          </Field>
          <Field label="קטגוריה" error={errors.category}>
            {(p) => (
              <Select {...p} name="category" defaultValue={expense?.category ?? "software"}>
                {expenseCategory.list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="חוזר?" error={errors.recurring}>
            {(p) => (
              <Select {...p} name="recurring" value={recurring} onChange={(e) => setRecurring(e.target.value)}>
                {expenseRecurring.list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </Field>
          {recurring !== "none" && (
            <Field label="עד תאריך" hint="ריק = עד שעוצרים" error={errors.ended_on}>
              {(p) => <Input {...p} name="ended_on" type="date" defaultValue={expense?.ended_on ?? ""} />}
            </Field>
          )}
          <Field label="ספק" error={errors.vendor}>
            {(p) => <Input {...p} name="vendor" defaultValue={expense?.vendor ?? ""} />}
          </Field>
          <Field label="אמצעי תשלום" error={errors.payment_method}>
            {(p) => (
              <Select {...p} name="payment_method" defaultValue={expense?.payment_method ?? "credit_card"}>
                <option value="">—</option>
                {paymentMethod.list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="מי שילם" error={errors.paid_by}>
            {(p) => (
              <Select {...p} name="paid_by" defaultValue={expense?.paid_by ?? meId}>
                <option value="">חשבון העסק</option>
                {staff.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="קשור לפרויקט" hint="לא חובה — לחישוב רווחיות פרויקט" error={errors.project_id}>
            {(p) => (
              <Select {...p} name="project_id" defaultValue={expense?.project_id ?? ""}>
                <option value="">—</option>
                {projects.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="מע״מ" error={errors.vat_included}>
            {(p) => (
              <Select {...p} name="vat_included" defaultValue={expense?.vat_included === false ? "0" : "1"}>
                <option value="1">הסכום כולל מע״מ</option>
                <option value="0">לפני מע״מ / פטור</option>
              </Select>
            )}
          </Field>
        </FormGrid>
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-2">קבלה / חשבונית</p>
          {file ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-line bg-sunken/50 px-3 py-2 text-sm">
              <span className="inline-flex min-w-0 items-center gap-2"><Paperclip className="size-4 shrink-0 text-ink-3" aria-hidden /><span className="truncate">{file.name}</span></span>
              <Button type="button" size="icon" variant="ghost" aria-label="הסרת הקבלה" onClick={() => setFile(null)}><X aria-hidden /></Button>
            </div>
          ) : (
            <FileUploader compact category="invoices" multiple={false} hint="צילום או PDF — נשמר בקבצים תחת חשבוניות" onUploaded={(f) => setFile(f)} />
          )}
        </div>
        <Field label="הערות" error={errors.notes}>
          {(p) => <Textarea {...p} name="notes" defaultValue={expense?.notes ?? ""} rows={2} />}
        </Field>
      </form>
    </Modal>
  );
}

export function ExpenseRow({ e, staff, projects, payer, meId }: { e: Expense; staff: Opt[]; projects: Opt[]; payer: string | null; meId: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const recurring = e.recurring as ExpenseRecurring;
  const active = recurring !== "none" && (!e.ended_on || e.ended_on >= todayISO());
  const openFile = () =>
    start(async () => {
      if (!e.file_id) return;
      const r = await getFileUrl(e.file_id);
      if (r.ok) window.open(r.data.url, "_blank", "noopener");
      else toast.error(r.error);
    });
  const stop = () =>
    start(async () => {
      const r = await endRecurringExpense(e.id);
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <li className="flex items-start gap-3 px-4 py-3 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-ink">{e.description}</span>
          {recurring !== "none" && (
            <span className="inline-flex items-center gap-1 text-xs text-ink-3">
              <Repeat className="size-3.5" aria-hidden />
              {expenseRecurring.label(recurring)}
              {!active && " · הופסק"}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-ink-3">
          {[formatDate(e.spent_on), e.vendor, e.payment_method ? paymentMethod.label(e.payment_method as PaymentMethod) : null, payer ? `שילם/ה: ${payer}` : null].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Badge tone={expenseCategory.tone(e.category as ExpenseCategory)} dot={false}>{expenseCategory.label(e.category as ExpenseCategory)}</Badge>
          {e.file_id && (
            <button type="button" onClick={openFile} disabled={pending} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
              <FileText className="size-3.5" aria-hidden /> קבלה
            </button>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className="text-sm font-semibold text-ink"><bdi className="num">{formatMoney(e.amount)}</bdi></span>
        <Menu trigger={<Button variant="ghost" size="icon" aria-label="פעולות להוצאה"><MoreHorizontal /></Button>}>
          <MenuItem onSelect={() => setEditing(true)}><Pencil /> עריכה</MenuItem>
          {active && <MenuItem onSelect={stop}><StopCircle /> הפסקת המנוי מהיום</MenuItem>}
          <MenuSeparator />
          <MenuItem destructive onSelect={() => setConfirm(true)}><Trash2 /> מחיקה</MenuItem>
        </Menu>
      </div>
      <ExpenseFormModal expense={e} staff={staff} projects={projects} open={editing} onOpenChange={setEditing} meId={meId} />
      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title="מחיקת ההוצאה"
        description={recurring !== "none" ? "מחיקה תסיר את המנוי גם מהחודשים הקודמים. כדי לשמור היסטוריה — עדיף 'הפסקת המנוי'." : `"${e.description}" תימחק.`}
        confirmLabel="מחיקה"
        action={() => deleteExpense(e.id)}
        onDone={() => router.refresh()}
      />
    </li>
  );
}
