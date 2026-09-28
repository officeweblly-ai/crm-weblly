"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, MoreHorizontal, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Confirm } from "@/components/ui/confirm";
import { Field, FormGrid, Input, LtrInput, Select, Textarea } from "@/components/ui/field";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { createReference, deleteReference, updateReference } from "@/lib/actions/project-hub";
import { referenceCategory, type ReferenceCategory } from "@/lib/domain/labels";
import { displayUrl } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";
import { useOpenState, type OpenProps } from "@/lib/use-open";
import type { Tables } from "@/lib/supabase/database.types";

type RefRow = Tables<"project_references">;

function ReferenceFormModal({ projectId, reference, trigger, open: openProp, onOpenChange }: OpenProps & { projectId: string; reference?: RefRow; trigger?: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useOpenState({ open: openProp, onOpenChange });
  const action = reference ? updateReference.bind(null, reference.id) : createReference;
  const { pending, errors, onSubmit } = useFormAction(action, {
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  const formId = reference ? `ref-${reference.id}` : `ref-new-${projectId}`;
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={reference ? "עריכת רפרנס" : "רפרנס חדש"}
      size="sm"
      footer={
        <>
          <Button type="submit" form={formId} loading={pending}>{reference ? "שמירה" : "הוספה"}</Button>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>ביטול</Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="project_id" value={projectId} />
        <FormGrid>
          <Field label="שם הרפרנס" required error={errors.title}>
            {(p) => <Input {...p} name="title" defaultValue={reference?.title ?? ""} placeholder="לדוגמה: Hero של Linear" autoFocus={!reference} />}
          </Field>
          <Field label="קטגוריה" error={errors.category}>
            {(p) => (
              <Select {...p} name="category" defaultValue={reference?.category ?? "general"}>
                {referenceCategory.list.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
          </Field>
        </FormGrid>
        <Field label="כתובת (URL)" required error={errors.url}>
          {(p) => <LtrInput {...p} name="url" type="url" inputMode="url" defaultValue={reference?.url ?? ""} placeholder="https://" />}
        </Field>
        <Field label="מה אהבתי פה" error={errors.note}>
          {(p) => <Textarea {...p} name="note" defaultValue={reference?.note ?? ""} rows={3} placeholder="האנימציה של הכותרת, הצבעים, מבנה הכרטיסים…" />}
        </Field>
      </form>
    </Modal>
  );
}

function ReferenceItem({ reference }: { reference: RefRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const cat = reference.category as ReferenceCategory;
  return (
    <li className="group flex items-start gap-3 px-4 py-3 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <a href={reference.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-ink hover:text-accent">
            {reference.title}
            <ExternalLink className="size-3.5 text-ink-3" aria-hidden />
          </a>
          <Badge tone={referenceCategory.tone(cat)} className="h-5">{referenceCategory.label(cat)}</Badge>
        </div>
        <bdi dir="ltr" className="block truncate text-right font-mono text-xs text-ink-3">{displayUrl(reference.url)}</bdi>
        {reference.note && <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{reference.note}</p>}
      </div>
      <Menu
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`פעולות: ${reference.title}`} className="shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 sm:data-[state=open]:opacity-100">
            <MoreHorizontal />
          </Button>
        }
      >
        <MenuItem onSelect={() => setEditing(true)}><Pencil /> עריכה</MenuItem>
        <MenuItem destructive onSelect={() => setDeleting(true)}><Trash2 /> מחיקה</MenuItem>
      </Menu>
      <ReferenceFormModal projectId={reference.project_id} reference={reference} open={editing} onOpenChange={setEditing} />
      <Confirm open={deleting} onOpenChange={setDeleting} title="מחיקת רפרנס" description={<>הרפרנס &quot;{reference.title}&quot; יימחק.</>} confirmLabel="מחיקה" action={() => deleteReference(reference.id)} onDone={() => router.refresh()} />
    </li>
  );
}

/**
 * Inspiration as links (the reference *files* stay in the files area under
 * "רפרנסים"). Grouped by category so the AI handoff and the designer read the
 * same structure.
 */
export function ProjectReferencesCard({ projectId, references, referenceFiles }: { projectId: string; references: RefRow[]; referenceFiles: number }) {
  const groups = referenceCategory.list.map((c) => ({ ...c, items: references.filter((r) => r.category === c.value) })).filter((g) => g.items.length);
  return (
    <Card id="references" className="scroll-mt-24">
      <CardHeader
        title="רפרנסים והשראה"
        description={referenceFiles > 0 ? `ועוד ${referenceFiles} קבצי רפרנס באזור הקבצים` : undefined}
        action={<ReferenceFormModal projectId={projectId} trigger={<Button size="sm" variant="secondary"><Plus aria-hidden />רפרנס</Button>} />}
      />
      {groups.length ? (
        <ul className="divide-y divide-line">
          {groups.flatMap((g) => g.items).map((r) => (
            <ReferenceItem key={r.id} reference={r} />
          ))}
        </ul>
      ) : (
        <div className="flex items-start gap-3 px-5 py-4 text-sm text-ink-3">
          <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>אתרים שאהבתם, מתחרים, אנימציות — עם הערה קצרה על מה אהבתם. נכנס אוטומטית גם לחבילת ה-AI.</p>
        </div>
      )}
    </Card>
  );
}
