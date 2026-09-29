"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Pencil, Plus, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { assignTeamRole, createTeamRole, deleteTeamRole, seedTeamRoles, updateTeamRole } from "@/lib/actions/team";
import { PERMISSIONS } from "@/lib/domain/permissions";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";

export type Role = { id: string; name: string; description: string | null; color: string; permissions: string[] };

const SWATCHES = ["#3346c4", "#1d7a52", "#9a5b00", "#b4333a", "#3b5f86", "#7a3db8", "#0f766e", "#454d5c"];

export function RoleFormModal({ role, trigger }: { role?: Role; trigger: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(role?.color ?? SWATCHES[0]);
  const action = role ? updateTeamRole.bind(null, role.id) : createTeamRole;
  const { pending, errors, onSubmit } = useFormAction(action, {
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  const formId = role ? `role-${role.id}` : "role-new";
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={role ? `עריכת תפקיד: ${role.name}` : "תפקיד חדש"}
      description="מה רואה מי שמחזיק בתפקיד. לקוחות, פרויקטים, משימות וקבצים פתוחים לכל הצוות תמיד."
      footer={
        <>
          <Button type="submit" form={formId} loading={pending} className="sm:min-w-32">{role ? "שמירה" : "יצירת תפקיד"}</Button>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>ביטול</Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <Field label="שם התפקיד" required error={errors.name}>
            {(p) => <Input {...p} name="name" defaultValue={role?.name} placeholder="מפתח/ת, מעצב/ת, מנהל/ת לקוחות…" autoFocus />}
          </Field>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink-2">צבע</legend>
            <input type="hidden" name="color" value={color} />
            <div className="flex flex-wrap gap-1.5">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`צבע ${c}`}
                  aria-pressed={color === c}
                  className={cn("grid size-8 place-items-center rounded-full ring-offset-2 transition-shadow", color === c && "ring-2 ring-ink/40")}
                  style={{ background: c }}
                >
                  {color === c && <Check className="size-4 text-white" aria-hidden />}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        <Field label="תיאור קצר" error={errors.description}>
          {(p) => <Input {...p} name="description" defaultValue={role?.description ?? ""} placeholder="למשל: אחראי על פיתוח והעלאה לאוויר" />}
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink-2">אזורים שהתפקיד יכול לפתוח</legend>
          <ul className="grid gap-2 sm:grid-cols-2">
            {PERMISSIONS.map((p) => (
              <li key={p.key}>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line px-3 py-2.5 has-[:checked]:border-accent/40 has-[:checked]:bg-accent-soft/50">
                  <input type="checkbox" name="permissions" value={p.key} defaultChecked={role ? role.permissions.includes(p.key) : false} className="mt-0.5 size-4 accent-[var(--accent)]" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{p.label}</span>
                    <span className="block text-xs text-ink-3">{p.hint}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      </form>
    </Modal>
  );
}

export function RoleList({ roles, holders, isOwner }: { roles: Role[]; holders: Record<string, string[]>; isOwner: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [deleting, setDeleting] = useState<Role | null>(null);

  if (!roles.length) {
    return (
      <div className="flex flex-col items-start gap-3 px-4 py-5 sm:px-5">
        <p className="max-w-prose text-sm text-ink-2">
          עוד אין תפקידים — כרגע לכולם יש גישה מלאה. מגדירים תפקיד (מפתח, מעצבת, מכירות…) ובוחרים אילו אזורים הוא רואה.
        </p>
        {isOwner && (
          <div className="flex flex-wrap gap-2">
            <RoleFormModal trigger={<Button size="sm"><Plus aria-hidden />תפקיד חדש</Button>} />
            <Button
              size="sm"
              variant="secondary"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const r = await seedTeamRoles();
                  if (r.ok) {
                    toast.success(r.message);
                    router.refresh();
                  } else toast.error(r.error);
                })
              }
            >
              <Sparkles aria-hidden />
              תפקידים לדוגמה
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y divide-line">
        {roles.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-start sm:gap-4 sm:px-5">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="mt-1 size-3 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-ink">{r.name}</span>
                  {holders[r.id]?.length ? <span className="text-xs text-ink-3">{holders[r.id].join(", ")}</span> : <span className="text-xs text-ink-3">אף אחד עדיין</span>}
                </div>
                {r.description && <p className="text-sm text-ink-2">{r.description}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {PERMISSIONS.map((p) => {
                    const on = r.permissions.includes(p.key);
                    return (
                      <span key={p.key} className={cn("rounded-full border px-2 py-0.5 text-xs", on ? "border-transparent bg-ok-soft text-ok" : "border-line text-ink-3 line-through decoration-ink-3/40")}>
                        {p.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
            {isOwner && (
              <div className="flex shrink-0 gap-1.5 self-end sm:self-start">
                <RoleFormModal role={r} trigger={<Button size="sm" variant="secondary"><Pencil aria-hidden />עריכה</Button>} />
                <Button size="icon" variant="ghost" aria-label={`מחיקת ${r.name}`} onClick={() => setDeleting(r)}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {isOwner && (
        <div className="border-t border-line px-4 py-3 sm:px-5">
          <RoleFormModal trigger={<Button size="sm" variant="secondary"><Plus aria-hidden />תפקיד חדש</Button>} />
        </div>
      )}
      <Confirm
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`מחיקת התפקיד "${deleting?.name ?? ""}"`}
        description="מי שמחזיק בתפקיד יקבל גישה מלאה עד שיוגדר לו תפקיד אחר."
        confirmLabel="מחיקה"
        action={() => deleteTeamRole(deleting!.id)}
        onDone={() => router.refresh()}
      />
    </>
  );
}

/** Owner picks a person's role right in the member row. */
export function MemberRoleSelect({ userId, roleId, roles, disabled }: { userId: string; roleId: string | null; roles: Role[]; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <ShieldCheck className="size-4 shrink-0 text-ink-3" aria-hidden />
      <span className="sr-only">תפקיד</span>
      <select
        value={roleId ?? ""}
        disabled={disabled || pending}
        onChange={(e) =>
          start(async () => {
            const r = await assignTeamRole(userId, e.target.value || null);
            if (r.ok) {
              toast.success(r.message);
              router.refresh();
            } else toast.error(r.error);
          })
        }
        className="h-9 min-w-0 rounded-md border border-line-strong bg-surface px-2 text-sm disabled:opacity-60"
      >
        <option value="">גישה מלאה (ללא תפקיד)</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
    </label>
  );
}
