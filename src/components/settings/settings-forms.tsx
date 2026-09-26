"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FormGrid, Input, LtrInput, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { addTeamMember, changeMyPassword, clearDemoData, setMemberAccess, updateMyProfile, updateWorkspace } from "@/lib/actions/settings";
import { Confirm } from "@/components/ui/confirm";
import { useFormAction } from "@/lib/use-form-action";
import type { Tables } from "@/lib/supabase/database.types";

export function WorkspaceForm({ settings, canEdit }: { settings: Tables<"workspace_settings">; canEdit: boolean }) {
  const router = useRouter();
  const { pending, errors, onSubmit } = useFormAction(updateWorkspace, { onSuccess: () => router.refresh() });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <fieldset disabled={!canEdit} className="flex flex-col gap-4">
        <FormGrid>
          <Field label="שם העסק" required hint="מופיע בראש המערכת ובשאלונים שהלקוחות ממלאים." error={errors.business_name}>
            {(p) => <Input {...p} name="business_name" defaultValue={settings.business_name} />}
          </Field>
          <div />
          <Field label="טלפון ליצירת קשר" error={errors.contact_phone}>
            {(p) => <LtrInput {...p} name="contact_phone" type="tel" defaultValue={settings.contact_phone ?? ""} />}
          </Field>
          <Field label="אימייל ליצירת קשר" error={errors.contact_email}>
            {(p) => <LtrInput {...p} name="contact_email" type="email" defaultValue={settings.contact_email ?? ""} />}
          </Field>
        </FormGrid>
        <FormGrid>
          <Field label="שם משפטי (להסכמים)" hint="כפי שמופיע ברשם — מודפס בראש כל הסכם" error={errors.legal_name}>
            {(p) => <Input {...p} name="legal_name" defaultValue={settings.legal_name ?? ""} />}
          </Field>
          <Field label="ח.פ / ע.מ" error={errors.business_id}>
            {(p) => <LtrInput {...p} name="business_id" defaultValue={settings.business_id ?? ""} />}
          </Field>
          <Field label="כתובת העסק" error={errors.address}>
            {(p) => <Input {...p} name="address" defaultValue={settings.address ?? ""} />}
          </Field>
          <Field label="שם החותם מטעם הסטודיו" error={errors.signatory_name}>
            {(p) => <Input {...p} name="signatory_name" defaultValue={settings.signatory_name ?? ""} />}
          </Field>
        </FormGrid>
        <Field label="טקסט פתיחה בשאלון" required hint="הלקוח רואה אותו במסך הפתיחה של כל שאלון." error={errors.form_intro}>
          {(p) => <Textarea {...p} name="form_intro" rows={4} defaultValue={settings.form_intro} />}
        </Field>
      </fieldset>
      {canEdit ? (
        <Button type="submit" loading={pending} className="self-start">שמירת הגדרות</Button>
      ) : (
        <p className="text-sm text-ink-3">רק בעל החשבון יכול לשנות את הגדרות העסק.</p>
      )}
    </form>
  );
}

export function ProfileForm({ profile }: { profile: Tables<"profiles"> }) {
  const router = useRouter();
  const { pending, errors, onSubmit } = useFormAction(updateMyProfile, { onSuccess: () => router.refresh() });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end" noValidate>
      <Field label="השם שלך" required error={errors.full_name} className="flex-1">
        {(p) => <Input {...p} name="full_name" defaultValue={profile.full_name} autoComplete="name" />}
      </Field>
      <Button type="submit" loading={pending}>שמירה</Button>
    </form>
  );
}

const roleLabel = { owner: "בעלים", admin: "מנהל", member: "צוות" } as const;

