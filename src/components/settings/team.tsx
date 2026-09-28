"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Clock, MoreHorizontal, Pencil, Phone, Plus, Sparkles, Sun, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Checkbox, Field, FormGrid, Input, LtrInput, Select, Textarea } from "@/components/ui/field";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import {
  assignResponsibility,
  createResponsibility,
  deleteResponsibility,
  seedResponsibilities,
  toggleResponsibility,
  updateMemberProfile,
  updateResponsibility,
} from "@/lib/actions/team";
import { daysSummary, WEEKDAYS, WEEKDAY_NAMES, workCategory, type WorkCategory } from "@/lib/domain/labels";
import { formatPhone } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";
import { useOpenState, type OpenProps } from "@/lib/use-open";
import { cn } from "@/lib/utils";
import type { Tables } from "@/lib/supabase/database.types";

type Member = Tables<"profiles">;
type Responsibility = Tables<"team_responsibilities">;

const COLORS = ["#3346c4", "#1d7a52", "#9a5b00", "#b4333a", "#3b5f86", "#7a4bb3"];
const roleLabel = { owner: "בעלים", admin: "שותף/ה · מנהל/ת", member: "צוות" } as const;

// ===========================================================================
// Partner profile
// ===========================================================================
function MemberModal({ member, trigger, open: openProp, onOpenChange }: OpenProps & { member: Member; trigger?: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useOpenState({ open: openProp, onOpenChange });
  const [color, setColor] = useState(member.avatar_color ?? COLORS[0]);
  const { pending, errors, onSubmit } = useFormAction(updateMemberProfile.bind(null, member.id), {
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  const formId = `member-${member.id}`;
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={member.full_name || member.email}
      description="ימי העבודה ושעת סיכום הבוקר קובעים מתי תגיע התראת הבוקר."
      footer={
        <>
          <Button type="submit" form={formId} loading={pending} className="sm:min-w-28">שמירה</Button>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>ביטול</Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <FormGrid>
          <Field label="שם" required error={errors.full_name}>
            {(p) => <Input {...p} name="full_name" defaultValue={member.full_name} autoComplete="name" />}
          </Field>
          <Field label="תפקיד" error={errors.job_title}>
            {(p) => <Input {...p} name="job_title" defaultValue={member.job_title ?? ""} placeholder="לדוגמה: שותף — פיתוח" />}
          </Field>
          <Field label="טלפון" error={errors.phone}>
            {(p) => <LtrInput {...p} name="phone" type="tel" defaultValue={member.phone ?? ""} />}
          </Field>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink-2">צבע</legend>
            <input type="hidden" name="avatar_color" value={color} />
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`צבע ${c}`}
                  aria-pressed={color === c}
                  className={cn("size-9 rounded-full ring-offset-2 ring-offset-surface transition-shadow", color === c && "ring-2 ring-ink")}
                  style={{ background: c }}
                />
              ))}
            </div>
          </fieldset>
        </FormGrid>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink-2">ימי עבודה</legend>
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((d, i) => (
              <label key={i} className="relative">
                <input type="checkbox" name="working_days[]" value={i} defaultChecked={member.working_days.includes(i)} className="peer sr-only" />
                <span
                  className="grid h-11 cursor-pointer place-items-center rounded-md border border-line-strong text-sm font-medium text-ink-2 transition-colors peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent-ink peer-focus-visible:ring-3 peer-focus-visible:ring-accent/30"
                  title={WEEKDAY_NAMES[i]}
                >
                  {d}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-3">ביום שאינו יום עבודה לא נשלח סיכום בוקר.</p>
        </fieldset>

        <FormGrid className="sm:grid-cols-3">
          <Field label="סיכום בוקר בשעה" required error={errors.morning_time}>
            {(p) => <Input {...p} name="morning_time" type="time" step={900} defaultValue={member.morning_time.slice(0, 5)} />}
          </Field>
          <Field label="תחילת יום (לא חובה)" error={errors.work_start}>
            {(p) => <Input {...p} name="work_start" type="time" step={900} defaultValue={member.work_start?.slice(0, 5) ?? ""} />}
          </Field>
          <Field label="סוף יום (לא חובה)" error={errors.work_end}>
            {(p) => <Input {...p} name="work_end" type="time" step={900} defaultValue={member.work_end?.slice(0, 5) ?? ""} />}
          </Field>
        </FormGrid>
      </form>
    </Modal>
  );
}

export function MemberCard({ member, responsibilities, canEdit, isMe }: { member: Member; responsibilities: Responsibility[]; canEdit: boolean; isMe: boolean }) {
  const [editing, setEditing] = useState(false);
  const color = member.avatar_color ?? undefined;
  const mine = responsibilities.filter((r) => r.assigned_to === member.id && r.is_active);
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="flex items-start gap-3">
        <span
          className="grid size-11 shrink-0 place-items-center rounded-full bg-sunken text-base font-semibold text-ink-2"
          style={color ? { background: `${color}1f`, color } : undefined}
          aria-hidden
        >
          {(member.full_name || member.email).slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-ink">{member.full_name || "ללא שם"}</span>
            {isMe && <span className="text-xs text-ink-3">(אני)</span>}
            {!member.is_active && <Badge tone="warn">לא פעיל</Badge>}
          </div>
          <p className="text-sm text-ink-2">{member.job_title || roleLabel[member.role]}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
            <span className="inline-flex items-center gap-1"><Sun className="size-3.5" aria-hidden />סיכום בוקר {member.morning_time.slice(0, 5)}</span>
            <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden />{daysSummary(member.working_days)}{member.work_start && member.work_end ? ` · ${member.work_start.slice(0, 5)}–${member.work_end.slice(0, 5)}` : ""}</span>
            {member.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3.5" aria-hidden /><bdi dir="ltr">{formatPhone(member.phone)}</bdi></span>}
          </div>
        </div>
        {canEdit && (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            עריכה
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {mine.length ? (
          mine.map((r) => (
            <Badge key={r.id} tone="accent" dot={false}>{r.title}</Badge>
          ))
        ) : (
          <span className="text-xs text-ink-3">עוד לא הוגדרו תחומי אחריות</span>
        )}
      </div>
      {canEdit && <MemberModal member={member} open={editing} onOpenChange={setEditing} />}
    </li>
  );
}

// ===========================================================================
// Responsibilities
// ===========================================================================
function ResponsibilityModal({
  responsibility,
  staff,
  trigger,
  open: openProp,
  onOpenChange,
}: OpenProps & { responsibility?: Responsibility; staff: { value: string; label: string }[]; trigger?: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useOpenState({ open: openProp, onOpenChange });
  const action = responsibility ? updateResponsibility.bind(null, responsibility.id) : createResponsibility;
  const { pending, errors, onSubmit } = useFormAction(action, {
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  const formId = responsibility ? `resp-${responsibility.id}` : "resp-new";
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={responsibility ? "עריכת תחום אחריות" : "תחום אחריות חדש"}
      description="התחום קובע למי יגיעו משימות, התראות והצעות מהסוג הזה. תמיד אפשר לשנות ידנית משימה בודדת."
      footer={
        <>
          <Button type="submit" form={formId} loading={pending} className="sm:min-w-28">{responsibility ? "שמירה" : "הוספה"}</Button>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>ביטול</Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="שם התחום" required error={errors.title}>
          {(p) => <Input {...p} name="title" defaultValue={responsibility?.title} autoFocus placeholder="לדוגמה: תקשורת עם לקוחות" />}
        </Field>
        <FormGrid>
          <Field label="סוג העבודה" hint="לפיו המערכת משייכת משימות והתראות" error={errors.category}>
            {(p) => (
              <Select {...p} name="category" defaultValue={responsibility?.category ?? "client_communication"}>
                {workCategory.list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="אחראי/ת" error={errors.assigned_to}>
            {(p) => (
              <Select {...p} name="assigned_to" defaultValue={responsibility?.assigned_to ?? ""}>
                <option value="">טרם נקבע</option>
                {staff.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </Field>
        </FormGrid>
        <Field label="תיאור" error={errors.description}>
          {(p) => <Textarea {...p} name="description" rows={2} defaultValue={responsibility?.description ?? ""} placeholder="מה בדיוק כולל התחום" />}
        </Field>
        {responsibility && <Checkbox name="is_active" defaultChecked={responsibility.is_active} label="פעיל" />}
      </form>
    </Modal>
  );
}

function ResponsibilityRow({ r, staff }: { r: Responsibility; staff: { value: string; label: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        if (res.message) toast.success(res.message);
        router.refresh();
      } else toast.error(res.error ?? "הפעולה נכשלה");
    });
  return (
    <li className={cn("flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5", !r.is_active && "opacity-60", pending && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ink">{r.title}</span>
          <span className="text-xs text-ink-3">{workCategory.label(r.category as WorkCategory)}</span>
          {!r.is_active && <Badge tone="neutral">מושבת</Badge>}
        </div>
        {r.description && <p className="mt-0.5 line-clamp-2 text-xs text-ink-3">{r.description}</p>}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:w-44 sm:flex-none">
          <select
            aria-label={`אחראי/ת: ${r.title}`}
            value={r.assigned_to ?? ""}
            disabled={pending}
            onChange={(e) => run(() => assignResponsibility(r.id, e.target.value || null))}
            className={cn(
              "h-10 w-full appearance-none rounded-md border ps-3 pe-8 text-sm focus:outline-none focus:ring-3 focus:ring-accent/20",
              r.assigned_to ? "border-line-strong bg-surface text-ink" : "border-warn/30 bg-warn-soft text-warn",
            )}
          >
            <option value="">טרם נקבע</option>
            {staff.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 opacity-60" aria-hidden />
        </div>
        <Menu trigger={<Button variant="ghost" size="icon" aria-label={`פעולות: ${r.title}`}><MoreHorizontal /></Button>}>
          <MenuItem onSelect={() => setDialog("edit")}><Pencil /> עריכה</MenuItem>
          <MenuItem onSelect={() => run(() => toggleResponsibility(r.id, !r.is_active))}>{r.is_active ? "השבתה" : "הפעלה"}</MenuItem>
          <MenuSeparator />
          <MenuItem destructive onSelect={() => setDialog("delete")}><Trash2 /> מחיקה</MenuItem>
        </Menu>
      </div>
      <ResponsibilityModal responsibility={r} staff={staff} open={dialog === "edit"} onOpenChange={(o) => setDialog(o ? "edit" : null)} />
      <Confirm
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="מחיקת תחום אחריות"
        description={<>התחום &quot;{r.title}&quot; יימחק. משימות קיימות לא ישתנו.</>}
        confirmLabel="מחיקה"
        action={() => deleteResponsibility(r.id)}
        onDone={() => router.refresh()}
      />
    </li>
  );
}

export function Responsibilities({ items, staff }: { items: Responsibility[]; staff: { value: string; label: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const seed = () =>
    start(async () => {
      const r = await seedResponsibilities();
      if (r.ok) {
        toast.success(r.message ?? "נוסף");
        router.refresh();
      } else toast.error(r.error);
    });
  const unassigned = items.filter((r) => r.is_active && !r.assigned_to).length;
  return (
    <>
      {items.length ? (
        <>
          {unassigned > 0 && (
            <p className="border-b border-line bg-warn-soft/50 px-5 py-2 text-xs text-warn">
              {unassigned === 1 ? "תחום אחד עוד בלי אחראי" : `${unassigned} תחומים עוד בלי אחראי`} — עבודה מהסוג הזה תוצג לשני השותפים.
            </p>
          )}
          <ul className="divide-y divide-line">
            {items.map((r) => (
              <ResponsibilityRow key={r.id} r={r} staff={staff} />
            ))}
          </ul>
        </>
      ) : (
        <div className="flex flex-col items-start gap-3 px-5 py-5">
          <p className="text-sm text-ink-2">עוד אין תחומי אחריות. אפשר להתחיל מרשימה מוכנה (פיתוח, תקשורת עם לקוחות, הצעות מחיר, חוזים, גבייה…) ולשייך כל תחום לשותף.</p>
          <Button size="sm" onClick={seed} loading={pending}>
            <Sparkles aria-hidden />
            רשימת התחלה
          </Button>
        </div>
      )}
      <div className="border-t border-line px-4 py-3 sm:px-5">
        <ResponsibilityModal staff={staff} trigger={<Button size="sm" variant="secondary"><Plus aria-hidden />תחום אחריות</Button>} />
      </div>
    </>
  );
}