export function TeamList({ members, meId, isOwner }: { members: Tables<"profiles">[]; meId: string; isOwner: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const toggle = (m: Tables<"profiles">) =>
    start(async () => {
      const r = await setMemberAccess(m.id, { is_active: !m.is_active });
      if (r.ok) {
        toast.success(r.message ?? "עודכן");
        router.refresh();
      } else toast.error(r.error);
    });
  return (
    <ul className="divide-y divide-line">
      {members.map((m) => (
        <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-ink">
              {m.full_name || "ללא שם"}
              {m.id === meId && <span className="text-xs font-normal text-ink-3">(את/ה)</span>}
            </div>
            <div className="font-mono text-xs text-ink-3" dir="ltr" style={{ textAlign: "right" }}>{m.email}</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={m.role === "owner" ? "accent" : "neutral"} dot={false}>{roleLabel[m.role]}</Badge>
            {m.is_active ? <Badge tone="ok">פעיל</Badge> : <Badge tone="warn">ממתין לאישור</Badge>}
            {isOwner && m.id !== meId && m.role !== "owner" && (
              <Button size="sm" variant={m.is_active ? "secondary" : "primary"} loading={pending} onClick={() => toggle(m)}>
                {m.is_active ? "השבתה" : "הפעלה"}
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AddMemberForm() {
  const router = useRouter();
  const { pending, errors, onSubmit } = useFormAction(addTeamMember, {
    onSuccess: () => router.refresh(),
  });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 border-t border-line pt-4" noValidate>
      <h3 className="text-sm font-semibold text-ink">הוספת שותף/ה או עובד/ת</h3>
      <FormGrid>
        <Field label="שם" required error={errors.full_name}>
          {(p) => <Input {...p} name="full_name" autoComplete="off" />}
        </Field>
        <Field label="אימייל" required error={errors.email}>
          {(p) => <LtrInput {...p} name="email" type="email" autoComplete="off" />}
        </Field>
        <Field label="סיסמה זמנית" required hint="מעבירים אותה באופן אישי, ואחרי הכניסה הראשונה מחליפים אותה בהגדרות." error={errors.password}>
          {(p) => <LtrInput {...p} name="password" type="text" autoComplete="new-password" />}
        </Field>
        <Field label="הרשאה" error={errors.role}>
          {(p) => (
            <select {...p} name="role" defaultValue="admin" className="h-10 rounded-md border border-line-strong bg-surface px-3 text-base">
              <option value="admin">מנהל/ת — גישה מלאה לנתונים</option>
              <option value="member">צוות — גישה מלאה לנתונים</option>
            </select>
          )}
        </Field>
      </FormGrid>
      <Button type="submit" loading={pending} className="self-start">הוספה לצוות</Button>
    </form>
  );
}

export function PasswordForm() {
  const formId = "pw-form";
  const { pending, errors, onSubmit } = useFormAction(changeMyPassword, {
    onSuccess: () => (document.getElementById(formId) as HTMLFormElement | null)?.reset(),
  });
  return (
    <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4 border-t border-line pt-4 sm:flex-row sm:items-end" noValidate>
      <Field label="סיסמה חדשה" error={errors.password} className="flex-1">
        {(p) => <Input {...p} name="password" type="password" autoComplete="new-password" />}
      </Field>
      <Field label="אימות סיסמה" error={errors.confirm} className="flex-1">
        {(p) => <Input {...p} name="confirm" type="password" autoComplete="new-password" />}
      </Field>
      <Button type="submit" variant="secondary" loading={pending}>שינוי סיסמה</Button>
    </form>
  );
}

export function ClearDemoButton() {
  const router = useRouter();
  return (
    <Confirm
      trigger={<Button variant="danger-ghost">מחיקת נתוני הדמו</Button>}
      title="מחיקת נתוני הדמו"
      description="כל הלקוחות, הלידים, הפרויקטים, התשלומים והשאלונים שמסומנים כ'נתוני דמו' יימחקו. הנתונים האמיתיים שלך והתבניות לא ייפגעו."
      confirmLabel="מחיקה"
      action={clearDemoData}
      onDone={() => router.refresh()}
    />
  );
}
